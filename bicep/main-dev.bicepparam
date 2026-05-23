using 'main.bicep'

param baseName = 'aictt'
param environment = 'dev'
param location = 'australiaeast'
param principals = [
  { id: '4b74544b-02c6-4e4f-b936-732c9c3fff65', principalType: 'User' } // danielfang@MngEnvMCAP951655.onmicrosoft.com
  { id: 'f91fb358-1a1a-4f6f-b25f-6451734f3c6e', principalType: 'User' } // fabric@MngEnvMCAP951655.onmicrosoft.com
  { id: 'a6efe236-83c5-472b-a068-65006e369ad7', principalType: 'ServicePrincipal' }
]
param deployAppServicePlan = false
param deployWebApp = false
param deployFoundry = false
