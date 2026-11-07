"""Deploy items in ../fabric_src to a target Microsoft Fabric workspace.

Follows the fabric-cicd library usage:
    https://microsoft.github.io/fabric-cicd/latest/

Required environment variables:
    FABRIC_WORKSPACE_ID   - GUID of the target Fabric workspace.

Optional environment variables:
    FABRIC_ENVIRONMENT       - parameter.yml environment key (default: DEV).
    FABRIC_DEBUG             - set to "true" for DEBUG logging.
    FABRIC_UNPUBLISH_ORPHANS - set to "true" to remove items in the target
                               workspace that no longer exist in the repo.
    FABRIC_RUN_PIPELINE      - display name of a DataPipeline to run once the
                               deployment finishes (e.g. AI_Control_Tower_Pipeline).
    FABRIC_RUN_PIPELINE_WAIT - seconds to wait for that run to finish before
                               returning (default 0 = trigger and exit).

Writes ignored src/fabric_app/.fabric-bindings.json for script/04_deploy_rayfin.ps1.
The checked-in DataAgent includes its published stage and uses the deployed model.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

from dotenv import dotenv_values
from azure.identity import AzureCliCredential
from fabric_cicd import (
    FabricWorkspace,
    append_feature_flag,
    change_log_level,
    publish_all_items,
    unpublish_all_orphan_items,
)

# Environment-specific files override the base file, not explicit process settings.
_env_dir = Path(__file__).resolve().parent
_env_base = dotenv_values(_env_dir / ".env")
_env_name = (os.environ.get("FABRIC_ENVIRONMENT") or _env_base.get("FABRIC_ENVIRONMENT") or "DEV").lower()
_env_overlay = _env_dir / f".env.{_env_name}"
for _name, _value in {**_env_base, **dotenv_values(_env_overlay)}.items():
    if _value is not None:
        os.environ.setdefault(_name, _value)

# Item types present under ../fabric_src
ITEM_TYPES_IN_SCOPE = [
    "Lakehouse",
    "Notebook",
    "DataPipeline",
    "KQLQueryset",
    "KQLDashboard",
    "SemanticModel",
    "Report",
    "UserDataFunction",
    "DataAgent",
]

APP_BINDINGS_PATH = _env_dir.parent / "src" / "fabric_app" / ".fabric-bindings.json"

# Env vars referenced from parameter.yml as $ENV:NAME. fabric-cicd v1.0.0 only
# picks up OS env vars whose names literally start with "$ENV:", so deploy.py
# re-exports these under that prefixed name at runtime.
PARAMETERIZED_ENV_VARS = [
    "FABRIC_WORKSPACE_NAME",
    "FABRIC_RESOURCE_GROUP",
    "FABRIC_SUBSCRIPTION_ID",
    "FABRIC_LAW_NAME",
    "FABRIC_AI_NAME",
    "FABRIC_STORAGE_ACCOUNT",
    "FABRIC_ADLS_CONNECTION_ID",
]

# Terminal states returned by GET on a Fabric job instance.
JOB_TERMINAL_STATES = ("Completed", "Failed", "Cancelled", "Deduped")


def write_app_bindings(workspace: FabricWorkspace, workspace_id: str) -> None:
    workspace._refresh_deployed_items()
    model = workspace.workspace_items.get("SemanticModel", {}).get("AI_Control_Tower")
    agent = workspace.workspace_items.get("DataAgent", {}).get("Data_Chat_Agent")
    if not model or not agent:
        raise RuntimeError("The deployed semantic model and data agent are required for app configuration.")
    APP_BINDINGS_PATH.write_text(
        json.dumps({
            "workspaceId": workspace_id,
            "semanticModelId": model["id"],
            "dataAgentId": agent["id"],
        }, indent=2) + "\n",
        encoding="utf-8",
    )
    print("App bindings saved locally. Next: script/04_deploy_rayfin.ps1.")


def run_pipeline(workspace: FabricWorkspace, pipeline_name: str, wait_seconds: int) -> int:
    """Trigger an on-demand run of a deployed DataPipeline. Returns a process exit code."""
    # Repopulates workspace_items with the ids assigned during publish.
    workspace._refresh_deployed_items()
    pipeline = workspace.workspace_items.get("DataPipeline", {}).get(pipeline_name)
    if not pipeline:
        print(f"ERROR: DataPipeline '{pipeline_name}' not found in the target workspace.")
        return 1

    response = workspace.endpoint.invoke(
        method="POST",
        url=f"{workspace.base_api_url}/items/{pipeline['id']}/jobs/instances?jobType=Pipeline",
        # invoke() defaults body to the string "{}", which the job API rejects.
        body={},
        poll_long_running=False,
    )
    job_url = response["header"].get("Location")
    print(f"Triggered pipeline '{pipeline_name}' ({pipeline['id']}).")

    if wait_seconds <= 0 or not job_url:
        return 0

    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        job = workspace.endpoint.invoke(method="GET", url=job_url, body=None, poll_long_running=False)
        status = job["body"].get("status")
        if status in JOB_TERMINAL_STATES:
            print(f"Pipeline run finished with status: {status}")
            if status != "Completed":
                print(job["body"].get("failureReason", ""))
                return 1
            return 0
        time.sleep(15)

    print(f"WARNING: pipeline did not finish within {wait_seconds}s; it keeps running in Fabric.")
    return 0


def main() -> int:
    workspace_id = os.environ.get("FABRIC_WORKSPACE_ID")
    environment = os.environ.get("FABRIC_ENVIRONMENT", "DEV")

    if not workspace_id:
        print("ERROR: FABRIC_WORKSPACE_ID is required.")
        return 1

    repository_directory = str(
        (Path(__file__).resolve().parent.parent / "fabric_src")
    )

    if os.environ.get("FABRIC_DEBUG", "false").lower() == "true":
        change_log_level("DEBUG")

    # Lakehouse shortcuts (shortcuts.metadata.json) are not deployed by default.
    append_feature_flag("enable_shortcut_publish")

    # Allow parameter.yml replace_value entries to reference env vars via $ENV:NAME.
    # fabric-cicd looks up OS env vars whose names literally start with "$ENV:",
    # so re-export each PARAMETERIZED_ENV_VARS value under that prefixed name.
    append_feature_flag("enable_environment_variable_replacement")
    for name in PARAMETERIZED_ENV_VARS:
        value = os.environ.get(name)
        if value:
            os.environ[f"$ENV:{name}"] = value

    print(f"workspace_id : {workspace_id}")
    print(f"environment  : {environment}")
    print(f"repository   : {repository_directory}")
    print(f"item_types   : {ITEM_TYPES_IN_SCOPE}")

    target_workspace = FabricWorkspace(
        workspace_id=workspace_id,
        environment=environment,
        repository_directory=repository_directory,
        item_type_in_scope=ITEM_TYPES_IN_SCOPE,
        token_credential=AzureCliCredential(),
    )

    APP_BINDINGS_PATH.unlink(missing_ok=True)
    publish_all_items(target_workspace)

    if os.environ.get("FABRIC_UNPUBLISH_ORPHANS", "false").lower() == "true":
        # Adding DataAgent to the deployment must not delete manually managed agents.
        target_workspace._refresh_deployed_items()
        agent_names = target_workspace.workspace_items.get("DataAgent", {})
        exclude_agents = "|".join(f"^{re.escape(name)}$" for name in agent_names) or "^$"
        unpublish_all_orphan_items(target_workspace, item_name_exclude_regex=exclude_agents)

    write_app_bindings(target_workspace, workspace_id)
    print("Deployment complete.")

    pipeline_name = os.environ.get("FABRIC_RUN_PIPELINE", "").strip()
    if pipeline_name:
        wait_seconds = int(os.environ.get("FABRIC_RUN_PIPELINE_WAIT", "0"))
        return run_pipeline(target_workspace, pipeline_name, wait_seconds)

    return 0


if __name__ == "__main__":
    sys.exit(main())
