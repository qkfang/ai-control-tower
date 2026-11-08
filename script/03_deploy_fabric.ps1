# Inline fabric-cicd deployment runner.
# Environment variables are loaded from fabric_cicd/.env by deploy.py.

$ErrorActionPreference = 'Stop'
$repoRoot   = Split-Path -Parent $PSScriptRoot
$deployRoot = Join-Path $repoRoot "fabric_cicd"

Push-Location $deployRoot

try {
    python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Fabric deployment dependencies could not be installed.' }
    python deploy.py
    if ($LASTEXITCODE -ne 0) { throw 'Fabric deployment failed. Do not deploy the app.' }
}
finally {
    Pop-Location
}
