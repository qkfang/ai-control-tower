//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { injectFilters, type FilteredQueryParams } from "@/lib/dax-filters";
import template from "./agent-breakdown.dax?raw";

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
 * One row per agent with model, invocation, token, latency, and success
 * metrics. Backs the AI Estate table and per-agent breakdowns. Friendly
 * agent names are derived in `@/lib/agent-identity` rather than in DAX, so
 * newly versioned agents never render as raw ids.
 */
export function agentBreakdown(params?: FilteredQueryParams) {
    const query = injectFilters(template, params?.daxFilters);
    return { connection, query, columnMetadata };
}
