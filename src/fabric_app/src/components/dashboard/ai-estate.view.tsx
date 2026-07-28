//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { agentBreakdown } from "@/queries";
import {
    formatCompact,
    formatInt,
    formatLatency,
    formatPct,
    healthLabel,
    healthTextClass,
    healthTier,
    num,
} from "@/lib/format";
import { parseAgentId } from "@/lib/agent-identity";
import { cn } from "@/lib/utils";
import { useQueryRecords } from "@/hooks/use-query-records";
import { useFilters } from "@/hooks/filters.context";
import { Panel } from "./panel.component";
import { KpiCard } from "./kpi-card.component";
import { Segmented } from "./segmented.component";
import { ChartSkeleton, EmptyState, ErrorState } from "./states.component";
import { Bot, Cpu, Gauge as GaugeIcon, Search, Timer } from "lucide-react";

const dotClass: Record<ReturnType<typeof healthTier>, string> = {
    healthy: "bg-success-foreground",
    warning: "bg-warning-foreground",
    critical: "bg-danger-foreground",
};

const barClass: Record<ReturnType<typeof healthTier>, string> = {
    healthy: "bg-success-foreground",
    warning: "bg-warning-foreground",
    critical: "bg-danger-foreground",
};

/** How the estate table is ordered. */
type SortKey = "tokens" | "invocations" | "latency" | "name";

/** Detailed inventory of every agent in the estate. */
export function AiEstateView() {
    const { daxFilters } = useFilters();
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortKey>("tokens");

    const { records, isLoading, error } = useQueryRecords(agentBreakdown({ daxFilters }));

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();

        const decorated = records.map((r) => ({
            record: r,
            identity: parseAgentId(r.AgentId),
        }));

        const matched = term
            ? decorated.filter(
                  ({ identity, record }) =>
                      identity.displayName.toLowerCase().includes(term) ||
                      identity.id.toLowerCase().includes(term) ||
                      String(record.Model ?? "").toLowerCase().includes(term),
              )
            : decorated;

        return [...matched].sort((a, b) => {
            switch (sort) {
                case "invocations":
                    return num(b.record.Invocations) - num(a.record.Invocations);
                case "latency":
                    return num(b.record.AvgDurationMs) - num(a.record.AvgDurationMs);
                case "name":
                    return a.identity.displayName.localeCompare(b.identity.displayName);
                default:
                    return num(b.record.TotalTokens) - num(a.record.TotalTokens);
            }
        });
    }, [records, search, sort]);

    const totalAgents = rows.length;
    const totalTokens = rows.reduce((sum, r) => sum + num(r.record.TotalTokens), 0);
    const totalInvocations = rows.reduce((sum, r) => sum + num(r.record.Invocations), 0);
    const avgLatency =
        totalAgents > 0
            ? rows.reduce((sum, r) => sum + num(r.record.AvgDurationMs), 0) / totalAgents
            : 0;

    return (
        <div className="flex flex-col gap-l">
            <div className="grid grid-cols-1 gap-l sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Agents" value={formatInt(totalAgents)} icon={Bot} accent="cyan" loading={isLoading} />
                <KpiCard label="Invocations" value={formatInt(totalInvocations)} icon={GaugeIcon} accent="info" loading={isLoading} />
                <KpiCard label="Tokens" value={formatCompact(totalTokens)} icon={Cpu} accent="cyan" loading={isLoading} />
                <KpiCard label="Avg Latency" value={formatLatency(avgLatency)} icon={Timer} accent="foreground" loading={isLoading} />
            </div>

            <Panel
                eyebrow="Inventory"
                title="AI Estate Explorer"
                action={
                    <div className="flex flex-wrap items-center gap-s">
                        <label className="flex items-center gap-s rounded-xl border border-border bg-card px-m py-xxs">
                            <Search className="icon-size-200 shrink-0 text-muted-foreground" />
                            <span className="sr-only">Search agents</span>
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search agents"
                                className="w-[140px] bg-transparent font-base text-300 text-foreground outline-none placeholder:text-muted-foreground"
                            />
                        </label>
                        <Segmented
                            label="Sort agents by"
                            value={sort}
                            onChange={setSort}
                            options={[
                                { value: "tokens", label: "Tokens" },
                                { value: "invocations", label: "Calls" },
                                { value: "latency", label: "Latency" },
                                { value: "name", label: "Name" },
                            ]}
                        />
                    </div>
                }
                flush
            >
                {isLoading ? (
                    <div className="p-l">
                        <ChartSkeleton />
                    </div>
                ) : error ? (
                    <ErrorState message={error.message} />
                ) : rows.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="border-b border-border">
                                    {["Agent", "Model", "Invocations", "Tokens (in / out)", "Avg Latency", "Success"].map(
                                        (h, i) => (
                                            <th
                                                key={h}
                                                className={cn(
                                                    "px-l py-m font-monospace text-100 uppercase tracking-[0.12em] text-muted-foreground",
                                                    i >= 2 && "text-right",
                                                )}
                                            >
                                                {h}
                                            </th>
                                        ),
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(({ record: r, identity }, i) => {
                                    const tier = healthTier(r.SuccessRate);
                                    return (
                                        <tr
                                            key={identity.id || i}
                                            className="border-b border-border/60 transition-colors hover:bg-secondary"
                                        >
                                            <td className="px-l py-m">
                                                <div className="flex items-center gap-m">
                                                    <span className={cn("h-[8px] w-[8px] shrink-0 rounded-full", dotClass[tier])} />
                                                    <div className="min-w-0">
                                                        <div className="truncate font-heading text-300 font-semibold text-foreground">
                                                            {identity.displayName}
                                                        </div>
                                                        <div className="truncate font-monospace text-100 text-muted-foreground">
                                                            {identity.id}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-l py-m">
                                                <span className="inline-flex items-center rounded-full border border-border bg-secondary px-s py-xxs font-monospace text-100 text-accent-foreground">
                                                    {String(r.Model)}
                                                </span>
                                            </td>
                                            <td className="px-l py-m text-right font-numeric text-300 tabular-nums text-foreground">
                                                {formatInt(r.Invocations)}
                                            </td>
                                            <td className="px-l py-m text-right">
                                                <div className="font-numeric text-300 font-semibold tabular-nums text-foreground">
                                                    {formatInt(r.TotalTokens)}
                                                </div>
                                                <div className="font-monospace text-100 text-muted-foreground">
                                                    {formatCompact(r.InputTokens)} / {formatCompact(r.OutputTokens)}
                                                </div>
                                            </td>
                                            <td className="px-l py-m text-right font-numeric text-300 tabular-nums text-foreground">
                                                {formatLatency(r.AvgDurationMs)}
                                            </td>
                                            <td className="px-l py-m">
                                                <div className="flex items-center justify-end gap-m">
                                                    <div className="hidden h-[6px] w-[80px] overflow-hidden rounded-full bg-muted-foreground/10 sm:block">
                                                        <div
                                                            className={cn("h-full rounded-full", barClass[tier])}
                                                            style={{ width: `${Math.min(100, num(r.SuccessRate))}%` }}
                                                        />
                                                    </div>
                                                    <span className={cn("font-numeric text-300 font-semibold tabular-nums", healthTextClass(tier))}>
                                                        {formatPct(r.SuccessRate)}
                                                    </span>
                                                    <span className={cn("hidden font-monospace text-100 uppercase tracking-[0.1em] md:inline", healthTextClass(tier))}>
                                                        {healthLabel(tier)}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
        </div>
    );
}
