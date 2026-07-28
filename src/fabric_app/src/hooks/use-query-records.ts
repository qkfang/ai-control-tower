//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useMemo } from "react";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { tableToRecords, type QueryRecord } from "@/lib/query-rows";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

interface RecordSource {
    connection: string;
    query: string;
    columnMetadata: ColumnMetadataMap;
}

interface UseQueryRecordsResult {
    records: QueryRecord[];
    isLoading: boolean;
    error: Error | undefined;
}

/**
 * Runs a DAX query and projects the result into plain records keyed by the
 * cleaned metadata names, for rendering in bespoke components (KPI cards,
 * custom tables) rather than Vega visuals.
 */
export function useQueryRecords(source: RecordSource): UseQueryRecordsResult {
    const { connection, query, columnMetadata } = source;
    const { data, isLoading, error } = useSemanticModelQuery({ connection, query });

    const records = useMemo(() => {
        if (data?.status === "success") {
            return tableToRecords(data.table, columnMetadata);
        }
        return [];
    }, [data, columnMetadata]);

    const queryError =
        error ?? (data?.status === "error" ? new Error(data.error.message) : undefined);

    return { records, isLoading, error: queryError };
}
