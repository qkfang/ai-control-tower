$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir    = Resolve-Path (Join-Path $scriptDir '..\src\agentct')
Push-Location $appDir

$publishDir = Join-Path $appDir 'publish'
$zipPath    = Join-Path $appDir 'publish.zip'

if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }
if (Test-Path $zipPath)    { Remove-Item $zipPath -Force }

dotnet restore agentct.csproj
dotnet build agentct.csproj --configuration Release --no-restore
dotnet publish agentct.csproj --configuration Release --output $publishDir --no-build

Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath -Force

az webapp deploy --resource-group 'rg-aictt' --name 'aictt-web' --src-path $zipPath --type zip

Pop-Location
