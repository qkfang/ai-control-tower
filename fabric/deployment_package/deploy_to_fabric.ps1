<#
.SYNOPSIS
    Deploy AI Control Tower to a Fabric workspace (with definitions).

.DESCRIPTION
    Deploys all Fabric items from local definition folders to a target workspace,
    pushing the full item definitions via the Fabric REST API.

    Items deployed:
      - Workspace (created or reused)
      - Lakehouse (with optional storage shortcuts)
      - KQL Queryset (with parameterised data sources)
      - KQL Dashboard (with parameterised data sources)
      - Notebook (full definition)
      - Semantic Model (minimal empty model; configure in portal afterward)
      - Report (bound to the new Semantic Model)

.PARAMETER ConfigPath
    Path to the deployment configuration JSON file.

.PARAMETER WhatIf
    Preview only - no changes are made.

.PARAMETER SkipShortcuts
    Skip creation of Lakehouse storage shortcuts.

.EXAMPLE
    .\deploy_to_fabric.ps1 -ConfigPath .\deployment_config_test.json
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,

    [switch]$WhatIf,

    [switch]$SkipShortcuts
)

$ErrorActionPreference = 'Stop'
$FabricBaseUri = 'https://api.fabric.microsoft.com/v1'

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

function Get-FabricToken {
    $token = az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv
    if ($LASTEXITCODE -ne 0 -or -not $token) {
        throw "Failed to get Fabric access token. Please run 'az login' first."
    }
    return $token
}

function Read-ErrorBody {
    param($ErrorRecord)
    try {
        if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
            return [string]$ErrorRecord.ErrorDetails.Message
        }
        $resp = $ErrorRecord.Exception.Response
        if ($resp -and $resp.GetType().GetMethod('GetResponseStream')) {
            $stream = $resp.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($stream)
            return [string]$reader.ReadToEnd()
        }
    } catch { }
    return [string]$ErrorRecord.Exception.Message
}

function Invoke-FabricRequest {
    <#
    Wrapper around Invoke-WebRequest that returns the raw response and safely
    surfaces error bodies WITHOUT triggering composite-format errors (PowerShell
    formats messages containing { } via -f, so we escape them).
    #>
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [object]$Body = $null,
        [hashtable]$Headers
    )

    $params = @{
        Uri             = $Uri
        Method          = $Method
        Headers         = $Headers
        ContentType     = 'application/json'
        UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        if ($Body -is [string]) {
            $params.Body = $Body
        } else {
            $params.Body = ($Body | ConvertTo-Json -Depth 50 -Compress)
        }
    }

    try {
        return Invoke-WebRequest @params
    }
    catch {
        $body = Read-ErrorBody -ErrorRecord $_
        $safeBody = ($body -replace '\{', '{{') -replace '\}', '}}'
        $safeMsg  = ($_.Exception.Message -replace '\{', '{{') -replace '\}', '}}'
        Write-Host ""
        Write-Host "API call failed: $Method $Uri" -ForegroundColor Red
        Write-Host $safeMsg -ForegroundColor Red
        Write-Host $safeBody -ForegroundColor DarkRed
        throw "API request failed (see output above)."
    }
}

function Invoke-FabricJson {
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [object]$Body = $null,
        [hashtable]$Headers
    )
    $resp = Invoke-FabricRequest -Uri $Uri -Method $Method -Body $Body -Headers $Headers
    if ($resp.Content) {
        return $resp.Content | ConvertFrom-Json
    }
    return $null
}

function Wait-ForLongRunningOperation {
    param(
        [string]$OperationId,
        [hashtable]$Headers,
        [int]$TimeoutSeconds = 600
    )

    $opUri = "$FabricBaseUri/operations/$OperationId"
    $startTime = Get-Date
    while ($true) {
        Start-Sleep -Seconds 3
        $status = Invoke-FabricJson -Uri $opUri -Headers $Headers
        if ($status.status -eq 'Succeeded') {
            try {
                return Invoke-FabricJson -Uri "$opUri/result" -Headers $Headers
            } catch {
                return $status
            }
        }
        elseif ($status.status -eq 'Failed') {
            $errJson = ($status.error | ConvertTo-Json -Depth 10 -Compress)
            $safe = ($errJson -replace '\{', '{{') -replace '\}', '}}'
            throw ("Long-running operation failed: " + $safe)
        }
        if (((Get-Date) - $startTime).TotalSeconds -gt $TimeoutSeconds) {
            throw "Operation $OperationId timed out after $TimeoutSeconds seconds"
        }
    }
}

function Invoke-FabricLro {
    <#
    POSTs to Fabric and handles 202 (long-running) responses.
    Returns parsed JSON of the final result (or initial body for 200/201).
    #>
    param(
        [string]$Uri,
        [string]$Method = 'POST',
        [object]$Body = $null,
        [hashtable]$Headers
    )
    $resp = Invoke-FabricRequest -Uri $Uri -Method $Method -Body $Body -Headers $Headers

    if ($resp.StatusCode -eq 202) {
        $opId = $null
        if ($resp.Headers.ContainsKey('x-ms-operation-id')) {
            $opId = $resp.Headers['x-ms-operation-id']
            if ($opId -is [array]) { $opId = $opId[0] }
        }
        if (-not $opId -and $resp.Headers.ContainsKey('Location')) {
            $loc = $resp.Headers['Location']
            if ($loc -is [array]) { $loc = $loc[0] }
            $opId = ($loc -split '/')[-1]
        }
        if (-not $opId) {
            throw "202 response received but no operation id found in headers."
        }
        Write-Host "    Waiting for operation $opId ..." -ForegroundColor DarkGray
        return Wait-ForLongRunningOperation -OperationId $opId -Headers $Headers
    }

    if ($resp.Content) {
        return $resp.Content | ConvertFrom-Json
    }
    return $null
}

function ConvertTo-Base64 {
    param([Parameter(Mandatory = $true)][string]$Content)
    return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Content))
}

function New-FabricItem {
    param(
        [string]$WorkspaceId,
        [string]$DisplayName,
        [string]$Type,
        [string]$Description = '',
        [array]$DefinitionParts = $null,
        [hashtable]$Headers
    )

    $body = @{
        displayName = $DisplayName
        type        = $Type
    }
    if ($Description) { $body.description = $Description }
    if ($DefinitionParts) {
        $body.definition = @{ parts = $DefinitionParts }
    }

    $uri = "$FabricBaseUri/workspaces/$WorkspaceId/items"
    $result = Invoke-FabricLro -Uri $uri -Method 'POST' -Body $body -Headers $Headers

    if (-not $result.id) {
        throw "Failed to create $Type '$DisplayName': no id returned."
    }
    Write-Host "  Created $Type`: $DisplayName (ID: $($result.id))" -ForegroundColor Green
    return $result
}

function New-PlatformPart {
    param(
        [string]$Type,
        [string]$DisplayName,
        [string]$LogicalId = '00000000-0000-0000-0000-000000000000'
    )
    $platform = [ordered]@{
        '$schema' = 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json'
        metadata  = [ordered]@{ type = $Type; displayName = $DisplayName }
        config    = [ordered]@{ version = '2.0'; logicalId = $LogicalId }
    }
    return @{
        path        = '.platform'
        payload     = ConvertTo-Base64 -Content ($platform | ConvertTo-Json -Depth 10 -Compress)
        payloadType = 'InlineBase64'
    }
}

# =============================================================================
# MAIN
# =============================================================================

Write-Host "=============================================="
Write-Host "AI Control Tower - Fabric Deployment"
Write-Host "=============================================="
Write-Host ""

Write-Host "Loading configuration from: $ConfigPath"
$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$target = $config.targetEnvironment

# Validate placeholders
$rawJson = $config | ConvertTo-Json -Depth 20
$placeholders = [regex]::Matches($rawJson, '<<[^>]+>>')
if ($placeholders.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: Configuration contains unset placeholders:" -ForegroundColor Red
    $placeholders | ForEach-Object { Write-Host "  - $($_.Value)" -ForegroundColor Yellow }
    exit 1
}

Write-Host "Target workspace: $($target.workspace.name)"
if ($WhatIf) { Write-Host "[WhatIf Mode] - No changes will be made" -ForegroundColor Cyan }
Write-Host ""

Write-Host "Authenticating..."
$token = Get-FabricToken
$headers = @{ Authorization = "Bearer $token" }
Write-Host "  Authenticated successfully"

$basePath     = Split-Path (Resolve-Path $ConfigPath) -Parent
$createdItems = [ordered]@{}

# ----------------------------------------------------------------------------
# STEP 1: Workspace
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 1: Workspace Setup ---"

$workspaces = Invoke-FabricJson -Uri "$FabricBaseUri/workspaces" -Headers $headers
$existing = $workspaces.value | Where-Object { $_.displayName -eq $target.workspace.name }

if ($existing) {
    $workspaceId = $existing.id
    Write-Host "  Using existing workspace: $($existing.displayName) ($workspaceId)" -ForegroundColor Yellow
}
elseif ($WhatIf) {
    Write-Host "  [WhatIf] Would create workspace: $($target.workspace.name)"
    $workspaceId = 'whatif-workspace-id'
}
else {
    Write-Host "  Creating workspace: $($target.workspace.name)"
    $wsBody = @{
        displayName = $target.workspace.name
        description = $target.workspace.description
    }
    if ($target.workspace.capacityId) { $wsBody.capacityId = $target.workspace.capacityId }
    $ws = Invoke-FabricLro -Uri "$FabricBaseUri/workspaces" -Method 'POST' -Body $wsBody -Headers $headers
    $workspaceId = $ws.id
    Write-Host "  Created workspace with ID: $workspaceId" -ForegroundColor Green
}

# ----------------------------------------------------------------------------
# STEP 2: Lakehouse
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 2: Create Lakehouse ---"

$lakehouseConfig = $config.items.lakehouse
$enableSchemas = [bool]$lakehouseConfig.enableSchemas

if ($WhatIf) {
    Write-Host "  [WhatIf] Would create Lakehouse: $($lakehouseConfig.displayName) (enableSchemas=$enableSchemas)"
    $createdItems['lakehouse'] = 'whatif-lakehouse-id'
    $lakehouseId = 'whatif-lakehouse-id'
}
elseif ($enableSchemas) {
    # Use typed Lakehouses endpoint to pass creationPayload (schema-enabled lakehouse).
    Write-Host "  Creating schema-enabled Lakehouse: $($lakehouseConfig.displayName)"
    $body = @{
        displayName     = $lakehouseConfig.displayName
        description     = $lakehouseConfig.description
        creationPayload = @{ enableSchemas = $true }
    }
    $uri = "$FabricBaseUri/workspaces/$workspaceId/lakehouses"
    $lakehouse = Invoke-FabricLro -Uri $uri -Method 'POST' -Body $body -Headers $headers
    $lakehouseId = $lakehouse.id
    Write-Host "  Created Lakehouse: $($lakehouseConfig.displayName) (ID: $lakehouseId)" -ForegroundColor Green
    $createdItems['lakehouse'] = $lakehouseId
}
else {
    $lakehouse = New-FabricItem -WorkspaceId $workspaceId `
        -DisplayName $lakehouseConfig.displayName `
        -Type 'Lakehouse' -Description $lakehouseConfig.description `
        -Headers $headers
    $lakehouseId = $lakehouse.id
    $createdItems['lakehouse'] = $lakehouseId
}

# ----------------------------------------------------------------------------
# STEP 3: Lakehouse Shortcuts
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 3: Lakehouse Shortcuts ---"

$shortcuts = $target.storageShortcuts
if ($SkipShortcuts) {
    Write-Host "  Skipping shortcuts (per -SkipShortcuts)" -ForegroundColor Yellow
}
elseif (-not $shortcuts.connectionId -or $shortcuts.connectionId -match '^<<') {
    Write-Host "  No connectionId in config - skipping shortcut creation." -ForegroundColor Yellow
    Write-Host "  Manual step: create shortcuts to $($shortcuts.storageAccountUrl)"
}
elseif ($WhatIf) {
    Write-Host "  [WhatIf] Would create $($shortcuts.containers.Count) shortcut(s)"
}
else {
    $shortcutUri = "$FabricBaseUri/workspaces/$workspaceId/items/$lakehouseId/shortcuts"
    foreach ($sc in $shortcuts.containers) {
        $body = @{
            name   = $sc.name
            path   = $sc.targetPath
            target = @{
                type             = 'AzureBlobStorage'
                azureBlobStorage = @{
                    connectionId = $shortcuts.connectionId
                    location     = $shortcuts.storageAccountUrl
                    subpath      = $sc.sourceSubpath
                }
            }
        }
        try {
            Invoke-FabricLro -Uri $shortcutUri -Method 'POST' -Body $body -Headers $headers | Out-Null
            Write-Host "  Shortcut created: $($sc.name)" -ForegroundColor Green
        } catch {
            $msg = ($_.Exception.Message -replace '\{', '{{') -replace '\}', '}}'
            Write-Host "  Shortcut '$($sc.name)' failed (continuing): $msg" -ForegroundColor Yellow
        }
    }
}

# ----------------------------------------------------------------------------
# STEP 4: KQL Queryset (with definition)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 4: Create KQL Queryset ---"

$kqlConfig = $config.items.kqlQueryset
$kqlDefPath = Join-Path $basePath (Join-Path $kqlConfig.definitionFolder 'RealTimeQueryset.json')

if (-not (Test-Path $kqlDefPath)) {
    Write-Host "  WARNING: KQL Queryset definition not found at $kqlDefPath" -ForegroundColor Yellow
}
else {
    $kqlContent = Get-Content $kqlDefPath -Raw
    $kqlContent = $kqlContent -replace 'https://ade\.applicationinsights\.io/subscriptions/[^"]+', $target.kustoDataSources.applicationInsights.clusterUri
    $kqlContent = $kqlContent -replace 'https://ade\.loganalytics\.io/subscriptions/[^"]+',         $target.kustoDataSources.logAnalytics.clusterUri

    if ($WhatIf) {
        Write-Host "  [WhatIf] Would create KQL Queryset: $($kqlConfig.displayName)"
        $createdItems['kqlQueryset'] = 'whatif-kql-id'
    }
    else {
        $parts = @(
            @{ path = 'RealTimeQueryset.json'; payload = (ConvertTo-Base64 -Content $kqlContent); payloadType = 'InlineBase64' },
            (New-PlatformPart -Type 'KQLQueryset' -DisplayName $kqlConfig.displayName)
        )
        $kql = New-FabricItem -WorkspaceId $workspaceId `
            -DisplayName $kqlConfig.displayName -Type 'KQLQueryset' `
            -Description $kqlConfig.description -DefinitionParts $parts `
            -Headers $headers
        $createdItems['kqlQueryset'] = $kql.id
    }
}

# ----------------------------------------------------------------------------
# STEP 5: KQL Dashboard (with definition)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 5: Create KQL Dashboard ---"

$dashConfig = $config.items.kqlDashboard
$dashDefPath = Join-Path $basePath (Join-Path $dashConfig.definitionFolder 'RealTimeDashboard.json')

if (-not (Test-Path $dashDefPath)) {
    Write-Host "  WARNING: KQL Dashboard definition not found at $dashDefPath" -ForegroundColor Yellow
}
else {
    $dashContent = Get-Content $dashDefPath -Raw
    $dashContent = $dashContent -replace 'https://ade\.applicationinsights\.io/subscriptions/[^"]+', $target.kustoDataSources.applicationInsights.clusterUri
    $dashContent = $dashContent -replace 'https://ade\.loganalytics\.io/subscriptions/[^"]+',         $target.kustoDataSources.logAnalytics.clusterUri

    if ($WhatIf) {
        Write-Host "  [WhatIf] Would create KQL Dashboard: $($dashConfig.displayName)"
        $createdItems['kqlDashboard'] = 'whatif-dash-id'
    }
    else {
        $parts = @(
            @{ path = 'RealTimeDashboard.json'; payload = (ConvertTo-Base64 -Content $dashContent); payloadType = 'InlineBase64' },
            (New-PlatformPart -Type 'KQLDashboard' -DisplayName $dashConfig.displayName)
        )
        $dash = New-FabricItem -WorkspaceId $workspaceId `
            -DisplayName $dashConfig.displayName -Type 'KQLDashboard' `
            -Description $dashConfig.description -DefinitionParts $parts `
            -Headers $headers
        $createdItems['kqlDashboard'] = $dash.id
    }
}

# ----------------------------------------------------------------------------
# STEP 6: Notebook (with definition)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 6: Create Notebook ---"

$nbConfig  = $config.items.notebook
$nbDefDir  = Join-Path $basePath $nbConfig.definitionFolder
$nbPyPath  = Join-Path $nbDefDir 'notebook-content.py'

# Prefer the source .ipynb if configured/available so markdown cells stay markdown.
$nbIpynbPath = $null
if ($nbConfig.sourceIpynbPath) {
    $candidate = Join-Path $basePath $nbConfig.sourceIpynbPath
    if (Test-Path $candidate) { $nbIpynbPath = (Resolve-Path $candidate).Path }
}
if (-not $nbIpynbPath) {
    $candidate = Join-Path $basePath "..\docs\notebooks\$($nbConfig.displayName).ipynb"
    if (Test-Path $candidate) { $nbIpynbPath = (Resolve-Path $candidate).Path }
}

if ($nbIpynbPath) {
    Write-Host "  Using source notebook: $nbIpynbPath"
    $nbJson = Get-Content $nbIpynbPath -Raw | ConvertFrom-Json

    $onelakePath = $target.notebookConfig.onelakeBasePath
    $wsResId     = $target.notebookConfig.workspaceResourceId

    # Build the global notebook header with kernel + lakehouse binding.
    $globalMeta = [ordered]@{
        kernel_info = @{ name = 'synapse_pyspark' }
        dependencies = @{
            lakehouse = [ordered]@{
                default_lakehouse              = $lakehouseId
                default_lakehouse_name         = $config.items.lakehouse.displayName
                default_lakehouse_workspace_id = $workspaceId
            }
        }
    }
    $globalMetaJson = ($globalMeta | ConvertTo-Json -Depth 10)
    $globalMetaCommented = (($globalMetaJson -split "`r?`n") | ForEach-Object { "# META $($_.TrimEnd())" }) -join "`r`n"

    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine('# Fabric notebook source')
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine('# METADATA ********************')
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine($globalMetaCommented)
    [void]$sb.AppendLine('')

    foreach ($cell in $nbJson.cells) {
        $src = ($cell.source -join '')
        if ($cell.cell_type -eq 'code') {
            $src = $src -replace '\{\{TARGET_WORKSPACE_ID\}\}', $workspaceId
            $src = $src -replace '\{\{TARGET_LAKEHOUSE_ID\}\}', $lakehouseId
            if ($onelakePath) {
                $src = $src -replace '(?m)^(ONELAKE_BASE_PATH\s*=\s*)".*"$', ('$1"' + $onelakePath + '"')
            }
            if ($wsResId) {
                $src = $src -replace '(?m)^(WORKSPACE_RESOURCE_ID\s*=\s*)".*"$', ('$1"' + $wsResId + '"')
            }
            $cellLang = 'python'
        }
        else {
            # Convert markdown to commented python so cell execution never fails.
            $mdLines = ($src -split "`r?`n") | ForEach-Object { if ($_ -eq '') { '#' } else { "# $_" } }
            $src = $mdLines -join "`r`n"
            $cellLang = 'python'
        }

        [void]$sb.AppendLine('# CELL ********************')
        [void]$sb.AppendLine('')
        [void]$sb.AppendLine($src.TrimEnd("`r","`n"))
        [void]$sb.AppendLine('')
        [void]$sb.AppendLine('# METADATA ********************')
        [void]$sb.AppendLine('')
        [void]$sb.AppendLine('# META {')
        [void]$sb.AppendLine("# META   `"language`": `"$cellLang`",")
        [void]$sb.AppendLine('# META   "language_group": "synapse_pyspark"')
        [void]$sb.AppendLine('# META }')
        [void]$sb.AppendLine('')
    }

    $nbContent = $sb.ToString()
    $nbPartPath = 'notebook-content.py'
}
elseif (Test-Path $nbPyPath) {
    Write-Host "  Using .py source: $nbPyPath" -ForegroundColor Yellow
    $nbContent = Get-Content $nbPyPath -Raw
    $nbContent = $nbContent -replace '\{\{TARGET_WORKSPACE_ID\}\}', $workspaceId
    $nbContent = $nbContent -replace '\{\{TARGET_LAKEHOUSE_ID\}\}', $lakehouseId
    if ($target.notebookConfig.onelakeBasePath) {
        $nbContent = $nbContent -replace '(?m)^(ONELAKE_BASE_PATH\s*=\s*)".*"$', ('$1"' + $target.notebookConfig.onelakeBasePath + '"')
    }
    if ($target.notebookConfig.workspaceResourceId) {
        $nbContent = $nbContent -replace '(?m)^(WORKSPACE_RESOURCE_ID\s*=\s*)".*"$', ('$1"' + $target.notebookConfig.workspaceResourceId + '"')
    }
    $nbPartPath = 'notebook-content.py'
}
else {
    Write-Host "  WARNING: No notebook source found (.ipynb or .py)" -ForegroundColor Yellow
    $nbContent = $null
}

if ($nbContent) {
    if ($WhatIf) {
        Write-Host "  [WhatIf] Would create Notebook: $($nbConfig.displayName)"
        $createdItems['notebook'] = 'whatif-notebook-id'
    }
    else {
        $parts = @(
            @{ path = $nbPartPath; payload = (ConvertTo-Base64 -Content $nbContent); payloadType = 'InlineBase64' },
            (New-PlatformPart -Type 'Notebook' -DisplayName $nbConfig.displayName)
        )
        $nb = New-FabricItem -WorkspaceId $workspaceId `
            -DisplayName $nbConfig.displayName -Type 'Notebook' `
            -Description $nbConfig.description -DefinitionParts $parts `
            -Headers $headers
        $createdItems['notebook'] = $nb.id
    }
}

# ----------------------------------------------------------------------------
# STEP 7: Semantic Model (minimal empty model - configure tables in portal)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 7: Create Semantic Model ---"

$smConfig = $config.items.semanticModel
$smId = $null

if ($WhatIf) {
    Write-Host "  [WhatIf] Would create Semantic Model: $($smConfig.displayName)"
    $createdItems['semanticModel'] = 'whatif-sm-id'
    $smId = 'whatif-sm-id'
}
else {
    $minimalBim = @{
        name              = $smConfig.displayName
        compatibilityLevel = 1604
        model             = @{
            culture                         = 'en-US'
            defaultPowerBIDataSourceVersion = 'powerBI_V3'
            tables                          = @()
        }
    } | ConvertTo-Json -Depth 10 -Compress

    $pbism = @{ version = '4.0'; settings = @{} } | ConvertTo-Json -Compress

    $parts = @(
        @{ path = 'definition.pbism'; payload = (ConvertTo-Base64 -Content $pbism);      payloadType = 'InlineBase64' },
        @{ path = 'model.bim';        payload = (ConvertTo-Base64 -Content $minimalBim); payloadType = 'InlineBase64' },
        (New-PlatformPart -Type 'SemanticModel' -DisplayName $smConfig.displayName)
    )
    $sm = New-FabricItem -WorkspaceId $workspaceId `
        -DisplayName $smConfig.displayName -Type 'SemanticModel' `
        -Description $smConfig.description -DefinitionParts $parts `
        -Headers $headers
    $smId = $sm.id
    $createdItems['semanticModel'] = $smId
    Write-Host "  NOTE: Semantic Model created empty. Configure DirectLake tables in the portal" -ForegroundColor Yellow
    Write-Host "        after running the ETL notebook to create the foundryagent_fact table." -ForegroundColor Yellow
}

# ----------------------------------------------------------------------------
# STEP 8: Report (bound to new Semantic Model)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Step 8: Create Report ---"

$reportConfig = $config.items.report
$reportDir = Join-Path $basePath $reportConfig.definitionFolder
$reportJsonPath = Join-Path $reportDir 'report.json'
$pbirPath = Join-Path $reportDir 'definition.pbir'

if (-not (Test-Path $reportJsonPath)) {
    Write-Host "  WARNING: Report definition not found at $reportJsonPath" -ForegroundColor Yellow
}
elseif (-not $smId) {
    Write-Host "  WARNING: No Semantic Model id - skipping report." -ForegroundColor Yellow
}
elseif ($WhatIf) {
    Write-Host "  [WhatIf] Would create Report: $($reportConfig.displayName) bound to SM $smId"
    $createdItems['report'] = 'whatif-report-id'
}
else {
    # Enumerate all files in the report folder (report.json, definition.pbir, StaticResources/**, etc.)
    # Skip .platform (we regenerate it) and any local export bookkeeping.
    $allFiles = Get-ChildItem -Path $reportDir -Recurse -File | Where-Object { $_.Name -ne '.platform' }
    if ($allFiles.Count -eq 0) {
        throw "No report parts found in $reportDir"
    }

    $parts = @()
    foreach ($f in $allFiles) {
        $rel = $f.FullName.Substring($reportDir.Length).TrimStart('\','/').Replace('\','/')
        $content = Get-Content $f.FullName -Raw
        if ($f.Name -eq 'definition.pbir') {
            # Rebind semantic model id and workspace name to the freshly deployed ones.
            if ($content -match 'semanticmodelid=([0-9a-fA-F-]+)') {
                $content = $content -replace 'semanticmodelid=[0-9a-fA-F-]+', "semanticmodelid=$smId"
            }
            # Replace any source workspace name in the connection string with the target workspace name.
            $targetWsName = $target.workspace.name
            $content = $content -replace 'powerbi://api\.powerbi\.com/v1\.0/myorg/[^;"\\]+', "powerbi://api.powerbi.com/v1.0/myorg/$targetWsName"
            Write-Host "  Rebinding report to SM $smId in workspace '$targetWsName'"
        }
        $parts += @{ path = $rel; payload = (ConvertTo-Base64 -Content $content); payloadType = 'InlineBase64' }
    }
    $parts += (New-PlatformPart -Type 'Report' -DisplayName $reportConfig.displayName)

    $report = New-FabricItem -WorkspaceId $workspaceId `
        -DisplayName $reportConfig.displayName -Type 'Report' `
        -Description $reportConfig.description -DefinitionParts $parts `
        -Headers $headers
    $createdItems['report'] = $report.id
}

# ----------------------------------------------------------------------------
# SUMMARY
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "=============================================="
Write-Host "DEPLOYMENT SUMMARY"
Write-Host "=============================================="
Write-Host "Workspace: $workspaceId"
Write-Host ""
Write-Host "Created Items:"
foreach ($item in $createdItems.GetEnumerator()) {
    Write-Host ("  - {0}: {1}" -f $item.Key, $item.Value)
}
Write-Host ""
Write-Host "POST-DEPLOYMENT MANUAL STEPS:" -ForegroundColor Yellow
Write-Host "  1. Run the ETL notebook to create the foundryagent_fact Delta table."
Write-Host "  2. In the Semantic Model, add the foundryagent_fact table (DirectLake)."
Write-Host "  3. Open the Report and rebind / refresh visuals against the model."
Write-Host ""
Write-Host "Deployment script completed." -ForegroundColor Green
