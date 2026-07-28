//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { Bot, CalendarDays, GitBranch, RotateCcw, Terminal } from "lucide-react";
import { useFilters } from "@/hooks/filters.context";
import { FilterSelect } from "./filter-select.component";

/**
 * Dashboard-wide filter bar. Selections persist as the user moves between
 * views, and are pushed down into every DAX query rather than applied to
 * the rendered result.
 */
export function FilterBar() {
    const {
        filters,
        setFilters,
        resetFilters,
        activeCount,
        agentOptions,
        versionOptions,
        operationOptions,
        dateOptions,
        isLoading,
        error,
    } = useFilters();

    if (error) {
        return (
            <div className="border-t border-border px-l py-s">
                <p className="font-monospace text-100 text-danger-foreground">
                    Filters unavailable: {error.message}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-m border-t border-border px-l py-s">
            <FilterSelect
                label="Run window"
                icon={CalendarDays}
                options={dateOptions}
                selected={filters.dateKeys}
                onChange={(dateKeys) => setFilters({ dateKeys })}
                allLabel="All dates"
                disabled={isLoading}
                className="min-w-[180px] flex-1 sm:max-w-[220px]"
            />
            <FilterSelect
                label="Agent"
                icon={Bot}
                options={agentOptions}
                selected={filters.agentIds}
                onChange={(agentIds) => setFilters({ agentIds })}
                allLabel="All agents"
                disabled={isLoading}
                className="min-w-[180px] flex-1 sm:max-w-[240px]"
            />
            <FilterSelect
                label="Version"
                icon={GitBranch}
                options={versionOptions}
                selected={filters.versions}
                onChange={(versions) => setFilters({ versions })}
                allLabel="All versions"
                disabled={isLoading}
                className="min-w-[140px] flex-1 sm:max-w-[170px]"
            />
            <FilterSelect
                label="Operation"
                icon={Terminal}
                options={operationOptions}
                selected={filters.operations}
                onChange={(operations) => setFilters({ operations })}
                allLabel="All operations"
                disabled={isLoading}
                className="min-w-[160px] flex-1 sm:max-w-[200px]"
            />

            <button
                type="button"
                onClick={resetFilters}
                disabled={activeCount === 0}
                className="ml-auto flex shrink-0 items-center gap-s rounded-xl border border-border bg-card px-m py-s font-monospace text-100 uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
                <RotateCcw className="icon-size-200" />
                <span>Reset{activeCount > 0 ? ` (${activeCount})` : ""}</span>
            </button>
        </div>
    );
}
