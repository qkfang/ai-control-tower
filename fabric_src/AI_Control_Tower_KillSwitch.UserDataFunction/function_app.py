import logging

import fabric.functions as fn
import requests
from azure.identity import DefaultAzureCredential

udf = fn.UserDataFunctions()

# Agent 365 block API (Microsoft Graph beta). Requires CopilotPackages.ReadWrite.All and an
# admin role (e.g. AI Administrator). Application permissions are not supported yet, so the
# signed-in identity used by DefaultAzureCredential must be a delegated admin user.
AGENT365_BASE_URL = "https://graph.microsoft.com/beta/copilot/admin/catalog/packages"
AGENT365_SCOPE = "https://graph.microsoft.com/.default"


@udf.function()
def kill_agent(agentId: str) -> dict:
    """Blocks the given agent (copilot package) through the Agent 365 API."""
    if not agentId or not agentId.strip():
        raise fn.UserThrownError("agentId is required")

    token = DefaultAzureCredential().get_token(AGENT365_SCOPE).token
    response = requests.post(
        f"{AGENT365_BASE_URL}/{agentId.strip()}/block",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    logging.info("Agent 365 block %s -> %s", agentId, response.status_code)

    if not response.ok:
        raise fn.UserThrownError(f"Agent 365 returned {response.status_code}: {response.text}")

    return {"agentId": agentId, "status": "blocked"}
