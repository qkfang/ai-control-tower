//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { parseAgentId } from "./agent-identity";

/**
 * Dashboard filters are pushed down into the DAX rather than applied to the
 * result client-side, so every measure stays correct and the payload stays
 * small as the fact table grows.
 *
 * Each `.dax` file carries one of two placeholder tokens:
 *  - {@link FILTERS_PREFIX_TOKEN} sits inside `SUMMARIZECOLUMNS`, before the
 *    name/expression pairs, where filter tables are expected.
 *  - {@link FILTERS_SUFFIX_TOKEN} sits at the tail of a `CALCULATETABLE`
 *    argument list, after the table expression.
 */

/** Token replaced by `clause, clause, ` (each clause trailed by a comma). */
export const FILTERS_PREFIX_TOKEN = "{{FILTERS_PREFIX}}";

/** Token replaced by `, clause, clause` (each clause led by a comma). */
export const FILTERS_SUFFIX_TOKEN = "{{FILTERS_SUFFIX}}";

/** Fully qualified column references used when building filter clauses. */
const COLUMN = {
    agentId: "foundryagent_fact[agent_id]",
    operation: "foundryagent_fact[operation_name]",
    dateKey: "foundryagent_fact[date_key]",
} as const;

/** The user's current filter selections. An empty array means "no filter". */
export interface FilterState {
    /** Selected raw agent ids, e.g. `ct-ag-doc:2`. */
    agentIds: string[];
    /** Selected bare version tokens, e.g. `2`. */
    versions: string[];
    /** Selected operation names, e.g. `chat`. */
    operations: string[];
    /** Selected `date_key` values, e.g. `20260723`. */
    dateKeys: number[];
}

/** The unfiltered starting state. */
export const EMPTY_FILTERS: FilterState = {
    agentIds: [],
    versions: [],
    operations: [],
    dateKeys: [],
};

/** True when no filter is narrowing the data. */
export function isUnfiltered(filters: FilterState): boolean {
    return (
        filters.agentIds.length === 0 &&
        filters.versions.length === 0 &&
        filters.operations.length === 0 &&
        filters.dateKeys.length === 0
    );
}

/** Number of filter groups currently narrowing the data. */
export function activeFilterCount(filters: FilterState): number {
    return (
        (filters.agentIds.length ? 1 : 0) +
        (filters.versions.length ? 1 : 0) +
        (filters.operations.length ? 1 : 0) +
        (filters.dateKeys.length ? 1 : 0)
    );
}

/**
 * Escapes a value for use inside a DAX string literal. Doubling embedded
 * quotes is the complete escape rule for DAX text, and guards against a
 * crafted dimension value breaking out of the literal.
 */
function daxString(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

/** Builds a `TREATAS` clause binding a set of text values to a column. */
function textClause(values: string[], column: string): string {
    return `TREATAS( { ${values.map(daxString).join(", ")} }, ${column} )`;
}

/** Builds a `TREATAS` clause binding a set of numeric values to a column. */
function numberClause(values: number[], column: string): string {
    return `TREATAS( { ${values.join(", ")} }, ${column} )`;
}

/** A clause that matches nothing, used when selections cannot overlap. */
function noRowsClause(column: string): string {
    return `FILTER( ALL( ${column} ), FALSE() )`;
}

/**
 * Resolves the agent and version pickers into a single set of agent ids.
 * Version is not a column in the model - it is encoded in the id suffix - so
 * it is resolved here against the known universe of ids rather than with
 * fragile string surgery in DAX.
 */
function resolveAgentIds(filters: FilterState, allAgentIds: string[]): string[] | undefined {
    const byVersion = filters.versions.length
        ? allAgentIds.filter((id) => filters.versions.includes(parseAgentId(id).version))
        : undefined;

    const explicit = filters.agentIds.length ? filters.agentIds : undefined;

    if (!byVersion && !explicit) return undefined;
    if (!byVersion) return explicit;
    if (!explicit) return byVersion;

    return explicit.filter((id) => byVersion.includes(id));
}

/**
 * Translates the current selections into DAX filter table expressions.
 *
 * @param filters - The user's selections.
 * @param allAgentIds - Every agent id present in the model, used to resolve
 *                      the version picker.
 */
export function buildFilterClauses(filters: FilterState, allAgentIds: string[]): string[] {
    const clauses: string[] = [];

    const agentIds = resolveAgentIds(filters, allAgentIds);
    if (agentIds) {
        clauses.push(
            agentIds.length ? textClause(agentIds, COLUMN.agentId) : noRowsClause(COLUMN.agentId),
        );
    }

    if (filters.operations.length) {
        clauses.push(textClause(filters.operations, COLUMN.operation));
    }

    if (filters.dateKeys.length) {
        clauses.push(numberClause(filters.dateKeys, COLUMN.dateKey));
    }

    return clauses;
}

/**
 * Substitutes the filter placeholders in a DAX template with the supplied
 * clauses. Templates that carry no token are returned unchanged.
 *
 * @param dax - The raw DAX template.
 * @param clauses - Output of {@link buildFilterClauses}.
 */
export function injectFilters(dax: string, clauses: string[] = []): string {
    const prefix = clauses.length ? `${clauses.join(",\n    ")},\n    ` : "";
    const suffix = clauses.length ? `,\n    ${clauses.join(",\n    ")}` : "";

    return dax
        .replaceAll(FILTERS_PREFIX_TOKEN, prefix)
        .replaceAll(FILTERS_SUFFIX_TOKEN, suffix);
}

/** Options accepted by every filter-aware query factory. */
export interface FilteredQueryParams {
    /** DAX filter clauses from {@link buildFilterClauses}. */
    daxFilters?: string[];
}
