//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { createContext, useContext } from "react";
import { EMPTY_FILTERS, type FilterState } from "@/lib/dax-filters";

/** A selectable value plus the label shown in the picker. */
export interface FilterOption<TValue> {
    value: TValue;
    label: string;
    /** Secondary text, e.g. the raw agent id behind a friendly name. */
    hint?: string;
}

/** Everything the filter bar and the views need to read or change filters. */
export interface FiltersContextValue {
    /** Current selections. */
    filters: FilterState;
    /** Merges a partial change into the current selections. */
    setFilters: (patch: Partial<FilterState>) => void;
    /** Clears every selection. */
    resetFilters: () => void;
    /** DAX filter clauses to hand to a query factory. */
    daxFilters: string[];
    /** How many filter groups are currently narrowing the data. */
    activeCount: number;

    agentOptions: FilterOption<string>[];
    versionOptions: FilterOption<string>[];
    operationOptions: FilterOption<string>[];
    dateOptions: FilterOption<number>[];

    /** True while the option universe is still loading. */
    isLoading: boolean;
    /** Set when the options query failed. */
    error: Error | undefined;
}

export const FiltersContext = createContext<FiltersContextValue>({
    filters: EMPTY_FILTERS,
    setFilters: () => {},
    resetFilters: () => {},
    daxFilters: [],
    activeCount: 0,
    agentOptions: [],
    versionOptions: [],
    operationOptions: [],
    dateOptions: [],
    isLoading: false,
    error: undefined,
});

/** Reads the dashboard filter state shared by every view. */
export function useFilters() {
    return useContext(FiltersContext);
}
