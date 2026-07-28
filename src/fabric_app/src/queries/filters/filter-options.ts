//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./filter-options.dax?raw";

const connection = "controlTower";

/** Column metadata keyed by the exact DAX output column name. */
const columnMetadata: ColumnMetadataMap = {
    "foundryagent_fact[agent_id]": { name: "AgentId", displayName: "Agent ID" },
    "foundryagent_fact[operation_name]": { name: "Operation", displayName: "Operation" },
    "foundryagent_fact[date_key]": { name: "DateKey", displayName: "Date" },
};

/**
 * Every agent / operation / date combination present in the model. Populates
 * the filter pickers, and is deliberately never filtered itself so the
 * available choices stay stable as the user narrows the dashboard.
 */
export function filterOptions() {
    return { connection, query, columnMetadata };
}
