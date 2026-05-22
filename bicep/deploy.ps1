
az group create --name 'rg-agentctt' --location 'australiaeast'

az deployment group create --name 'agentctt-dev' --resource-group 'rg-agentctt' --template-file './main.bicep' --parameters './main.bicepparam'



az group create --name 'rg-aictt' --location 'australiaeast'

az deployment group create --name 'aictt-dev' --resource-group 'rg-aictt' --template-file './main.bicep' --parameters './main.bicepparam'

