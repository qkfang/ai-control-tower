//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { VegaVisual, useCssTheme } from "@microsoft/fabric-visuals";
import type { VisualizationSpec, VegaLiteConfig } from "@microsoft/fabric-visuals";
import type { DataTable } from "@microsoft/fabric-visuals-core";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { toDataTable, type ColumnMetadataMap } from "@/lib/to-data-table";
import { Panel } from "./panel.component";
import { ChartSkeleton, EmptyState, ErrorState } from "./states.component";

interface VegaPanelProps {
    title?: ReactNode;
    eyebrow?: ReactNode;
    action?: ReactNode;
    /** Factory output: alias + DAX + metadata + spec. */
    connection: string;
    query: string;
    columnMetadata: ColumnMetadataMap;
    vegaLiteSpec: VisualizationSpec;
    /**
     * Optional reshaping of the query result before it reaches Vega, for
     * presentation concerns that belong in TypeScript rather than DAX
     * (for example turning raw agent ids into display names).
     */
    transform?: (table: DataTable) => DataTable;
    /** Definite chart height in px (charts need a concrete height). */
    height?: number;
    className?: string;
    configVegaLite?: VegaLiteConfig;
}

/**
 * A dashboard tile that runs a DAX query and renders the result as a
 * Vega-Lite visual, handling loading / empty / error states inside a
 * themed {@link Panel}.
 */
export function VegaPanel({
    title,
    eyebrow,
    action,
    connection,
    query,
    columnMetadata,
    vegaLiteSpec,
    transform,
    height = 240,
    className,
    configVegaLite,
}: VegaPanelProps) {
    const theme = useCssTheme();
    const { data, isLoading, error } = useSemanticModelQuery({ connection, query });

    let body: ReactNode;
    if (isLoading) {
        body = <ChartSkeleton />;
    } else if (error) {
        body = <ErrorState message={error.message} />;
    } else if (data?.status === "error") {
        body = <ErrorState message={data.error.message} />;
    } else if (data?.status === "success") {
        const raw = toDataTable(data.table, columnMetadata);
        const dataTable = transform ? transform(raw) : raw;
        if (!dataTable.rows.length) {
            body = <EmptyState />;
        } else {
            body = (
                <div style={{ height }}>
                    <VegaVisual
                        spec={vegaLiteSpec}
                        data={dataTable}
                        theme={theme}
                        configVegaLite={configVegaLite}
                        style={{ height }}
                    />
                </div>
            );
        }
    } else {
        body = <ChartSkeleton />;
    }

    return (
        <Panel title={title} eyebrow={eyebrow} action={action} className={className}>
            {body}
        </Panel>
    );
}
