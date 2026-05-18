# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "{{TARGET_LAKEHOUSE_ID}}",
# META       "default_lakehouse_name": "AI_Foundry_Control_Tower",
# META       "default_lakehouse_workspace_id": "{{TARGET_WORKSPACE_ID}}"
# META     }
# META   }
# META }

# CELL ********************

# Foundry Agent Fact Table ETL

#This notebook loads Foundry agent telemetry data from OneLake (Log Analytics export) and creates a Delta table (`foundryagent_fact`) in the Fabric Lakehouse.

## Data Source
# - **Storage**: Fabric OneLake (Log Analytics export via shortcut)
#- **Lakehouse**: `AI_Foundry_Control_Tower`
#- **Path**: `Files/Foundry_Control_Tower/am-appdependencies`
#- **Format**: JSON files partitioned by workspace/year/month/day/hour/minute

## Target
#- **Table**: `foundryagent_fact` (Delta format)
#- **Location**: Fabric Lakehouse (Tables)

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 1. Configuration

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# CONFIGURATION - Fabric OneLake Settings
# =============================================================================

# Fabric OneLake path (data already loaded via shortcut)
ONELAKE_BASE_PATH = "abfss://AI_Control_Tower@onelake.dfs.fabric.microsoft.com/AI_Foundry_Control_Tower.Lakehouse/Files/Foundry_Control_Tower/am-appdependencies"

# Log Analytics workspace resource path (subfolder within the above path)
WORKSPACE_RESOURCE_ID = "WorkspaceResourceId=/subscriptions/873a4995-e21b-47e2-953e-f2e88e2fa4f9/resourcegroups/rg-agentctt/providers/microsoft.operationalinsights/workspaces/agentctt-law"

# Target Delta table name
TARGET_TABLE = "foundryagent_fact"

# Processing options
INCREMENTAL_LOAD = True  # Set to False for full refresh
LOOKBACK_DAYS = 7  # For incremental: how many days to look back

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 2. Setup OneLake Connection

#Data is already available in Fabric OneLake - no additional authentication needed.

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, lit, when, to_timestamp, from_json, get_json_object,
    explode, current_timestamp, date_format, year, month, dayofmonth,
    hour, minute, coalesce, trim, regexp_extract, input_file_name
)
from pyspark.sql.types import (
    StructType, StructField, StringType, BooleanType, DoubleType,
    IntegerType, LongType, TimestampType, ArrayType, MapType
)
from datetime import datetime, timedelta
import json

# Get or create Spark session (Fabric provides this automatically)
spark = SparkSession.builder.getOrCreate()

print(f"Spark version: {spark.version}")
print(f"Target table: {TARGET_TABLE}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# FABRIC ONELAKE - No additional authentication required
# Data is accessed directly from OneLake using Fabric's built-in identity
# =============================================================================

# Build the full path to the exported data
# Structure: OneLake base path + Workspace Resource ID subfolder
BASE_PATH = f"{ONELAKE_BASE_PATH}/{WORKSPACE_RESOURCE_ID}"

print(f"OneLake base path: {ONELAKE_BASE_PATH}")
print(f"Full data path: {BASE_PATH}")

# Verify the path is accessible
try:
    files = spark.read.format("binaryFile").load(f"{ONELAKE_BASE_PATH}/*").limit(1)
    print("✓ OneLake path is accessible")
except Exception as e:
    print(f"⚠ Warning: Could not verify path - {str(e)[:100]}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 3. Define Schema for AppDependencies JSON

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Define the schema for the exported AppDependencies JSON
# This matches the Log Analytics export format

appdependencies_schema = StructType([
    StructField("TimeGenerated", StringType(), True),
    StructField("Name", StringType(), True),
    StructField("Id", StringType(), True),
    StructField("ParentId", StringType(), True),
    StructField("OperationId", StringType(), True),
    StructField("DependencyType", StringType(), True),
    StructField("DurationMs", DoubleType(), True),
    StructField("Success", BooleanType(), True),
    StructField("ResultCode", StringType(), True),
    StructField("Target", StringType(), True),
    StructField("Data", StringType(), True),
    StructField("AppRoleName", StringType(), True),
    StructField("AppRoleInstance", StringType(), True),
    StructField("ClientCity", StringType(), True),
    StructField("ClientCountryOrRegion", StringType(), True),
    StructField("ClientStateOrProvince", StringType(), True),
    StructField("ClientType", StringType(), True),
    StructField("ClientIP", StringType(), True),
    StructField("IKey", StringType(), True),
    StructField("ItemCount", IntegerType(), True),
    StructField("PerformanceBucket", StringType(), True),
    StructField("SDKVersion", StringType(), True),
    StructField("ResourceGUID", StringType(), True),
    StructField("Type", StringType(), True),
    StructField("TenantId", StringType(), True),
    StructField("_ResourceId", StringType(), True),
    StructField("_SubscriptionId", StringType(), True),
    StructField("_ItemId", StringType(), True),
    StructField("_BilledSize", IntegerType(), True),
    StructField("_IsBillable", BooleanType(), True),
    StructField("_TimeReceived", StringType(), True),
    StructField("_Internal_WorkspaceResourceId", StringType(), True),
    StructField("SourceSystem", StringType(), True),
    # Properties is a complex nested structure - keep as string and parse separately
    StructField("Properties", StringType(), True)
])

print("Schema defined for AppDependencies JSON")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 4. Build File Paths for Processing

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from datetime import datetime, timedelta

def build_path_patterns(base_path: str, lookback_days: int = 7) -> list:
    """
    Build list of path patterns for the last N days.
    The folder structure is: y=YYYY/m=MM/d=DD/h=HH/m=MM/*.json
    """
    paths = []
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=lookback_days)
    
    current_date = start_date
    while current_date <= end_date:
        year = current_date.year
        month = str(current_date.month).zfill(2)
        day = str(current_date.day).zfill(2)
        
        # Use wildcards for hours and minutes
        path = f"{base_path}/y={year}/m={month}/d={day}/h=*/m=*/*.json"
        paths.append(path)
        current_date += timedelta(days=1)
    
    return paths

# Get paths to process
if INCREMENTAL_LOAD:
    file_paths = build_path_patterns(BASE_PATH, LOOKBACK_DAYS)
    print(f"Incremental load: Processing last {LOOKBACK_DAYS} days")
else:
    # Full refresh - use wildcard for all dates
    file_paths = [f"{BASE_PATH}/y=*/m=*/d=*/h=*/m=*/*.json"]
    print("Full refresh: Processing all available data")

print(f"\nPath patterns to process: {len(file_paths)}")
for p in file_paths[:3]:
    print(f"  - {p}")
if len(file_paths) > 3:
    print(f"  ... and {len(file_paths) - 3} more")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 5. Read and Transform Data

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# READ JSON FILES WITH SCHEMA INFERENCE
# The JSON files contain mixed signal types (AI, HTTP, AAD auth) with different schemas
# We use schema inference to handle all signal types, then filter for AI signals
# =============================================================================

# Data source path - using glob pattern with recursiveFileLookup
DATA_SOURCE = f"{ONELAKE_BASE_PATH}/*"

# Check if this is first run (table doesn't exist) - determines filtering strategy
table_exists = spark.catalog.tableExists(TARGET_TABLE)
is_first_run = not table_exists

print(f"Data source: {DATA_SOURCE}")
print(f"Table exists: {table_exists}")
print(f"Mode: {'First Run - Full Load' if is_first_run else f'Incremental - Last {LOOKBACK_DAYS} days'}")
print("-" * 60)

try:
    # Read all JSON files recursively
    # Disable partition inference to avoid duplicate 'm' column issue (month vs minute)
    all_signals_df = spark.read \
        .option("recursiveFileLookup", "true") \
        .option("multiLine", "false") \
        .option("mode", "PERMISSIVE") \
        .option("columnNameOfCorruptRecord", "_corrupt_record") \
        .json(DATA_SOURCE)
    
    # Add source file information for debugging
    all_signals_df = all_signals_df.withColumn("_source_file", input_file_name())
    
    # Apply date filter ONLY for incremental runs (table already exists)
    if INCREMENTAL_LOAD and not is_first_run:
        cutoff_date = (datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"Applying date filter: TimeGenerated >= {cutoff_date}")
        all_signals_df = all_signals_df.filter(col("TimeGenerated") >= cutoff_date)
    else:
        print("Loading all historical data (first run or full refresh)")
    
    total_count = all_signals_df.count()
    print(f"✓ Loaded {total_count:,} total records from OneLake")
    
    # Show signal type distribution
    print("\nSignal type distribution:")
    all_signals_df.groupBy("DependencyType").count().orderBy(col("count").desc()).show(truncate=False)
    
    # Filter for AI dependency type only
    raw_df = all_signals_df.filter(col("DependencyType") == "AI")
    
    raw_count = raw_df.count()
    print(f"✓ Filtered to {raw_count:,} AI signal records ({(raw_count/total_count*100):.1f}% of total)")
    
except Exception as e:
    print(f"✗ Error reading data: {str(e)}")
    raise

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Preview raw data
display(raw_df.select("TimeGenerated", "Name", "DurationMs", "Success", "Properties").limit(5))

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# FILTER FOR FOUNDRY AGENT SPANS ONLY
# Properties is inferred as STRUCT - access fields directly with backticks for special characters
# =============================================================================

# Filter for Foundry agent telemetry
foundry_df = raw_df.filter(
    (col("Properties.`microsoft.foundry`") == "True") &
    (col("Properties.span_type") == "agent")
)

foundry_count = foundry_df.count()
print(f"✓ Filtered to {foundry_count:,} Foundry agent spans")
print(f"  ({(foundry_count/raw_count*100):.1f}% of total records)" if raw_count > 0 else "")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# EXTRACT AND TRANSFORM PROPERTIES FIELDS
# Properties is inferred as STRUCT - access fields directly with backticks for special characters
# =============================================================================

transformed_df = foundry_df.select(
    # Core telemetry fields
    to_timestamp(col("TimeGenerated")).alias("time_generated"),
    col("Name").alias("name"),
    col("Id").alias("span_id"),
    col("ParentId").alias("parent_id"),
    col("OperationId").alias("operation_id"),
    col("DependencyType").alias("dependency_type"),
    col("DurationMs").alias("duration_ms"),
    col("Success").alias("success"),
    col("ResultCode").alias("result_code"),
    col("Target").alias("target"),
    col("Data").alias("data"),
    
    # App and client context
    col("AppRoleName").alias("app_role_name"),
    col("AppRoleInstance").alias("app_role_instance"),
    col("ClientCity").alias("client_city"),
    col("ClientCountryOrRegion").alias("client_country"),
    col("ClientStateOrProvince").alias("client_state"),
    col("ClientType").alias("client_type"),
    col("PerformanceBucket").alias("performance_bucket"),
    col("SDKVersion").alias("sdk_version"),
    
    # Foundry agent identifiers (access STRUCT fields with backticks)
    col("Properties.`gen_ai.agent.id`").alias("agent_id"),
    col("Properties.`microsoft.a365.agent.blueprint.id`").alias("blueprint_id"),
    col("Properties.`microsoft.foundry.project.id`").alias("project_id"),
    col("Properties.`gen_ai.azure_ai_project.id`").alias("azure_ai_project_id"),
    col("Properties.`gen_ai.provider.name`").alias("provider_name"),
    
    # Model and operation
    col("Properties.`gen_ai.operation.name`").alias("operation_name"),
    col("Properties.`gen_ai.request.model`").alias("request_model"),
    col("Properties.`gen_ai.response.model`").alias("response_model"),
    col("Properties.`gen_ai.response.id`").alias("response_id"),
    
    # Token usage (cast to int)
    col("Properties.`gen_ai.usage.input_tokens`").cast(IntegerType()).alias("input_tokens"),
    col("Properties.`gen_ai.usage.output_tokens`").cast(IntegerType()).alias("output_tokens"),
    col("Properties.`gen_ai.usage.cached_tokens`").cast(IntegerType()).alias("cached_tokens"),
    
    # Messages (keep as strings for flexibility)
    col("Properties.`gen_ai.input.messages`").alias("input_messages"),
    col("Properties.`gen_ai.output.messages`").alias("output_messages"),
    col("Properties.`gen_ai.response.finish_reasons`").alias("finish_reasons"),
    
    # Azure resource identifiers
    col("TenantId").alias("tenant_id"),
    col("_ResourceId").alias("resource_id"),
    col("_SubscriptionId").alias("subscription_id"),
    col("_ItemId").alias("item_id"),
    col("IKey").alias("instrumentation_key"),
    
    # Metadata
    to_timestamp(col("_TimeReceived")).alias("time_received"),
    col("_BilledSize").alias("billed_size_bytes"),
    col("_source_file").alias("source_file")
)

print("✓ Transformed data with extracted Properties fields")
print(f"  Columns: {len(transformed_df.columns)}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# ADD COMPUTED COLUMNS FOR ANALYTICS
# =============================================================================

final_df = transformed_df \
    .withColumn("total_tokens", 
        coalesce(col("input_tokens"), lit(0)) + coalesce(col("output_tokens"), lit(0))) \
    .withColumn("duration_seconds", col("duration_ms") / 1000.0) \
    .withColumn("date_key", date_format(col("time_generated"), "yyyyMMdd").cast(IntegerType())) \
    .withColumn("hour_key", date_format(col("time_generated"), "HH").cast(IntegerType())) \
    .withColumn("year", year(col("time_generated"))) \
    .withColumn("month", month(col("time_generated"))) \
    .withColumn("day", dayofmonth(col("time_generated"))) \
    .withColumn("etl_timestamp", current_timestamp())

# Add status classification
final_df = final_df.withColumn("status",
    when(col("success") == True, "Success")
    .when(col("success") == False, "Failed")
    .otherwise("Unknown")
)

print("✓ Added computed columns")
print(f"  Final column count: {len(final_df.columns)}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Preview final transformed data
display(final_df.select(
    "time_generated", "agent_id", "blueprint_id", "operation_name",
    "request_model", "duration_ms", "success", "status",
    "input_tokens", "output_tokens", "total_tokens"
).limit(10))

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Show schema of final dataframe
final_df.printSchema()

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 6. Write to Delta Table

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# WRITE TO DELTA TABLE IN LAKEHOUSE
# =============================================================================

# The table will be created in the default Lakehouse attached to this notebook
# In Fabric, you can reference tables directly by name

if INCREMENTAL_LOAD:
    # Merge/upsert strategy for incremental loads
    # Using item_id as the unique key
    
    # First, check if table exists
    table_exists = spark.catalog.tableExists(TARGET_TABLE)
    
    if table_exists:
        print(f"Table {TARGET_TABLE} exists - performing MERGE")
        
        # Use Delta merge for upsert
        from delta.tables import DeltaTable
        
        delta_table = DeltaTable.forName(spark, TARGET_TABLE)
        
        delta_table.alias("target").merge(
            final_df.alias("source"),
            "target.item_id = source.item_id"
        ).whenMatchedUpdateAll() \
         .whenNotMatchedInsertAll() \
         .execute()
        
        print(f"✓ Merged records into {TARGET_TABLE}")
    else:
        print(f"Table {TARGET_TABLE} does not exist - creating new table")
        
        # Create new table partitioned by date for efficient querying
        final_df.write \
            .format("delta") \
            .mode("overwrite") \
            .partitionBy("year", "month") \
            .option("overwriteSchema", "true") \
            .saveAsTable(TARGET_TABLE)
        
        print(f"✓ Created new table {TARGET_TABLE}")
else:
    # Full refresh - overwrite entire table
    print(f"Full refresh - overwriting {TARGET_TABLE}")
    
    final_df.write \
        .format("delta") \
        .mode("overwrite") \
        .partitionBy("year", "month") \
        .option("overwriteSchema", "true") \
        .saveAsTable(TARGET_TABLE)
    
    print(f"✓ Overwrote table {TARGET_TABLE}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Verify the table was created/updated
result_df = spark.sql(f"SELECT COUNT(*) as record_count FROM {TARGET_TABLE}")
record_count = result_df.collect()[0]["record_count"]
print(f"\n✓ Table {TARGET_TABLE} now contains {record_count:,} records")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 7. Optimize Table (Optional)

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# OPTIMIZE DELTA TABLE FOR QUERY PERFORMANCE
# Run this periodically to compact small files and optimize Z-order
# =============================================================================

# Optimize the table (compacts small files)
spark.sql(f"OPTIMIZE {TARGET_TABLE}")
print(f"✓ Optimized table {TARGET_TABLE}")

# Z-order by commonly filtered columns for faster queries
spark.sql(f"OPTIMIZE {TARGET_TABLE} ZORDER BY (agent_id, time_generated)")
print(f"✓ Applied Z-Order optimization on agent_id, time_generated")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Vacuum old versions (retain 7 days by default)
# Uncomment to run - this deletes old data files
# spark.sql(f"VACUUM {TARGET_TABLE} RETAIN 168 HOURS")
# print(f"✓ Vacuumed old versions from {TARGET_TABLE}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 8. Validation Queries

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# VALIDATION: Agent Inventory
# =============================================================================

validation_query = f"""
SELECT 
    agent_id,
    blueprint_id,
    COUNT(*) as invocations,
    MIN(time_generated) as first_seen,
    MAX(time_generated) as last_seen,
    COLLECT_SET(request_model) as models_used
FROM {TARGET_TABLE}
GROUP BY agent_id, blueprint_id
ORDER BY invocations DESC
"""

print("Agent Inventory:")
display(spark.sql(validation_query))

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# VALIDATION: Performance Summary
# =============================================================================

perf_query = f"""
SELECT 
    agent_id,
    request_model,
    COUNT(*) as invocations,
    SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_count,
    ROUND(SUM(CASE WHEN success = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate_pct,
    ROUND(PERCENTILE(duration_ms, 0.50), 2) as p50_ms,
    ROUND(PERCENTILE(duration_ms, 0.95), 2) as p95_ms,
    ROUND(AVG(duration_ms), 2) as avg_ms
FROM {TARGET_TABLE}
GROUP BY agent_id, request_model
ORDER BY invocations DESC
"""

print("Performance Summary:")
display(spark.sql(perf_query))

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# VALIDATION: Token Usage Summary
# =============================================================================

token_query = f"""
SELECT 
    agent_id,
    request_model,
    COUNT(*) as invocations,
    SUM(COALESCE(input_tokens, 0)) as total_input_tokens,
    SUM(COALESCE(output_tokens, 0)) as total_output_tokens,
    SUM(COALESCE(total_tokens, 0)) as total_tokens,
    ROUND(AVG(COALESCE(total_tokens, 0)), 0) as avg_tokens_per_call,
    -- Estimated cost (GPT-4o pricing: $2.50/1M input, $10.00/1M output)
    ROUND(
        (SUM(COALESCE(input_tokens, 0)) / 1000000.0 * 2.50) + 
        (SUM(COALESCE(output_tokens, 0)) / 1000000.0 * 10.00), 
        4
    ) as estimated_cost_usd
FROM {TARGET_TABLE}
WHERE input_tokens IS NOT NULL OR output_tokens IS NOT NULL
GROUP BY agent_id, request_model
ORDER BY total_tokens DESC
"""

print("Token Usage Summary:")
display(spark.sql(token_query))

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# VALIDATION: Daily Activity Timeline
# =============================================================================

timeline_query = f"""
SELECT 
    DATE(time_generated) as activity_date,
    COUNT(*) as invocations,
    COUNT(DISTINCT agent_id) as unique_agents,
    SUM(COALESCE(total_tokens, 0)) as total_tokens,
    ROUND(AVG(duration_ms), 2) as avg_duration_ms,
    SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failed_count
FROM {TARGET_TABLE}
GROUP BY DATE(time_generated)
ORDER BY activity_date DESC
"""

print("Daily Activity Timeline:")
display(spark.sql(timeline_query))

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

## 9. Table Schema Reference

### foundryagent_fact Table Columns

#| Column | Type | Description |
#|--------|------|-------------|
#| time_generated | timestamp | When the telemetry was generated |
#| name | string | Dependency name |
#| span_id | string | Unique span identifier |
#| parent_id | string | Parent span ID for tracing |
#| operation_id | string | Operation correlation ID |
#| dependency_type | string | Type of dependency (AI) |
#| duration_ms | double | Request duration in milliseconds |
#| duration_seconds | double | Request duration in seconds |
#| success | boolean | Whether the request succeeded |
#| status | string | Status classification (Success/Failed/Unknown) |
#| result_code | string | Result code from the operation |
#| agent_id | string | Foundry agent identifier |
#| blueprint_id | string | Agent blueprint ID |
#| project_id | string | Foundry project ID |
#| azure_ai_project_id | string | Azure AI project resource ID |
#| provider_name | string | AI provider name |
#| operation_name | string | Operation name (e.g., invoke_agent) |
#| request_model | string | Model used for request |
#| response_model | string | Model used for response |
#| response_id | string | Response identifier |
#| input_tokens | int | Number of input tokens |
#| output_tokens | int | Number of output tokens |
#| cached_tokens | int | Number of cached tokens |
#| total_tokens | int | Total tokens (input + output) |
#| input_messages | string | JSON array of input messages |
#| output_messages | string | JSON array of output messages |
#| finish_reasons | string | Completion finish reasons |
#| app_role_name | string | Application role name |
#| client_city | string | Client city |
#| client_country | string | Client country |
#| client_state | string | Client state/province |
#| performance_bucket | string | Performance bucket classification |
#| date_key | int | Date key (YYYYMMDD) for partitioning |
#| hour_key | int | Hour key (0-23) |
#| year | int | Year (partition column) |
#| month | int | Month (partition column) |
#| day | int | Day of month |
#| etl_timestamp | timestamp | When the record was loaded |

# METADATA ********************

# META {
# META   "language": "markdown",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

print("="*60)
print("ETL COMPLETE")
print("="*60)
print(f"Table: {TARGET_TABLE}")
print(f"Records: {record_count:,}")
print(f"Mode: {'Incremental' if INCREMENTAL_LOAD else 'Full Refresh'}")
print(f"Timestamp: {datetime.utcnow().isoformat()}Z")
print("="*60)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
