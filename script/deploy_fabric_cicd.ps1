# Inline fabric-cicd deployment runner.
# Set the following before executing:
#   $env:FABRIC_WORKSPACE_ID = "<target-workspace-guid>"
#   $env:FABRIC_ENVIRONMENT  = "DEV"   # or PPE / PROD

$ErrorActionPreference = "Stop"

$repoRoot   = Split-Path -Parent $PSScriptRoot
$deployRoot = Join-Path $repoRoot "fabric_cicd_deploy"

Push-Location $deployRoot

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

az account show *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run 'az login' before executing this script."
    Pop-Location
    exit 1
}

python deploy.py
$code = $LASTEXITCODE

Pop-Location
exit $code
