# AI Control Tower

End-to-end reference solution for hosting, observing, and analysing
Azure AI Foundry agents. It combines a .NET 10 web application that
exposes three Foundry agents, the Azure infrastructure that runs and
monitors them, a Microsoft Fabric workspace that turns the telemetry
into a Power BI report, and a Fabric Analytics App that surfaces the
same data as a custom React dashboard.

## Architecture overview

```
 ┌────────────────────────┐      ┌──────────────────────────┐
 │  Browser UI            │ HTTP │  App Service (Linux)     │
 │  wwwroot/index.html    │─────▶│  aictt_app (.NET 10)     │
 └────────────────────────┘      │   /support  /doc         │
                                 │   /customer  /health     │
                                 └─────────────┬────────────┘
                                               │ Managed identity
                                               ▼
                              ┌────────────────────────────┐
                              │  Azure AI Foundry          │
                              │   project + gpt-4o model   │
                              │   3 declarative agents     │
                              └─────────────┬──────────────┘
                                            │ OpenTelemetry
                                            ▼
              ┌─────────────────────────────────────────────┐
              │  Application Insights + Log Analytics       │
              │   Data Export → ADLS Gen2 (HNS)             │
              └─────────────────────────┬───────────────────┘
                                        │ OneLake shortcuts
                                        ▼
              ┌─────────────────────────────────────────────┐
              │  Microsoft Fabric workspace                 │
              │   Lakehouse → Notebook → foundryagent_fact  │
              │   orchestrated by a Data Pipeline           │
              │   KQL Queryset · KQL Dashboard              │
              │   Semantic Model · Power BI Report          │
              └─────────────────────────┬───────────────────┘
                                        │ DAX over the semantic model
                                        ▼
                          ┌──────────────────────────────┐
                          │  Fabric Analytics App        │
                          │   React + Vite (Rayfin)      │
                          └──────────────────────────────┘
```

## Repository layout

| Path | Purpose |
| --- | --- |
| [src/aictt_app](src/aictt_app) | .NET 10 minimal API hosting the agents and the static UI. |
| [src/aictt_app/Agents](src/aictt_app/Agents) | `BaseAgent` plus three Foundry agents: support, doc, customer. |
| [src/aictt_app/wwwroot/index.html](src/aictt_app/wwwroot/index.html) | Single-page UI with manual prompt and a built-in traffic simulator. |
| [src/fabric_app](src/fabric_app) | Fabric Analytics App (React + Vite + TypeScript) deployed with Rayfin. |
| [bicep](bicep) | Infrastructure-as-code for App Service, Foundry, monitoring, Fabric capacity and RBAC. |
| [fabric_src](fabric_src) | Fabric item definitions — the source of truth published by fabric-cicd. |
| [fabric_cicd](fabric_cicd) | `deploy.py`, environment files and the deployment entry point. |
| [script](script) | Numbered PowerShell deployment scripts; see [script/guide.md](script/guide.md). |
| [.github/workflows](.github/workflows) | GitHub Actions pipelines for infra, web app and Fabric. |
| [docs](docs) | Solution diagram (`.drawio`). |

## Web app (`src/aictt_app`)

- Minimal API in [Program.cs](src/aictt_app/Program.cs) wires
  `AIProjectClient` with `DefaultAzureCredential` and exposes one
  endpoint per agent.
- [BaseAgent.cs](src/aictt_app/Agents/BaseAgent.cs) creates a Foundry
  agent version from a declarative definition and drives the
  Responses API, including auto-approval of MCP tool calls.
- The three concrete agents only differ by their instructions:
  - [CtAgSupport](src/aictt_app/Agents/CtAgSupport.cs) — troubleshooting and escalation.
  - [CtAgDoc](src/aictt_app/Agents/CtAgDoc.cs) — documentation and knowledge base.
  - [CtAgCustomer](src/aictt_app/Agents/CtAgCustomer.cs) — account and service questions.
- Telemetry is shipped to Application Insights through
  `Azure.Monitor.OpenTelemetry.AspNetCore`; Live Metrics traffic is
  filtered out to avoid self-tracking noise.

Configuration is supplied via [appsettings.json](src/aictt_app/appsettings.json)
or App Service app settings:

| Setting | Description |
| --- | --- |
| `AZURE_AI_PROJECT_ENDPOINT` | Foundry project endpoint. |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Model deployment used by the agents. |
| `AZURE_TENANT_ID` | Tenant for `DefaultAzureCredential`. |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights connection string. |

Run locally:

```powershell
cd src/aictt_app
dotnet run
```

Then open `http://localhost:5000`, pick an agent, send a prompt, or
use the **Start Sim** button to drive randomised traffic across all
three agents.

## Infrastructure (`bicep`)

[main.bicep](bicep/main.bicep) deploys, in one resource group:

- An ADLS Gen2 Storage Account (hierarchical namespace enabled) used as
  the Log Analytics export target, with one blob container per exported
  table.
- Log Analytics workspace with a Data Export rule that streams the
  App Insights and App Service tables (`AppRequests`, `AppDependencies`,
  `AppTraces`, `AppServiceHTTPLogs`, …) into that account.
- Application Insights workspace-based component.
- Linux App Service Plan and Web App configured for .NET 10, with
  system-assigned managed identity and the app settings listed above.
- Azure AI Foundry account and project ([foundry.bicep](bicep/foundry.bicep))
  with a `gpt-4o` deployment and diagnostic settings to Log Analytics.
- Microsoft Fabric capacity ([modules/fabric.bicep](bicep/modules/fabric.bicep)).
- Role assignments granting the Web App managed identity and the
  configured `principals` the Foundry and Storage roles required to
  call agents and read exported telemetry.

Parameters live in [main-dev.bicepparam](bicep/main-dev.bicepparam). The
`deployAppServicePlan`, `deployWebApp` and `deployFoundry` toggles let
you skip the sample app or bring your own Foundry project. Deploy with:

```powershell
cd script
./01_deploy_bicep.ps1
```

## Fabric deployment (`fabric_src` + `fabric_cicd`)

The Fabric workspace is deployed declaratively with
[fabric-cicd](https://microsoft.github.io/fabric-cicd/). The item
definitions under `fabric_src` are the source of truth and are
published in dependency order:

| Item | Type | Role |
| --- | --- | --- |
| `AI_Foundry_Control_Tower` | Lakehouse | OneLake shortcuts onto the ADLS Gen2 export containers. |
| `FoundryAgent_FactTable_ETL` | Notebook | Builds the `foundryagent_fact` Delta table from the exported telemetry. |
| `AI_Control_Tower_Pipeline` | Data Pipeline | Runs the ETL notebook. |
| `AI_Control_Tower_KQL_LAW` | KQL Queryset | Ad-hoc queries over App Insights / Log Analytics. |
| `AI_Control_Tower_Dashboard` | KQL Dashboard | Real-time operational view. |
| `AI_Control_Tower` | Semantic Model | Model over the fact table. |
| `AI_Control_Tower_Report` | Report | Power BI report bound to the semantic model. |

Environment-specific values are not hard-coded in the item definitions.
[fabric_src/parameter.yml](fabric_src/parameter.yml) rewrites them at
publish time: workspace and item GUIDs resolve dynamically through
`$workspace.$id` and `$items.<type>.<name>.$id`, while Azure resource
names come from environment variables. Those are read from
[fabric_cicd/.env](fabric_cicd/.env.sample) with a `.env.<environment>`
overlay applied on top.

> `fabric_cicd/parameter.yml.example` is a reference sample only.
> fabric-cicd loads `fabric_src/parameter.yml`, resolved from the
> `repository_directory` passed to `FabricWorkspace` in
> [deploy.py](fabric_cicd/deploy.py).

Optional flags recognised by `deploy.py`:

| Variable | Effect |
| --- | --- |
| `FABRIC_DEBUG` | `true` enables DEBUG logging. |
| `FABRIC_UNPUBLISH_ORPHANS` | `true` deletes items in the workspace that no longer exist in the repo. |
| `FABRIC_RUN_PIPELINE` | Display name of a pipeline to run once publishing succeeds, refreshing the data. |
| `FABRIC_RUN_PIPELINE_WAIT` | Seconds to wait for that run (`0` = trigger and exit). |

Two things must exist before the first Fabric deployment:

1. A Fabric workspace named `AI_Control_Tower_<env>` on the capacity
   deployed by Bicep — capture its workspace ID.
2. A Fabric cloud connection of type **Azure Data Lake Storage Gen2**
   whose URL exactly matches `https://<storage-account>.dfs.core.windows.net`
   — capture its GUID. A mismatch (including a trailing slash) fails the
   shortcut publish with `DMTSConnectionServerAndTargetPathMismatch`.

See [script/guide.md](script/guide.md) for the full list of required
environment variables.

## Fabric Analytics App (`src/fabric_app`)

A React 19 + Vite + TypeScript app that queries the `AI_Control_Tower`
semantic model with DAX and renders it as a custom dashboard inside the
Fabric portal. Views cover a command centre, AI estate and token
economics, backed by the `.dax` queries under
[src/fabric_app/src/queries](src/fabric_app/src/queries).

The target semantic model is configured in
[fabric.yaml](src/fabric_app/fabric.yaml). Deployment uses the Rayfin
CLI; see [src/fabric_app/README.md](src/fabric_app/README.md) for the
local development loop.

## Deployment

The numbered scripts in [script](script) run the whole solution in
order. Each is idempotent — see [script/guide.md](script/guide.md) for
the variables to edit and the manual prerequisites.

```powershell
cd script
./01_deploy_bicep.ps1    # resource group + all Azure infra
./02_deploy_app.ps1      # build & publish the .NET app (optional)
./03_deploy_fabric.ps1   # fabric-cicd publish of fabric_src
./04_deploy_rayfin.ps1   # deploy the Fabric Analytics App
```

The same steps run in CI from [.github/workflows](.github/workflows),
each triggered by changes to the paths it owns and authenticated with
the `AZURE_CREDENTIALS` secret:

| Workflow | Trigger paths | Action |
| --- | --- | --- |
| `10_deploy_iac.yml` | `bicep/**` | `az deployment group create` |
| `20_deploy_web.yml` | `src/aictt_app/**` | build, publish, `azure/webapps-deploy` |
| `30_deploy_fabric.yml` | `fabric_src/**`, `fabric_cicd/**`, `script/03_deploy_fabric.ps1` | `./script/03_deploy_fabric.ps1` |

`azure/login` authenticates the Azure CLI as a service principal in CI
and as your own account locally; `deploy.py` picks up whichever identity
is active through `AzureCliCredential`.

## Typical end-to-end flow

1. Deploy infrastructure with `script/01_deploy_bicep.ps1`.
2. Publish the .NET app with `script/02_deploy_app.ps1`.
3. Create the Fabric workspace and the ADLS Gen2 connection, then run
   `script/03_deploy_fabric.ps1`.
4. Exercise the agents through the UI or simulator; telemetry flows to
   Application Insights and is exported to ADLS Gen2.
5. Run the `AI_Control_Tower_Pipeline` data pipeline — or set
   `FABRIC_RUN_PIPELINE` so the deployment does it — to build
   `foundryagent_fact`, then open the Power BI report.
6. Optionally deploy the Fabric Analytics App with
   `script/04_deploy_rayfin.ps1`.
