<#
.SYNOPSIS
    Export Fabric items in template-compatible format

.DESCRIPTION
    Creates deployment package matching the templates folder structure:
    - Notebook: notebook-content.py
    - SemanticModel: definition.pbism, definition/model.tmdl
    - Report: definition.pbir, report.json
    - Lakehouse: lakehouse.metadata.json, shortcuts.metadata.json
    - KQLQueryset: RealTimeQueryset.json
#>

$ErrorActionPreference = 'Stop'

$workspaceId = "474ec927-5522-4cf6-b077-315d80fe0ac3"
$basePath = Split-Path -Parent $MyInvocation.MyCommand.Path
$templatePath = "..\templates"

Write-Host "=============================================="
Write-Host "Fabric Export - Template Format"
Write-Host "=============================================="

# Get access token
$token = az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv
$headers = @{ Authorization = "Bearer $token" }

# =============================================================================
# 1. LAKEHOUSE
# =============================================================================
Write-Host "`n--- Lakehouse: AI_Foundry_Control_Tower ---"
$lhFolder = "$basePath\Lakehouse\AI_Foundry_Control_Tower"
New-Item -Path $lhFolder -ItemType Directory -Force | Out-Null

$lakehouseId = "bdbb2825-cd9b-40d1-bc7c-dda946fd3944"
$response = Invoke-RestMethod -Uri "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items/$lakehouseId/getDefinition" -Headers $headers -Method Post

if ($response.definition.parts) {
    foreach ($part in $response.definition.parts) {
        $content = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part.payload))
        $outPath = "$lhFolder\$($part.path)"
        $dir = Split-Path $outPath -Parent
        if (!(Test-Path $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
        [System.IO.File]::WriteAllText($outPath, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  Saved: $($part.path)"
    }
}

# =============================================================================
# 2. NOTEBOOK - Convert ipynb to notebook-content.py
# =============================================================================
Write-Host "`n--- Notebook: FoundryAgent_FactTable_ETL ---"
$nbFolder = "$basePath\Notebook\FoundryAgent_FactTable_ETL"
New-Item -Path $nbFolder -ItemType Directory -Force | Out-Null

# Read the local .ipynb and convert to Fabric notebook-content.py format
$ipynbPath = "..\notebooks\FoundryAgent_FactTable_ETL.ipynb"
if (Test-Path $ipynbPath) {
    $ipynbContent = Get-Content $ipynbPath -Raw
    
    # Parse the VSCode Cell format and convert to Fabric format
    $fabricContent = @"
# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse_name": "AI_Foundry_Control_Tower",
# META       "default_lakehouse_workspace_id": "{{TARGET_WORKSPACE_ID}}"
# META     }
# META   }
# META }

"@
    
    # Extract cells from the VSCode format
    $cellPattern = '<VSCode\.Cell[^>]*language="(\w+)"[^>]*>([\s\S]*?)</VSCode\.Cell>'
    $matches = [regex]::Matches($ipynbContent, $cellPattern)
    
    foreach ($match in $matches) {
        $language = $match.Groups[1].Value
        $cellContent = $match.Groups[2].Value.Trim()
        
        $fabricContent += @"

# CELL ********************

$cellContent

# METADATA ********************

# META {
# META   "language": "$language",
# META   "language_group": "synapse_pyspark"
# META }
"@
    }
    
    # Save the converted notebook
    [System.IO.File]::WriteAllText("$nbFolder\notebook-content.py", $fabricContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  Saved: notebook-content.py (converted from ipynb)"
    
    # Also keep the original ipynb for reference
    Copy-Item $ipynbPath "$nbFolder\FoundryAgent_FactTable_ETL.ipynb"
    Write-Host "  Saved: FoundryAgent_FactTable_ETL.ipynb (original)"
}
else {
    Write-Host "  WARNING: Local notebook not found at $ipynbPath"
}

# =============================================================================
# 3. SEMANTIC MODEL - Create TMDL structure
# =============================================================================
Write-Host "`n--- SemanticModel: AI_Control_Tower ---"
$smFolder = "$basePath\SemanticModel\AI_Control_Tower"
New-Item -Path "$smFolder\definition" -ItemType Directory -Force | Out-Null

# Create definition.pbism (matches template)
$pbism = @{
    version = "4.0"
    settings = @{}
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText("$smFolder\definition.pbism", $pbism, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Saved: definition.pbism"

# Create TMDL model file for foundryagent_fact table
$tmdl = @"
model Model
	culture: en-US
	defaultPowerBIDataSourceVersion: powerBI_V3
	sourceQueryCulture: en-US
	dataAccessOptions
		legacyRedirects
		returnErrorValuesAsNull

	/// Connection to Lakehouse via OneLake
	expression Lakehouse_AI_Foundry_Control_Tower = 
		let
			database = Lakehouse.Contents(null, "{{TARGET_WORKSPACE_ID}}", "AI_Foundry_Control_Tower")
		in
			database
		lineageTag: 00000000-0000-0000-0000-000000000001

	table foundryagent_fact
		lineageTag: 00000000-0000-0000-0000-000000000002
		sourceLineageTag: [dbo].[foundryagent_fact]
		
		measure 'Total Invocations' = COUNTROWS(foundryagent_fact)
			formatString: #,##0
			lineageTag: 00000000-0000-0000-0000-000000000003
		
		measure 'Total Tokens' = SUM(foundryagent_fact[total_tokens])
			formatString: #,##0
			lineageTag: 00000000-0000-0000-0000-000000000004
		
		measure 'Avg Duration (ms)' = AVERAGE(foundryagent_fact[duration_ms])
			formatString: #,##0.00
			lineageTag: 00000000-0000-0000-0000-000000000005
		
		measure 'Success Rate %' = DIVIDE(COUNTROWS(FILTER(foundryagent_fact, foundryagent_fact[success] = TRUE())), COUNTROWS(foundryagent_fact)) * 100
			formatString: 0.00%
			lineageTag: 00000000-0000-0000-0000-000000000006
		
		column time_generated
			dataType: dateTime
			sourceColumn: time_generated
			lineageTag: 00000000-0000-0000-0000-000000000010
		
		column agent_id
			dataType: string
			sourceColumn: agent_id
			lineageTag: 00000000-0000-0000-0000-000000000011
		
		column blueprint_id
			dataType: string
			sourceColumn: blueprint_id
			lineageTag: 00000000-0000-0000-0000-000000000012
		
		column operation_name
			dataType: string
			sourceColumn: operation_name
			lineageTag: 00000000-0000-0000-0000-000000000013
		
		column request_model
			dataType: string
			sourceColumn: request_model
			lineageTag: 00000000-0000-0000-0000-000000000014
		
		column duration_ms
			dataType: double
			sourceColumn: duration_ms
			lineageTag: 00000000-0000-0000-0000-000000000015
		
		column success
			dataType: boolean
			sourceColumn: success
			lineageTag: 00000000-0000-0000-0000-000000000016
		
		column status
			dataType: string
			sourceColumn: status
			lineageTag: 00000000-0000-0000-0000-000000000017
		
		column input_tokens
			dataType: int64
			sourceColumn: input_tokens
			lineageTag: 00000000-0000-0000-0000-000000000018
		
		column output_tokens
			dataType: int64
			sourceColumn: output_tokens
			lineageTag: 00000000-0000-0000-0000-000000000019
		
		column total_tokens
			dataType: int64
			sourceColumn: total_tokens
			lineageTag: 00000000-0000-0000-0000-000000000020
		
		column date_key
			dataType: int64
			sourceColumn: date_key
			lineageTag: 00000000-0000-0000-0000-000000000021
		
		column year
			dataType: int64
			sourceColumn: year
			lineageTag: 00000000-0000-0000-0000-000000000022
		
		column month
			dataType: int64
			sourceColumn: month
			lineageTag: 00000000-0000-0000-0000-000000000023
		
		partition foundryagent_fact = m
			mode: directLake
			source
				entityName: foundryagent_fact
				schemaName: dbo
				expressionSource: Lakehouse_AI_Foundry_Control_Tower
"@

[System.IO.File]::WriteAllText("$smFolder\definition\model.tmdl", $tmdl, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Saved: definition/model.tmdl"

# =============================================================================
# 4. REPORT - Create PBIR structure
# =============================================================================
Write-Host "`n--- Report: AI_ControlTower_Report ---"
$rptFolder = "$basePath\Report\AI_ControlTower_Report"
New-Item -Path $rptFolder -ItemType Directory -Force | Out-Null

# Create definition.pbir (references semantic model)
$pbir = @{
    version = "4.0"
    datasetReference = @{
        byPath = @{
            path = "../SemanticModel/AI_Control_Tower/definition.pbism"
        }
        byConnection = $null
    }
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText("$rptFolder\definition.pbir", $pbir, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Saved: definition.pbir"

# Create report.json (basic structure - can be enhanced)
$reportJson = @{
    config = '{"version":"5.59","themeCollection":{"baseTheme":{"name":"CY24SU10","version":"5.61","type":2}},"activeSectionIndex":0}'
    layoutOptimization = 0
    sections = @(
        @{
            config = "{}"
            displayName = "Agent Overview"
            displayOption = 1
            filters = "[]"
            height = 720.0
            name = "ReportSection1"
            visualContainers = @()
            width = 1280.0
        },
        @{
            config = "{}"
            displayName = "Performance Metrics"
            displayOption = 1
            filters = "[]"
            height = 720.0
            name = "ReportSection2"
            visualContainers = @()
            width = 1280.0
        },
        @{
            config = "{}"
            displayName = "Token Usage"
            displayOption = 1
            filters = "[]"
            height = 720.0
            name = "ReportSection3"
            visualContainers = @()
            width = 1280.0
        }
    )
} | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText("$rptFolder\report.json", $reportJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Saved: report.json"

# =============================================================================
# 5. KQL QUERYSET - Already exported correctly
# =============================================================================
Write-Host "`n--- KQLQueryset: Log_Analytics_KustoQueryWorkbench ---"
$kqlFolder = "$basePath\KQLQueryset\Log_Analytics_KustoQueryWorkbench"
if (!(Test-Path "$kqlFolder\RealTimeQueryset.json")) {
    $kqlId = "d2014963-e026-462d-9608-7c318b5cc1c7"
    $response = Invoke-RestMethod -Uri "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items/$kqlId/getDefinition" -Headers $headers -Method Post
    if ($response.definition.parts) {
        foreach ($part in $response.definition.parts) {
            if ($part.path -eq "RealTimeQueryset.json") {
                $content = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part.payload))
                New-Item -Path $kqlFolder -ItemType Directory -Force | Out-Null
                [System.IO.File]::WriteAllText("$kqlFolder\RealTimeQueryset.json", $content, [System.Text.UTF8Encoding]::new($false))
                Write-Host "  Saved: RealTimeQueryset.json"
            }
        }
    }
}
else {
    Write-Host "  Already exists: RealTimeQueryset.json"
}

# =============================================================================
# 6. KQL DASHBOARD
# =============================================================================
Write-Host "`n--- KQLDashboard: LA_Dashaboard ---"
$dashFolder = "$basePath\KQLDashboard\LA_Dashaboard"
if (!(Test-Path "$dashFolder\RealTimeDashboard.json")) {
    $dashId = "d39c494b-6906-4584-b1d8-6f762d20880f"
    $response = Invoke-RestMethod -Uri "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items/$dashId/getDefinition" -Headers $headers -Method Post
    if ($response.definition.parts) {
        foreach ($part in $response.definition.parts) {
            if ($part.path -eq "RealTimeDashboard.json") {
                $content = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part.payload))
                New-Item -Path $dashFolder -ItemType Directory -Force | Out-Null
                [System.IO.File]::WriteAllText("$dashFolder\RealTimeDashboard.json", $content, [System.Text.UTF8Encoding]::new($false))
                Write-Host "  Saved: RealTimeDashboard.json"
            }
        }
    }
}
else {
    Write-Host "  Already exists: RealTimeDashboard.json"
}

Write-Host "`n=============================================="
Write-Host "Export complete - Template format"
Write-Host "=============================================="
