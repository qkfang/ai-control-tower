//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ColumnMetadataMap } from "@/lib/to-data-table";
import type { QueryTable } from "@microsoft/fabric-app-data";

/** A single query row projected to a keyed record. */
export type QueryRecord = Record<string, string | number | boolean | null>;

/**
 * Projects a raw SDK {@link QueryTable} into an array of plain records,
 * keyed by the cleaned `name` from the column metadata when available
 * (e.g. `TotalTokens`), otherwise the raw DAX column name.
 *
 * This is the counterpart to {@link import("./to-data-table").toDataTable}
 * for cases where the app renders values in custom components (KPI cards,
 * bespoke tables) rather than handing a `DataTable` to a visual.
 */
export function tableToRecords(
    table: QueryTable,
    columnMetadata: ColumnMetadataMap,
): QueryRecord[] {
    const keys = table.columns.map(
        (col) => columnMetadata[col.name]?.name ?? col.name,
    );

    return table.rows.map((row) => {
        const record: QueryRecord = {};
        keys.forEach((key, i) => {
            record[key] = row[i] as QueryRecord[string];
        });
        return record;
    });
}

/** Convenience for single-row (`ROW(...)`) results. Returns `undefined` if empty. */
export function firstRecord(
    table: QueryTable,
    columnMetadata: ColumnMetadataMap,
): QueryRecord | undefined {
    return tableToRecords(table, columnMetadata)[0];
}
