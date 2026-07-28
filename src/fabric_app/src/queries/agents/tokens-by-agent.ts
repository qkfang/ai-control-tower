//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import type { DataTable } from "@microsoft/fabric-visuals-core";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { injectFilters, type FilteredQueryParams } from "@/lib/dax-filters";
import { agentDisplayName } from "@/lib/agent-identity";
import template from "./agent-breakdown.dax?raw";
import spec from "./tokens-by-agent.json";

const connection = "controlTower";

/** Column metadata keyed by the exact DAX output column name. */
const columnMetadata: ColumnMetadataMap = {
    "foundryagent_fact[agent_id]": { name: "AgentId", displayName: "Agent ID" },
    "foundryagent_fact[request_model]": { name: "Model", displayName: "Model" },
    "[Invocations]": { name: "Invocations", displayName: "Invocations", format: "#,0" },
    "[TotalTokens]": { name: "TotalTokens", displayName: "Total Tokens", format: "#,0" },
    "[InputTokens]": { name: "InputTokens", displayName: "Input Tokens", format: "#,0" },
    "[OutputTokens]": { name: "OutputTokens", displayName: "Output Tokens", format: "#,0" },
    "[AvgDurationMs]": { name: "AvgDurationMs", displayName: "Avg Latency (ms)", format: "#,0" },
    "[SuccessRate]": { name: "SuccessRate", displayName: "Success %", format: "#,0.0" },
};

/**
 * Rewrites the raw `AgentId` column into a readable `Agent` column so the
 * bar chart shows "Document Agent v2" rather than "ct-ag-doc:2".
 */
function withAgentLabels(table: DataTable): DataTable {
    const index = table.columns.findIndex((c) => c.name === "AgentId");
    if (index < 0) return table;

    return {
        columns: table.columns.map((c, i) =>
            i === index ? { ...c, name: "Agent", displayName: "Agent" } : c,
        ),
        rows: table.rows.map((row) =>
            row.map((cell, i) => (i === index ? agentDisplayName(cell) : cell)),
        ),
    };
}

/**
 * Horizontal bar of total token consumption per agent. Shares the
 * `agent-breakdown` query so the estate table and this chart stay in sync.
 */
export function tokensByAgent(params?: FilteredQueryParams) {
    const query = injectFilters(template, params?.daxFilters);
    return {
        connection,
        query,
        columnMetadata,
        vegaLiteSpec: spec as VisualizationSpec,
        transform: withAgentLabels,
    };
}
