$ErrorActionPreference = 'Stop'

$repoRoot      = Split-Path -Parent $PSScriptRoot
$appRoot       = Join-Path $repoRoot 'src\fabric_app'
$bindingsPath  = Join-Path $appRoot '.fabric-bindings.json'
$configPath    = Join-Path $appRoot 'rayfin\rayfin.yml'

if (-not (Test-Path $bindingsPath)) {
    throw 'Run script\03_deploy_fabric.ps1 successfully before deploying the app.'
}
$bindings = Get-Content $bindingsPath -Raw | ConvertFrom-Json
foreach ($key in @('workspaceId', 'semanticModelId', 'dataAgentId')) {
    $value = [Guid]::Empty
    if (-not [Guid]::TryParse([string]$bindings.$key, [ref]$value) -or $value -eq [Guid]::Empty) {
        throw "Invalid $key in .fabric-bindings.json. Re-run the Fabric deployment."
    }
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $nodeMajor -notin @(20, 22, 24)) {
    throw 'Use Node.js 20, 22, or 24 for the Fabric app CLI.'
}
$npmCli = Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules\npm\bin\npm-cli.js'
$configBytes = [System.IO.File]::ReadAllBytes($configPath)

Push-Location $appRoot
try {
    & node $npmCli ci
    if ($LASTEXITCODE -ne 0) { throw 'App dependency installation failed.' }
    & node $npmCli ci --prefix rayfin\functions
    if ($LASTEXITCODE -ne 0) { throw 'Function dependency installation failed.' }
    $cli = Join-Path $appRoot 'node_modules\@microsoft\rayfin-cli\scripts\main'
    & node $cli login
    if ($LASTEXITCODE -ne 0) { throw 'App-owner sign-in failed.' }

    # Keep the existing deployment identity; configure chat before publishing its UI.
    & node $cli up --workspace-id $bindings.workspaceId --exclude-services 'staticHosting,functions'
    if ($LASTEXITCODE -ne 0) { throw 'App provisioning failed.' }
    $registry = Get-Content 'rayfin\.deployments.json' -Raw | ConvertFrom-Json
    $active = $registry.deployments.($registry.active)
    if ($active.fabricWorkspaceId -ne $bindings.workspaceId) {
        throw 'Active app deployment does not match the Fabric bindings. No chat settings were changed.'
    }
    $bindings.workspaceId | & node $cli secret set FABRIC_DATA_AGENT_WORKSPACE_ID --stdin
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure the data-agent workspace.' }
    $bindings.dataAgentId | & node $cli secret set FABRIC_DATA_AGENT_ID --stdin
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure the data agent.' }

    & node $cli up --workspace-id $bindings.workspaceId
    if ($LASTEXITCODE -ne 0) { throw 'App deployment failed.' }
    & node $cli env --framework vite
    if ($LASTEXITCODE -ne 0) { throw 'Local app environment generation failed.' }
    Copy-Item '.env.local' '.env' -Force
    & node $cli up status
    if ($LASTEXITCODE -ne 0) { throw 'App deployment status check failed.' }
}
finally {
    # The CLI adds target-specific hosting origins; keep them out of source control.
    [System.IO.File]::WriteAllBytes($configPath, $configBytes)
    Pop-Location
}