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

load_dotenv(Path(__file__).resolve().parent / ".env")

# Item types present under ../fabric_cicd
ITEM_TYPES_IN_SCOPE = [
    "Lakehouse",
    "Notebook",
    "KQLQueryset",
    "KQLDashboard",
    "SemanticModel",
    "Report",
]


def main() -> int:
    workspace_id = os.environ.get("FABRIC_WORKSPACE_ID")
    environment = os.environ.get("FABRIC_ENVIRONMENT", "DEV")

    if not workspace_id:
        print("ERROR: FABRIC_WORKSPACE_ID is required.")
        return 1

    repository_directory = str(
        (Path(__file__).resolve().parent.parent / "fabric_cicd")
    )

    if os.environ.get("FABRIC_DEBUG", "false").lower() == "true":
        change_log_level("DEBUG")

    # Lakehouse shortcuts (shortcuts.metadata.json) are not deployed by default.
    append_feature_flag("enable_shortcut_publish")

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
