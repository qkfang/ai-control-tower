"""Deploy items in ../fabric_cicd to a target Microsoft Fabric workspace.

Follows the fabric-cicd library usage:
    https://microsoft.github.io/fabric-cicd/latest/

Required environment variables:
    FABRIC_WORKSPACE_ID   - GUID of the target Fabric workspace.

Optional environment variables:
    FABRIC_ENVIRONMENT       - parameter.yml environment key (default: DEV).
    FABRIC_DEBUG             - set to "true" for DEBUG logging.
    FABRIC_UNPUBLISH_ORPHANS - set to "true" to remove items in the target
                               workspace that no longer exist in the repo.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from azure.identity import AzureCliCredential
from fabric_cicd import (
    FabricWorkspace,
    append_feature_flag,
    change_log_level,
    publish_all_items,
    unpublish_all_orphan_items,
)

# Load base .env, then overlay .env.<environment> (lowercased) if present.
# The per-environment file takes precedence so the same parameter.yml can be
# reused across DEV / PPE / PROD by only swapping .env files.
_env_dir = Path(__file__).resolve().parent
load_dotenv(_env_dir / ".env")
_env_name = os.environ.get("FABRIC_ENVIRONMENT", "DEV").lower()
_env_overlay = _env_dir / f".env.{_env_name}"
if _env_overlay.exists():
    load_dotenv(_env_overlay, override=True)
    print(f"loaded overlay: {_env_overlay.name}")

# Item types present under ../fabric_cicd
ITEM_TYPES_IN_SCOPE = [
    "Lakehouse",
    "Notebook",
    "KQLQueryset",
    "KQLDashboard",
    "SemanticModel",
    "Report",
]

# Env vars referenced from parameter.yml as $ENV:NAME. fabric-cicd v1.0.0 only
# picks up OS env vars whose names literally start with "$ENV:", so deploy.py
# re-exports these under that prefixed name at runtime.
PARAMETERIZED_ENV_VARS = [
    "FABRIC_RESOURCE_GROUP",
    "FABRIC_SUBSCRIPTION_ID",
    "FABRIC_LAW_NAME",
    "FABRIC_AI_NAME",
]


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

    publish_all_items(target_workspace)

    if os.environ.get("FABRIC_UNPUBLISH_ORPHANS", "false").lower() == "true":
        unpublish_all_orphan_items(target_workspace)

    print("Deployment complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
