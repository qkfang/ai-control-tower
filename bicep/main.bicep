@description('Base name prefix for all resources')
param baseName string = 'agentct'

@description('Environment short name (e.g. dev, test, prod) used in resource names')
@allowed([
  'dev'
  'test'
  'prod'
])
param environment string = 'dev'

@description('Azure region for all resources')
param location string = 'australiaeast'

@description('Principal object IDs to grant access to deployed resources')
param principals array = []

@description('Deploy the App Service Plan')
param deployAppServicePlan bool = true

@description('Deploy the Web App')
param deployWebApp bool = true

@description('Deploy the AI Foundry account')
param deployFoundry bool = true

var commonTags = {
  environment: environment
}
var foundryName = '${baseName}-foundry-${environment}'
var storageAccountName = replace('${baseName}sa${environment}', '-', '')
var storageAccountBName = replace('${baseName}sab${environment}', '-', '')
var logAnalyticsName = '${baseName}-law-${environment}'
var appInsightsName = '${baseName}-ai-${environment}'
var appServicePlanName = '${baseName}-asp-${environment}'
var webAppName = '${baseName}-web-${environment}'
var fabricCapacityName = replace('${baseName}fabric${environment}', '-', '')
  

// ── Storage Account ──────────────────────────────────────────────────────────
// resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
//   name: storageAccountName
//   location: location
//   tags: commonTags
//   sku: {
//     name: 'Standard_LRS'
//   }
//   kind: 'StorageV2'
//   properties: {
//     accessTier: 'Hot'
//     supportsHttpsTrafficOnly: true
//     minimumTlsVersion: 'TLS1_2'
//     allowBlobPublicAccess: true // poc only
//     publicNetworkAccess: 'Enabled' // poc only
//     networkAcls: {
//       bypass: 'AzureServices'
//       defaultAction: 'Allow'
//     }
//   }
// }

// ── Storage Account (ADLS Gen2 / HNS enabled) ──────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    isHnsEnabled: true
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true // poc only
    publicNetworkAccess: 'Enabled' // poc only
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}


// ── Log Analytics Workspace ──────────────────────────────────────────────────
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: commonTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ── Log Analytics export tables / matching blob containers ──────────────────
var logAnalyticsExportTables = [
  'AppRequests'
  'AppDependencies'
  'AppExceptions'
  'AppTraces'
  'AppEvents'
  'AppPageViews'
  'AppPerformanceCounters'
  'AppAvailabilityResults'
  'AppBrowserTimings'
  'AppSystemEvents'
  'AppMetrics'
  'AppServiceHTTPLogs'
  'AppServiceConsoleLogs'
  'AppServiceAppLogs'
  'AzureDiagnostics'
  'AzureMetrics'
]

// ── Blob containers for Log Analytics data export (am-<tablename>) ──────────
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource logAnalyticsExportContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [for tableName in logAnalyticsExportTables: {
  parent: blobService
  name: 'am-${toLower(tableName)}'
  properties: {
    publicAccess: 'None'
  }
}]

// ── Log Analytics Data Export → Storage Account (HNS) ───────────────────────
resource logAnalyticsDataExport 'Microsoft.OperationalInsights/workspaces/dataExports@2023-09-01' = {
  parent: logAnalyticsWorkspace
  name: 'export-to-storage'
  properties: {
    destination: {
      resourceId: storageAccount.id
    }
    tableNames: logAnalyticsExportTables
    enable: true
  }
  dependsOn: [
    logAnalyticsExportContainers
  ]
}


// ── Application Insights ─────────────────────────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: commonTags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}


// ── App Service Plan ─────────────────────────────────────────────────────────
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = if (deployAppServicePlan) {
  name: appServicePlanName
  location: location
  tags: commonTags
  sku: {
    name: 'S1'
    tier: 'Standard'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}



// ── AI Foundry ───────────────────────────────────────────────────────────────
module azureFoundry 'foundry.bicep' = if (deployFoundry) {
  name: 'foundryDeployment'
  params: {
    name: foundryName
    location: location
    tags: commonTags
    appInsightsId: appInsights.id
    appInsightsConnectionString: appInsights.properties.ConnectionString
    appInsightsConnectionName: appInsightsName
  }
}

// ── Role assignments: API App → Foundry ──────────────────────────────────────
resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-10-01-preview' existing = if (deployFoundry) {
  name: foundryName
  dependsOn: [azureFoundry]
}

// ── Foundry diagnostic settings → Log Analytics + Storage ────────────────────
resource foundryDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployFoundry) {
  name: 'send-to-law'
  scope: foundryAccount
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
      {
        categoryGroup: 'audit'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}


// ── Web App ──────────────────────────────────────────────────────────────────
module webApp 'webapp.bicep' = if (deployWebApp) {
  name: 'webAppDeployment'
  params: {
    name: webAppName
    location: location
    tags: commonTags
    appServicePlanId: deployAppServicePlan ? appServicePlan.id : ''
    appSettings: {
      APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
      ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
      AZURE_AI_PROJECT_ENDPOINT: deployFoundry ? azureFoundry!.outputs.projectEndpoint : ''
      AZURE_AI_MODEL_DEPLOYMENT_NAME: deployFoundry ? azureFoundry!.outputs.deploymentName : ''
      AZURE_TENANT_ID: tenant().tenantId
    }
    appCommandLine: 'dotnet aictt_app.dll'
  }
}

resource webAppResource 'Microsoft.Web/sites@2024-04-01' existing = if (deployWebApp) {
  name: webAppName
  dependsOn: [webApp]
}


// ── App Insights diagnostic settings for Web App ─────────────────────────────
resource webAppDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployWebApp) {
  name: 'send-to-law'
  scope: webAppResource
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
      }
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
      {
        category: 'AppServiceAppLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}


var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var azureAIUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'
var azureAIDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// ── Role assignments: additional principals ──────────────────────────────────
resource userOpenAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: if (deployFoundry) {
  name: guid(foundryAccount.id, principal.id, cognitiveServicesOpenAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

// ── Role assignment: Web App managed identity → Foundry ──────────────────────
resource webAppOpenAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployWebApp && deployFoundry) {
  name: guid(foundryAccount.id, resourceId('Microsoft.Web/sites', webAppName), cognitiveServicesOpenAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: webApp!.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webAppAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployWebApp && deployFoundry) {
  name: guid(foundryAccount.id, resourceId('Microsoft.Web/sites', webAppName), azureAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIUserRoleId)
    principalId: webApp!.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webAppAIDeveloperRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployWebApp && deployFoundry) {
  name: guid(foundryAccount.id, resourceId('Microsoft.Web/sites', webAppName), azureAIDeveloperRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIDeveloperRoleId)
    principalId: webApp!.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Role assignments: Azure AI User → principals ─────────────────────────────
resource userAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: if (deployFoundry) {
  name: guid(foundryAccount.id, principal.id, azureAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIUserRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

// ── Role assignments: Azure AI Developer → principals (agents/write) ─────────
resource userAIDeveloperRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: if (deployFoundry) {
  name: guid(foundryAccount.id, principal.id, azureAIDeveloperRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIDeveloperRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

// ── Role assignments: Storage Blob Data Contributor → principals ──────────────
resource userStorageBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  name: guid(storageAccount.id, principal.id, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

// resource userStorageBlobRoleB 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
//   name: guid(storageAccountB.id, principal.id, storageBlobDataContributorRoleId)
//   scope: storageAccountB
//   properties: {
//     roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
//     principalId: principal.id
//     principalType: principal.principalType
//   }
// }]



// ── Fabric Capacity ─────────────────────────────────────────────────────────
module fabricCapacity 'modules/fabric.bicep' = {
  name: 'fabricCapacityDeployment'
  params: {
    name: fabricCapacityName
    location: location
    tags: commonTags
    adminMembers: concat(
      [
        'danielfang@MngEnvMCAP951655.onmicrosoft.com'
        'fabric@MngEnvMCAP951655.onmicrosoft.com'
      ]
    )
  }
}

