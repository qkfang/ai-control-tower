
$baseName    = 'aictt'
$environment = 'dev'
$location    = 'australiaeast'

$rgName         = "rg-$baseName-$environment"
$deploymentName = "$baseName-$environment"

$rgExists = az group exists --name $rgName
if ($rgExists -eq 'false') {
    Write-Host "Resource group '$rgName' does not exist. Creating..."
    az group create --name $rgName --location $location
}

az deployment group create `
    --name $deploymentName `
    --resource-group $rgName `
    --template-file '../bicep/main.bicep' `
    --parameters '../bicep/main-dev.bicepparam' `
    --parameters baseName=$baseName environment=$environment location=$location

