$ErrorActionPreference = 'Stop'

$workspaceName = 'AI_Control_Tower_dev'
$repoRoot      = Split-Path -Parent $PSScriptRoot
$appRoot       = Join-Path $repoRoot 'src\fabric_app'

Push-Location $appRoot

try {
    npm ci
    npx rayfin login

    Remove-Item 'rayfin\.deployments.json' -Force -ErrorAction SilentlyContinue
    Remove-Item 'rayfin\.env' -Force -ErrorAction SilentlyContinue
    Remove-Item '.env.local' -Force -ErrorAction SilentlyContinue

    npx rayfin up --workspace $workspaceName
    npx rayfin env --framework vite
    Copy-Item '.env.local' '.env' -Force
    npx rayfin up status
}
finally {
    Pop-Location
}