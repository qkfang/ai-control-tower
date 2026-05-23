
$rgName = 'rg-aictt'
$location = 'australiaeast'

$rgExists = az group exists --name $rgName
if ($rgExists -eq 'false') {
    Write-Host "Resource group '$rgName' does not exist. Creating..."
    az group create --name $rgName --location $location
}

az deployment group create --name 'aictt-dev' --resource-group $rgName --template-file '../bicep/main.bicep' --parameters '../bicep/main.bicepparam'

