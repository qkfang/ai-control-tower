//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { injectFilters, type FilteredQueryParams } from "@/lib/dax-filters";
import template from "./activity-trend.dax?raw";
import spec from "./activity-trend.json";

const connection = "controlTower";

/** The measure plotted on the Y axis of the trend. */
export type TrendMetric = "Tokens" | "InputTokens" | "OutputTokens" | "Invocations";

/** Axis titles for each plottable measure. */
export const TREND_METRIC_LABELS: Record<TrendMetric, string> = {
    Tokens: "Total Tokens",
    InputTokens: "Input Tokens",
    OutputTokens: "Output Tokens",
    Invocations: "Invocations",
};

/** Time granularity of each point on the trend. */
export type TrendBucket = "15m" | "1h" | "1d";

/** Bucket width in minutes, substituted into the DAX template. */
const BUCKET_MINUTES: Record<TrendBucket, number> = {
    "15m": 15,
    "1h": 60,
    "1d": 1440,
};

/** Human labels for the granularity picker. */
export const TREND_BUCKET_LABELS: Record<TrendBucket, string> = {
    "15m": "15 min",
    "1h": "1 hour",
    "1d": "1 day",
};

/** Column metadata keyed by the exact DAX output column name. */
const columnMetadata: ColumnMetadataMap = {
    "[Bucket]": { name: "Bucket", displayName: "Time" },
    "[Tokens]": { name: "Tokens", displayName: "Total Tokens", format: "#,0" },
    "[InputTokens]": { name: "InputTokens", displayName: "Input Tokens", format: "#,0" },
    "[OutputTokens]": { name: "OutputTokens", displayName: "Output Tokens", format: "#,0" },
    "[Invocations]": { name: "Invocations", displayName: "Invocations", format: "#,0" },
};

interface ActivityTrendParams extends FilteredQueryParams {
    /** Which measure to plot. Defaults to `"Tokens"`. */
    metric?: TrendMetric;
    /** Time granularity of each point. Defaults to `"15m"`. */
    bucket?: TrendBucket;
}

/**
 * Token / invocation volume over time, bucketed to the requested
 * granularity. Drives the executive "activity trend" area chart.
 */
export function activityTrend(params?: ActivityTrendParams) {
    const metric = params?.metric ?? "Tokens";
    const bucket = params?.bucket ?? "15m";

    const query = injectFilters(template, params?.daxFilters).replaceAll(
        "{{BUCKET_MINUTES}}",
        String(BUCKET_MINUTES[bucket]),
    );

    const vegaLiteSpec = structuredClone(spec) as VisualizationSpec;

    // Point the Y encoding at the requested measure.
    const encoding = (vegaLiteSpec as { encoding: { y: { field: string; title: string } } }).encoding;
    encoding.y.field = metric;
    encoding.y.title = TREND_METRIC_LABELS[metric];

    return { connection, query, columnMetadata, vegaLiteSpec };
}
