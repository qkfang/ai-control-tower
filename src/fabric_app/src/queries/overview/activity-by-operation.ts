//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { injectFilters, type FilteredQueryParams } from "@/lib/dax-filters";
import template from "./activity-by-operation.dax?raw";
import spec from "./activity-by-operation.json";

const connection = "controlTower";

/** Column metadata keyed by the exact DAX output column name. */
const columnMetadata: ColumnMetadataMap = {
    "foundryagent_fact[operation_name]": { name: "Operation", displayName: "Operation" },
    "[Invocations]": { name: "Invocations", displayName: "Invocations", format: "#,0" },
    "[Tokens]": { name: "Tokens", displayName: "Tokens", format: "#,0" },
};

/**
 * Invocation volume split by runtime operation (chat vs invoke_agent).
 * Drives the "activity by operation" donut on the command centre.
 */
export function activityByOperation(params?: FilteredQueryParams) {
    const query = injectFilters(template, params?.daxFilters);
    return { connection, query, columnMetadata, vegaLiteSpec: spec as VisualizationSpec };
}
