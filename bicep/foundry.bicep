param name string
param location string
param tags object = {}

resource aiHub 'Microsoft.CognitiveServices/accounts@2025-10-01-preview' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  kind: 'AIServices'
  properties: {
    allowProjectManagement: true
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource aiProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: aiHub
  name: '${name}-project'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
}

resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: aiHub
  name: 'gpt-4o'
  sku: {
    name: 'GlobalStandard'
    capacity: 500
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-11-20'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}


output accountName string = aiHub.name
output resourceId string = aiHub.id
output projectName string = aiProject.name
output projectEndpoint string = aiProject.properties.endpoints['AI Foundry API']
output deploymentName string = gpt4oDeployment.name
output location string = location
output principalId string = aiHub.identity.principalId
