# AI Control Tower

End-to-end reference solution for hosting, observing, and analysing
Azure AI Foundry agents. It combines a small .NET 10 web application
that exposes three Foundry agents, the Azure infrastructure that
runs and monitors them, and a Microsoft Fabric workspace that turns
the telemetry into a Power BI report.

## Architecture overview

```
 ┌────────────────────────┐      ┌──────────────────────────┐
 │  Browser UI            │ HTTP │  App Service (Linux)     │
 │  wwwroot/index.html    │─────▶│  agentct (.NET 10)       │
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
                          ┌──────────────────────────────┐
                          │  Microsoft Fabric            │
                          │   Lakehouse · KQL · Notebook │
                          │   Semantic Model · Report    │
                          └──────────────────────────────┘
```

## Repository layout

| Path | Purpose |
| --- | --- |
| [src/agentct](src/agentct) | .NET 10 minimal API hosting the agents and the static UI. |
| [src/agentct/Agents](src/agentct/Agents) | `BaseAgent` plus three Foundry agents: support, doc, customer. |
| [src/agentct/wwwroot/index.html](src/agentct/wwwroot/index.html) | Single-page UI with manual prompt and a built-in traffic simulator. |
| [bicep](bicep) | Infrastructure-as-code for App Service, Foundry, monitoring, Fabric capacity and RBAC. |
| [fabric/deployment_package](fabric/deployment_package) | Script-driven Fabric workspace deployment (REST API based). |
| [fabric/templates](fabric/templates) | Reusable Fabric item templates (Lakehouse, Notebook, Report, etc.). |

## Web app (`src/agentct`)

- Minimal API in [Program.cs](src/agentct/Program.cs) wires
  `AIProjectClient` with `DefaultAzureCredential` and exposes one
  endpoint per agent.
- [BaseAgent.cs](src/agentct/Agents/BaseAgent.cs) creates a Foundry
  agent version from a declarative definition and drives the
  Responses API, including auto-approval of MCP tool calls.
- The three concrete agents only differ by their instructions:
  - [CtAgSupport](src/agentct/Agents/CtAgSupport.cs) — troubleshooting and escalation.
  - [CtAgDoc](src/agentct/Agents/CtAgDoc.cs) — documentation and knowledge base.
  - [CtAgCustomer](src/agentct/Agents/CtAgCustomer.cs) — account and service questions.
- Telemetry is shipped to Application Insights through
  `Azure.Monitor.OpenTelemetry.AspNetCore`; Live Metrics traffic is
  filtered out to avoid self-tracking noise.

Configuration is supplied via [appsettings.json](src/agentct/appsettings.json)
or App Service app settings:

| Setting | Description |
| --- | --- |
| `AZURE_AI_PROJECT_ENDPOINT` | Foundry project endpoint. |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Model deployment used by the agents. |
| `AZURE_TENANT_ID` | Tenant for `DefaultAzureCredential`. |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights connection string. |

Run locally:

```powershell
cd src/agentct
dotnet run
```

Then open `http://localhost:5000`, pick an agent, send a prompt, or
use the **Start Sim** button to drive randomised traffic across all
three agents.

## Infrastructure (`bicep`)

[main.bicep](bicep/main.bicep) deploys, in one resource group:

- Two Storage Accounts — one general purpose, one ADLS Gen2 (HNS)
  used as the Log Analytics export target.
- Log Analytics workspace with a Data Export rule that streams the
  App Insights and App Service tables into the ADLS account.
- Application Insights workspace-based component.
- Linux App Service Plan and Web App configured for .NET 10, with
  system-assigned managed identity and the app settings listed above.
- Azure AI Foundry account and project ([foundry.bicep](bicep/foundry.bicep))
  with a `gpt-4o` deployment and diagnostic settings to Log Analytics.
- Microsoft Fabric capacity ([modules/fabric.bicep](bicep/modules/fabric.bicep)).
- Role assignments granting the Web App managed identity and the
  configured `principals` the Foundry and Storage roles required to
  call agents and read exported telemetry.

Parameters live in [main.bicepparam](bicep/main.bicepparam). Deploy with:

```powershell
cd bicep
./deploy.ps1
```

## Fabric deployment (`fabric/deployment_package`)

[deploy_to_fabric.ps1](fabric/deployment_package/deploy_to_fabric.ps1)
provisions the analytics layer against an existing Fabric capacity
via the Fabric REST API:

1. Create or reuse the target workspace and assign capacity.
2. Create a schema-enabled Lakehouse.
3. Create OneLake shortcuts to the Log Analytics export containers
   in ADLS Gen2.
4. Create a KQL Queryset and KQL Dashboard over Application Insights
   and Log Analytics.
5. Convert and upload the ETL notebook
   ([FoundryAgent_FactTable_ETL](fabric/deployment_package/Notebook/FoundryAgent_FactTable_ETL/notebook-content.py))
   that builds the `foundryagent_fact` Delta table.
6. Create the Semantic Model and Power BI Report, rebinding the
   report to the new model and workspace.

Configuration is driven by `deployment_config_<env>.json` — see
[deployment_config_SAMPLE.json](fabric/deployment_package/deployment_config_SAMPLE.json)
for the full schema, and
[fabric/deployment_package/README.md](fabric/deployment_package/README.md)
for the detailed flow and prerequisites.

Reusable item templates that mirror the Fabric REST API shapes are
kept under [fabric/templates](fabric/templates).

## Typical end-to-end flow

1. Deploy infrastructure with `bicep/deploy.ps1`.
2. Publish the .NET app to the created App Service (e.g. `dotnet publish` + `az webapp deploy`).
3. Exercise the agents through the UI or simulator; telemetry flows
   to Application Insights and is exported to ADLS Gen2.
4. Run `fabric/deployment_package/deploy_to_fabric.ps1` to stand up
   the Fabric workspace and Power BI report on top of that telemetry.
