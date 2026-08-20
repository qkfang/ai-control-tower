# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "3169a0db-1de9-41e3-804c-9b0e6aaf505e",
# META       "default_lakehouse_name": "AI_Foundry_Control_Tower",
# META       "default_lakehouse_workspace_id": "187645de-b325-455e-85ca-08f47beac19e",
# META       "known_lakehouses": [
# META         {
# META           "id": "3169a0db-1de9-41e3-804c-9b0e6aaf505e"
# META         }
# META       ]
# META     }
# META   }
# META }

# CELL ********************

# =============================================================================
# Foundry Agent fact table ETL - non-interactive job
# Only the partitions covered by LOOKBACK_DAYS are scanned unless FULL_LOAD.
# =============================================================================

# Relative to the attached default lakehouse, or a full abfss:// URL when the
# Log Analytics export lands in a different workspace or lakehouse.
ONELAKE_BASE_PATH = "Files/Foundry_Control_Tower/am-appdependencies"

# Leave empty to auto-discover the WorkspaceResourceId=/subscriptions/.../workspaces/<law>
# folder. Set it only to pin the job to one Log Analytics workspace.
WORKSPACE_RESOURCE_ID = ""

TARGET_TABLE = "foundryagent_fact"

LOOKBACK_DAYS = 90       # source day partitions to scan and merge
FULL_LOAD = False       # True = scan every partition and overwrite the table
RUN_OPTIMIZE = False    # True = OPTIMIZE/ZORDER the touched partitions after loading


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from datetime import datetime, timedelta, timezone

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    coalesce, col, current_timestamp, date_format, dayofmonth, from_json,
    input_file_name, lit, lower, month, to_json, to_timestamp, when, year
)
from pyspark.sql.types import IntegerType, MapType, StringType

try:
    import notebookutils
except ImportError:
    notebookutils = None

spark = SparkSession.builder.getOrCreate()
spark.conf.set("spark.sql.files.ignoreMissingFiles", "true")
spark.conf.set("spark.sql.files.ignoreCorruptFiles", "true")

_hadoop_conf = spark._jsc.hadoopConfiguration()
_HadoopPath = spark._jvm.org.apache.hadoop.fs.Path


def _resolve(path: str):
    jpath = _HadoopPath(path)
    return jpath.getFileSystem(_hadoop_conf), jpath


def _exists(path: str) -> bool:
    fs, jpath = _resolve(path)
    return fs.exists(jpath)


def _list_dirs(path: str):
    fs, jpath = _resolve(path)
    if not fs.exists(jpath):
        return []
    return [s.getPath().toString() for s in fs.listStatus(jpath) if s.isDirectory()]


def finish(message: str):
    """End the run cleanly so a pipeline sees a success instead of an error."""
    print(message)
    if notebookutils is not None:
        notebookutils.notebook.exit(message)
    raise SystemExit(message)


EXPORT_ROOT = ONELAKE_BASE_PATH.rstrip("/")
if WORKSPACE_RESOURCE_ID:
    EXPORT_ROOT = f"{EXPORT_ROOT}/{WORKSPACE_RESOURCE_ID.strip('/')}"

if not _exists(EXPORT_ROOT):
    raise FileNotFoundError(
        f"Export root not found: {EXPORT_ROOT}. Check ONELAKE_BASE_PATH and the attached lakehouse."
    )


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# PARTITION PRUNING
# Resolve only the y=/m=/d= folders inside the lookback window so Spark never
# lists or infers a schema over the full export tree.
# =============================================================================


def discover_partition_roots(root: str, max_depth: int = 12):
    """Walk down from the export root to the folders that directly hold y=YYYY.

    The Log Analytics export inserts a WorkspaceResourceId=/subscriptions/.../
    workspaces/<law> prefix whose contents differ per tenant, so it is discovered
    instead of hard-coded.
    """
    frontier = [root]
    for _ in range(max_depth):
        if not frontier:
            break
        children = {path: _list_dirs(path) for path in frontier}
        found = [p for p, kids in children.items()
                 if any(k.rsplit("/", 1)[-1].startswith("y=") for k in kids)]
        if found:
            return sorted(found)
        frontier = [k for kids in children.values() for k in kids]
    return []


partition_roots = discover_partition_roots(EXPORT_ROOT)
if not partition_roots:
    raise FileNotFoundError(f"No y=YYYY date partitions found under {EXPORT_ROOT}")

run_time = datetime.now(timezone.utc)

if FULL_LOAD:
    scan_days = []
    read_paths = list(partition_roots)
    cutoff = None
else:
    scan_days = [(run_time - timedelta(days=offset)).date() for offset in range(LOOKBACK_DAYS - 1, -1, -1)]
    read_paths = [
        path
        for root in partition_roots
        for path in (f"{root}/y={d.year}/m={d.month:02d}/d={d.day:02d}" for d in scan_days)
        if _exists(path)
    ]
    cutoff = (run_time - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")

year_months = sorted({(d.year, d.month) for d in scan_days})
min_date_key = int(min(scan_days).strftime("%Y%m%d")) if scan_days else None

print(f"Mode: {'FULL_LOAD' if FULL_LOAD else f'incremental / last {LOOKBACK_DAYS} days'}")
for root in partition_roots:
    print(f"Export root: {root}")
print(f"Day partitions to scan: {len(read_paths)}")

if not read_paths:
    available = sorted(
        f"{y.rsplit('/', 1)[-1]}/{m.rsplit('/', 1)[-1]}"
        for root in partition_roots for y in _list_dirs(root) for m in _list_dirs(y)
    )
    print(f"Partitions present in the export: {', '.join(available) or 'none'}")


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# READ AND FILTER
# =============================================================================

if not read_paths:
    finish("No source partitions found in the lookback window - nothing to load.")

raw_df = (
    spark.read
    .option("recursiveFileLookup", "true")  # also avoids the duplicate m= (month/minute) partition column
    .option("mode", "PERMISSIVE")
    .json(read_paths)
    .filter(col("DependencyType") == "AI")
    .withColumn("_source_file", input_file_name())
)

if cutoff:
    raw_df = raw_df.filter(col("TimeGenerated") >= cutoff)

# Properties is a nested object in some tenants and a JSON-encoded string in
# others; normalize both to a map so field access does not depend on inference.
properties_dtype = dict(raw_df.dtypes).get("Properties", "")
properties_json = to_json(col("Properties")) if properties_dtype.startswith(("struct", "map")) else col("Properties")

foundry_df = (
    raw_df
    .withColumn("props", from_json(properties_json, MapType(StringType(), StringType())))
    .filter(
        (lower(col("props").getItem("microsoft.foundry")) == "true")
        & (lower(col("props").getItem("span_type")) == "agent")
    )
)


def prop(key):
    return col("props").getItem(key)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# TRANSFORM
# =============================================================================

final_df = foundry_df.select(
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

    col("AppRoleName").alias("app_role_name"),
    col("AppRoleInstance").alias("app_role_instance"),
    col("ClientCity").alias("client_city"),
    col("ClientCountryOrRegion").alias("client_country"),
    col("ClientStateOrProvince").alias("client_state"),
    col("ClientType").alias("client_type"),
    col("PerformanceBucket").alias("performance_bucket"),
    col("SDKVersion").alias("sdk_version"),

    prop("gen_ai.agent.id").alias("agent_id"),
    prop("microsoft.a365.agent.blueprint.id").alias("blueprint_id"),
    prop("microsoft.foundry.project.id").alias("project_id"),
    prop("gen_ai.azure_ai_project.id").alias("azure_ai_project_id"),
    prop("gen_ai.provider.name").alias("provider_name"),

    prop("gen_ai.operation.name").alias("operation_name"),
    prop("gen_ai.request.model").alias("request_model"),
    prop("gen_ai.response.model").alias("response_model"),
    prop("gen_ai.response.id").alias("response_id"),

    prop("gen_ai.usage.input_tokens").cast(IntegerType()).alias("input_tokens"),
    prop("gen_ai.usage.output_tokens").cast(IntegerType()).alias("output_tokens"),
    prop("gen_ai.usage.cached_tokens").cast(IntegerType()).alias("cached_tokens"),

    prop("gen_ai.input.messages").alias("input_messages"),
    prop("gen_ai.output.messages").alias("output_messages"),
    prop("gen_ai.response.finish_reasons").alias("finish_reasons"),

    col("TenantId").alias("tenant_id"),
    col("_ResourceId").alias("resource_id"),
    col("_SubscriptionId").alias("subscription_id"),
    col("_ItemId").alias("item_id"),
    col("IKey").alias("instrumentation_key"),

    to_timestamp(col("_TimeReceived")).alias("time_received"),
    col("_BilledSize").alias("billed_size_bytes"),
    col("_source_file").alias("source_file"),
).withColumn(
    "total_tokens", coalesce(col("input_tokens"), lit(0)) + coalesce(col("output_tokens"), lit(0))
).withColumn(
    "duration_seconds", col("duration_ms") / 1000.0
).withColumn(
    "date_key", date_format(col("time_generated"), "yyyyMMdd").cast(IntegerType())
).withColumn(
    "hour_key", date_format(col("time_generated"), "HH").cast(IntegerType())
).withColumn(
    "year", year(col("time_generated"))
).withColumn(
    "month", month(col("time_generated"))
).withColumn(
    "day", dayofmonth(col("time_generated"))
).withColumn(
    "etl_timestamp", current_timestamp()
).withColumn(
    "status",
    when(col("success") == True, "Success").when(col("success") == False, "Failed").otherwise("Unknown"),
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# WRITE TO DELTA
# Incremental runs merge only into the partitions covered by the lookback window.
# =============================================================================

final_df.persist()
record_count = final_df.count()

if record_count == 0:
    final_df.unpersist()
    finish("No Foundry agent spans in the scanned window - table unchanged.")

if FULL_LOAD or not spark.catalog.tableExists(TARGET_TABLE):
    (final_df.write
        .format("delta")
        .mode("overwrite")
        .partitionBy("year", "month")
        .option("overwriteSchema", "true")
        .saveAsTable(TARGET_TABLE))
    print(f"Wrote {record_count:,} rows to {TARGET_TABLE} (overwrite)")
else:
    from delta.tables import DeltaTable

    target_partitions = " OR ".join(f"(target.year = {y} AND target.month = {m})" for y, m in year_months)
    merge_condition = (
        f"target.item_id = source.item_id AND ({target_partitions}) AND target.date_key >= {min_date_key}"
    )

    (DeltaTable.forName(spark, TARGET_TABLE).alias("target")
        .merge(final_df.alias("source"), merge_condition)
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute())
    print(f"Merged {record_count:,} rows into {TARGET_TABLE}")

final_df.unpersist()

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# =============================================================================
# MAINTENANCE AND EXIT
# =============================================================================

if RUN_OPTIMIZE:
    if FULL_LOAD or not year_months:
        spark.sql(f"OPTIMIZE {TARGET_TABLE} ZORDER BY (agent_id, time_generated)")
    else:
        partition_filter = " OR ".join(f"(year = {y} AND month = {m})" for y, m in year_months)
        spark.sql(f"OPTIMIZE {TARGET_TABLE} WHERE {partition_filter} ZORDER BY (agent_id, time_generated)")
    print("Optimize complete")

finish(f"ETL complete - {record_count} rows processed into {TARGET_TABLE}")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
