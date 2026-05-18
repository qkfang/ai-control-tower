# AI Control Tower — Fabric Deployment Package

End-to-end automated deployment of the **AI_Control_Tower** Fabric solution
to a target workspace. The script provisions the workspace, lakehouse,
shortcuts, KQL queryset & dashboard, ETL notebook, semantic model and report
via the Fabric REST API in one run.

---

## 📦 Package Contents

```
deployment_package/
├── README.md
├── deploy_to_fabric.ps1                # Main deployment script (REST API based)
├── export_template_format.ps1          # Helper to export template format from a workspace
├── deployment_config.json              # Production config (edit before use)
├── deployment_config_test.json         # Test config (TEST workspace)
├── deployment_config_SAMPLE.json       # Annotated sample
│
├── Lakehouse/
│   └── AI_Foundry_Control_Tower/       # (metadata only — created via API)
│
├── KQLQueryset/
│   └── Log_Analytics_KustoQueryWorkbench/
│       └── RealTimeQueryset.json       # Live definition pulled from source workspace
│
├── KQLDashboard/
│   └── LA_Dashaboard/
│       └── RealTimeDashboard.json
│
├── Notebook/
│   └── FoundryAgent_FactTable_ETL/
│       └── notebook-content.py         # Fallback if .ipynb not provided
│
├── SemanticModel/
│   └── AI_Control_Tower/
│       ├── definition.pbism
│       └── definition/model.tmdl
│
└── Report/
    └── AI_ControlTower_Report/
        ├── definition.pbir             # Live binding (rebound at deploy time)
        ├── report.json                 # Live report pages with visuals
        └── StaticResources/...         # Themes & registered resources
```

The notebook source preferred by the script is the live `.ipynb` at
[../docs/notebooks/FoundryAgent_FactTable_ETL.ipynb](../docs/notebooks/FoundryAgent_FactTable_ETL.ipynb)
(configurable via `items.notebook.sourceIpynbPath`).

---

## 🔄 Deployment Flow

The script `deploy_to_fabric.ps1` performs these steps in order:

| Step | Action | Notes |
|------|--------|-------|
| 1 | Create / reuse workspace, assign capacity | Idempotent on `displayName` |
| 2 | Create **schema-enabled** Lakehouse | Uses typed `/lakehouses` endpoint with `creationPayload.enableSchemas: true` when `lakehouse.enableSchemas` is true in config |
| 3 | Create OneLake shortcuts → Azure Blob Storage | Continues on per-shortcut failures (logs and proceeds) |
| 4 | Create KQL Queryset from `RealTimeQueryset.json` | Async LRO |
| 5 | Create KQL Dashboard | |
| 6 | Convert `.ipynb` → Fabric `.py` and create Notebook | See *Notebook handling* below |
| 7 | Create empty Semantic Model | DirectLake tables added manually post-ETL |
| 8 | Create Report from full template folder | Rebinds `definition.pbir` to the new SM id and target workspace name |

All async operations are polled via `x-ms-operation-id` until `Succeeded`/`Failed`.

---

## 📓 Notebook Handling

The script transforms the source Jupyter notebook into the Fabric `.py` format
expected by the API:

- **Code cells** — placeholder substitution:
  - `{{TARGET_WORKSPACE_ID}}` → new workspace id
  - `{{TARGET_LAKEHOUSE_ID}}` → new lakehouse id
  - `ONELAKE_BASE_PATH = "..."` → `abfss://<ws>@onelake.dfs.fabric.microsoft.com/<lh>.Lakehouse/Files/...`
  - `WORKSPACE_RESOURCE_ID = "..."` → from config
  - Emitted with `# META { "language": "python", "language_group": "synapse_pyspark" }`
- **Markdown cells** — converted to commented Python (`# ` prefix per line) and
  emitted as `language: python`. This guarantees "Run all" never fails on
  markdown rendering quirks.
- **Global metadata** — kernel `synapse_pyspark` plus a `dependencies.lakehouse`
  block so the notebook is **auto-bound** to the freshly deployed lakehouse —
  no manual attach required.

---

## 📊 Report Handling

The Report step picks up **all files** under `Report/AI_ControlTower_Report/`
recursively (including `StaticResources/RegisteredResources/*` and theme
files), so visuals and themes ship intact.

`definition.pbir` is rewritten on the fly:

- `semanticmodelid=<old-id>` → new SM id
- `powerbi://api.powerbi.com/v1.0/myorg/<old-ws>` → target workspace name

The shipped `Report/` folder mirrors the live definition pulled from the
source `AI_Control_Tower` workspace.

---

## 📋 Pre-Requisites

### Azure / Fabric

- A **Fabric capacity** (F2+) in **Active** state — the script fails with
  `CapacityNotInActiveState` if paused.
- A **Cloud Connection** to the Azure Blob Storage account holding the
  Log Analytics export. The connection's principal must have **Storage Blob
  Data Reader** on the target containers (otherwise shortcut creation fails
  with `Unauthorized. Access to target location ... denied`).
- **Application Insights** + optional **Log Analytics workspace** for KQL
  data sources.

### Tooling

- PowerShell 7+ (`pwsh`)
- Azure CLI (`az`) — used for token acquisition
  (`az account get-access-token --resource https://api.fabric.microsoft.com`)
- Logged-in identity must be **Workspace Admin** in the target tenant and have
  permission to assign the capacity.

---

## 🚀 Deployment Steps

### 1. Configure

Copy `deployment_config_SAMPLE.json` (or `deployment_config_test.json`) and
edit. Key fields:

```jsonc
{
  "sourceWorkspace": { "name": "AI_Control_Tower", "id": "..." },

  "targetEnvironment": {
    "workspace": {
      "name": "MyCompany_AI_Control_Tower",
      "capacityId": "<fabric-capacity-guid>",
      "description": "..."
    },
    "azureSubscription": { "subscriptionId": "...", "resourceGroup": "...", "location": "australiaeast" },
    "storageShortcuts": {
      "storageAccountUrl": "https://<account>.blob.core.windows.net",
      "connectionId": "<fabric-cloud-connection-guid>"
    },
    "kustoDataSources": {
      "applicationInsights": { "name": "...", "clusterUri": "..." },
      "logAnalytics":        { "name": "...", "clusterUri": "...", "resourceId": "..." }
    },
    "notebookConfig": {
      "workspaceResourceId": "WorkspaceResourceId=/subscriptions/.../workspaces/<law>"
    }
  },

  "items": {
    "lakehouse":     { "displayName": "AI_Foundry_Control_Tower", "enableSchemas": true, ... },
    "notebook":      { "displayName": "FoundryAgent_FactTable_ETL",
                       "sourceIpynbPath": "../docs/notebooks/FoundryAgent_FactTable_ETL.ipynb" },
    "kqlQueryset":   { "displayName": "Log_Analytics_KustoQueryWorkbench",
                       "definitionFolder": "KQLQueryset/Log_Analytics_KustoQueryWorkbench" },
    "kqlDashboard":  { ... },
    "semanticModel": { "displayName": "AI_Control_Tower", ... },
    "report":        { "displayName": "AI_ControlTower_Report",
                       "definitionFolder": "Report/AI_ControlTower_Report" }
  }
}
```

### 2. Run

```powershell
cd deployment_package

# Preview only
.\deploy_to_fabric.ps1 -ConfigPath .\deployment_config_test.json -WhatIf

# Deploy
.\deploy_to_fabric.ps1 -ConfigPath .\deployment_config_test.json
```

The script prints the new IDs at the end:

```
Workspace: <ws-id>
  - lakehouse:     <id>
  - kqlQueryset:   <id>
  - kqlDashboard:  <id>
  - notebook:      <id>
  - semanticModel: <id>
  - report:        <id>
```

### 3. Post-Deployment Manual Steps

1. **Run the ETL notebook** — open `FoundryAgent_FactTable_ETL` and Run all.
   It is already bound to the new lakehouse and will create the
   `foundryagent_fact` Delta table.
2. **Add table to Semantic Model** — open `AI_Control_Tower` → add
   `foundryagent_fact` (DirectLake). The model is created empty.
3. **Refresh Report** — open `AI_ControlTower_Report`. It is already rebound
   to the new SM via `definition.pbir`; visuals will light up once the SM
   has the table.

---

## 🛠️ Re-Sync from Source Workspace

To refresh the shipped definitions (queryset / report / dashboard) from the
live `AI_Control_Tower` workspace, call the Fabric `getDefinition`
endpoint and decode the parts. Example for the report:

```powershell
$t = az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv
$h = @{ Authorization = "Bearer $t" }
$srcWs   = '<source-ws-id>'
$itemId  = '<item-id>'

$resp = Invoke-WebRequest -Uri "https://api.fabric.microsoft.com/v1/workspaces/$srcWs/items/$itemId/getDefinition" `
  -Method POST -Headers $h -UseBasicParsing
$opId = $resp.Headers['x-ms-operation-id']; if ($opId -is [array]) { $opId = $opId[0] }
do {
  Start-Sleep 2
  $op = Invoke-RestMethod -Uri "https://api.fabric.microsoft.com/v1/operations/$opId" -Headers $h
} while ($op.status -notin @('Succeeded','Failed'))
$def = Invoke-RestMethod -Uri "https://api.fabric.microsoft.com/v1/operations/$opId/result" -Headers $h

foreach ($p in $def.definition.parts) {
  $bytes = [Convert]::FromBase64String($p.payload)
  $dest  = Join-Path "Report\AI_ControlTower_Report" $p.path
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  [IO.File]::WriteAllBytes($dest, $bytes)
}
```

---

## 🆘 Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `CapacityNotInActiveState` (400) at Step 1 | Fabric capacity is paused. Resume it in Azure portal and retry. |
| `Unauthorized. Access to target location ... denied` at Step 3 | Cloud connection's identity lacks **Storage Blob Data Reader** on the storage account. Grant RBAC on the source storage and retry — the script keeps going so other items still deploy. |
| `PyToIPynbFailure: file suffix type .ipynb is not supported` | Old behaviour. Current script converts `.ipynb` → Fabric `.py` automatically. Pull latest. |
| Markdown cell breaks notebook execution | Current script converts markdown to commented Python — should not occur. Re-deploy with the latest script. |
| Lakehouse has no schemas | Set `items.lakehouse.enableSchemas = true` in the config and re-deploy. |
| Report is empty | Ensure `Report/AI_ControlTower_Report/report.json` contains visuals (re-sync from source — see above). |
| Report visuals show field-binding errors | Run the ETL notebook first, then add `foundryagent_fact` to the semantic model. |

### Validation Snippet

```powershell
$t = az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv
$h = @{ Authorization = "Bearer $t" }
$ws = '<new-workspace-id>'
(Invoke-RestMethod -Uri "https://api.fabric.microsoft.com/v1/workspaces/$ws/items" -Headers $h).value |
  Select-Object type, displayName, id | Format-Table -AutoSize
```

---

## 🏗️ Solution Architecture

```
┌──────────────────┐     ┌───────────────────┐     ┌────────────────────┐
│   Azure          │     │   Fabric          │     │   Consumers        │
├──────────────────┤     ├───────────────────┤     ├────────────────────┤
│  App Insights ───┼──►  │  KQL Queryset  ───┼──►  │  Data Analysts     │
│  Log Analytics ──┼──►  │  KQL Dashboard ───┼──►  │  Ops Team          │
│  Storage (LA     │     │  Lakehouse        │     │                    │
│  export) ────────┼──►  │   └─ Shortcuts    │     │                    │
│                  │     │   └─ ETL Notebook │     │                    │
│                  │     │       │           │     │                    │
│                  │     │       ▼           │     │                    │
│                  │     │  Semantic Model ──┼──►  │  Power BI users    │
│                  │     │       │           │     │                    │
│                  │     │       ▼           │     │                    │
│                  │     │  Report ──────────┼──►  │  Executives        │
└──────────────────┘     └───────────────────┘     └────────────────────┘
```

---

## 📝 Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-04-29 | Initial export from `AI_Control_Tower`. |
| 1.1.0 | 2026-04-30 | End-to-end automated deploy: schema-enabled lakehouse; `.ipynb` → Fabric `.py` conversion with auto lakehouse binding; markdown-as-commented-python; recursive Report folder upload with PBIR rebind; queryset & report re-synced from live source workspace. |
