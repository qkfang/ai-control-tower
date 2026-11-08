# Deployment Guide

Run the scripts from the `script/` folder in order. Each script is idempotent and can be re-run.

---

## 1. `01_deploy_bicep.ps1` — provision Azure resources

Deploys the resource group and all Azure infra (Foundry, App Service, Log Analytics, App Insights, Storage, etc.).

**Edit inline variables at the top of the script:**
- `$baseName`    — resource name prefix (default `aictt`)
- `$environment` — env suffix (default `dev`)
- `$location`    — Azure region (default `australiaeast`)

**Edit bicep params file** [bicep/main-dev.bicepparam](../bicep/main-dev.bicepparam):
- `principals` — list of user/SPN object IDs that get RBAC on the deployed resources
- `deployAppServicePlan`, `deployWebApp`, `deployFoundry` — toggle which modules deploy for test app and test foundry

Run:
```powershell
cd script
.\01_deploy_bicep.ps1
```

---

## 2. `02_deploy_app.ps1` — build & deploy the web app (Optional)

Builds `src/aictt_app`, zips the publish output, and deploys to the App Service created in step 1.

**Edit inline variables at the top of the script:**
- `$baseName`    — must match step 1
- `$environment` — must match step 1

Targets web app `$baseName-web-$environment` in resource group `rg-$baseName-$environment`.

Run:

```powershell
cd script
.\02_deploy_app.ps1
```

---

## 3. `03_deploy_fabric.ps1` — deploy Fabric items

**Prerequisites (manual, one-time setup in the Fabric portal):**
1. Create a Fabric workspace following the naming pattern `AI_Control_Tower_<env>` (e.g. `AI_Control_Tower_dev`) and capture its workspace ID.
2. Create a Fabric cloud connection from the workspace to the ADLS Gen2 storage account deployed in step 1, using connection type **Azure Data Lake Storage Gen2**. The connection URL must exactly match `https://<storage-account>.dfs.core.windows.net` (for example `https://aicttsadev.dfs.core.windows.net`). Capture the connection GUID.

**Edit env file** [fabric_cicd/.env.dev](../fabric_cicd/.env.dev) (copy from `.env.sample`). Required values:

| Variable | Description |
| --- | --- |
| `FABRIC_WORKSPACE_ID` | GUID of target Fabric workspace (created manually, see prerequisites) |
| `FABRIC_WORKSPACE_NAME` | Display name of target workspace, e.g. `AI_Control_Tower_dev` |
| `FABRIC_ADLS_CONNECTION_ID` | GUID of a pre-created Fabric cloud connection id bound to the ADLS account |
| `FABRIC_ENVIRONMENT` | `DEV` / `QA` / `PROD` (selects `.env.<env>` overlay and `parameter.yml` key) |
| `FABRIC_SUBSCRIPTION_ID` | Subscription hosting the Azure resources from step 1 |
| `FABRIC_RESOURCE_GROUP` | Resource Group hosting the Azure resources from step 1, e.g. `rg-aictt-dev` |
| `FABRIC_LAW_NAME` | Log Analytics workspace name from step 1 |
| `FABRIC_AI_NAME` | Application Insights name from step 1 |
| `FABRIC_STORAGE_ACCOUNT` | ADLS Gen2 storage account from step 1 |

Run:

```powershell
cd script
.\03_deploy_fabric.ps1
```

---

## 4. `04_deploy_rayfin.ps1` — deploy the Fabric app

Deploys the Rayfin app in `src/fabric_app` to the Fabric workspace and verifies the deployment status.

**Prerequisites:**
- Install Node.js 20, 22 or 24 and npm (a portable Node 24 is used if the installed version is unsupported).
- Run step 3 first; it writes `src/fabric_app/.fabric-bindings.json` (workspace, semantic model and data agent IDs).
- Ensure your account has permission to create and update items in the target Fabric workspace.

**Edit the inline variable at the top of the script:**
- `$foundryProjectEndpoint` — Foundry project endpoint used by the "Chat with Foundry agents" view

The script restores npm packages, signs in to Rayfin, provisions the app, sets the server secrets
(`FABRIC_DATA_AGENT_WORKSPACE_ID`, `FABRIC_DATA_AGENT_ID`, `FOUNDRY_PROJECT_ENDPOINT`), deploys the
static site and functions, generates `.env`, and checks deployment status.

Run:

```powershell
cd script
.\04_deploy_rayfin.ps1
```

---

## 5. Migrate data in Fabric

- Go to Foundry or Test Webapp to generate some agent activities. 

- Go to your workspace in Fabric and locate ` FoundryAgent_FactTable_ETL` notebook. Open the notebook and click `run all`. Once all cells complete, you can go to Power BI report to view activities.

- To keep the data fresh, add a recurring schedule (for example every 15 minutes) to `AI_Control_Tower_Pipeline` in the Fabric portal. Without it the dashboards only update when the pipeline is run manually.