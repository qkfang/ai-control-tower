//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { injectFilters, type FilteredQueryParams } from "@/lib/dax-filters";
import template from "./kpi-summary.dax?raw";

const connection = "controlTower";

/** Column metadata keyed by the exact DAX output column name. */
const columnMetadata: ColumnMetadataMap = {
    "[ActiveAgents]": { name: "ActiveAgents", displayName: "Active Agents", format: "#,0" },
    "[Models]": { name: "Models", displayName: "Models", format: "#,0" },
    "[Operations]": { name: "Operations", displayName: "Operations", format: "#,0" },
    "[Invocations]": { name: "Invocations", displayName: "Invocations", format: "#,0" },
    "[TotalTokens]": { name: "TotalTokens", displayName: "Total Tokens", format: "#,0" },
    "[InputTokens]": { name: "InputTokens", displayName: "Input Tokens", format: "#,0" },
    "[OutputTokens]": { name: "OutputTokens", displayName: "Output Tokens", format: "#,0" },
    "[AvgDurationMs]": { name: "AvgDurationMs", displayName: "Avg Duration (ms)", format: "#,0" },
    "[SuccessRate]": { name: "SuccessRate", displayName: "Success Rate %", format: "#,0.0" },
    "[WindowStart]": { name: "WindowStart", displayName: "Window Start" },
    "[WindowEnd]": { name: "WindowEnd", displayName: "Window End" },
};

/**
 * Executive KPI summary for the AI Control Tower — one row of scalar
 * metrics: active agents, invocations, token usage, latency, success rate.
 */
export function kpiSummary(params?: FilteredQueryParams) {
    const query = injectFilters(template, params?.daxFilters);
    return { connection, query, columnMetadata };
}
