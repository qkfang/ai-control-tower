//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { filterOptions } from "@/queries";
import { parseAgentId } from "@/lib/agent-identity";
import {
    EMPTY_FILTERS,
    activeFilterCount,
    buildFilterClauses,
    type FilterState,
} from "@/lib/dax-filters";
import { useQueryRecords } from "./use-query-records";
import { FiltersContext, type FilterOption, type FiltersContextValue } from "./filters.context";

/** Turns a `yyyyMMdd` integer key into a readable label. */
function formatDateKey(key: number): string {
    const text = String(key);
    if (text.length !== 8) return text;

    const date = new Date(
        Number(text.slice(0, 4)),
        Number(text.slice(4, 6)) - 1,
        Number(text.slice(6, 8)),
    );

    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

/** Ascending sort by label, used to keep the pickers stable. */
function byLabel<T>(a: FilterOption<T>, b: FilterOption<T>): number {
    return a.label.localeCompare(b.label);
}

/**
 * Supplies the dashboard-wide filter state. The option universe comes from
 * the model itself, so the pickers only ever offer values that exist.
 */
export function FiltersProvider({ children }: { children: ReactNode }) {
    const [filters, setFilterState] = useState<FilterState>(EMPTY_FILTERS);
    const { records, isLoading, error } = useQueryRecords(filterOptions());

    const setFilters = useCallback((patch: Partial<FilterState>) => {
        setFilterState((prev) => ({ ...prev, ...patch }));
    }, []);

    const resetFilters = useCallback(() => setFilterState(EMPTY_FILTERS), []);

    const value = useMemo<FiltersContextValue>(() => {
        const agentIds = new Set<string>();
        const operations = new Set<string>();
        const dateKeys = new Set<number>();

        for (const r of records) {
            if (r.AgentId != null) agentIds.add(String(r.AgentId));
            if (r.Operation != null) operations.add(String(r.Operation));
            if (r.DateKey != null) dateKeys.add(Number(r.DateKey));
        }

        const allAgentIds = [...agentIds];

        const agentOptions: FilterOption<string>[] = allAgentIds
            .map((id) => {
                const identity = parseAgentId(id);
                return { value: id, label: identity.displayName, hint: id };
            })
            .sort(byLabel);

        const versions = new Set(
            allAgentIds.map((id) => parseAgentId(id).version).filter(Boolean),
        );
        const versionOptions: FilterOption<string>[] = [...versions]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((v) => ({ value: v, label: `v${v}` }));

        const operationOptions: FilterOption<string>[] = [...operations]
            .map((op) => ({ value: op, label: op }))
            .sort(byLabel);

        const dateOptions: FilterOption<number>[] = [...dateKeys]
            .sort((a, b) => b - a)
            .map((key) => ({ value: key, label: formatDateKey(key) }));

        return {
            filters,
            setFilters,
            resetFilters,
            daxFilters: buildFilterClauses(filters, allAgentIds),
            activeCount: activeFilterCount(filters),
            agentOptions,
            versionOptions,
            operationOptions,
            dateOptions,
            isLoading,
            error,
        };
    }, [records, filters, setFilters, resetFilters, isLoading, error]);

    return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}
