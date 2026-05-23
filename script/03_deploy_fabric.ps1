# Inline fabric-cicd deployment runner.
# Environment variables are loaded from fabric_cicd/.env by deploy.py.

$repoRoot   = Split-Path -Parent $PSScriptRoot
$deployRoot = Join-Path $repoRoot "fabric_cicd"

Push-Location $deployRoot

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

python deploy.py

Pop-Location
