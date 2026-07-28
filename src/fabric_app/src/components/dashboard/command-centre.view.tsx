//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useState } from "react";
import { Activity, Bot, Boxes, Clock, Coins, Cpu, ShieldCheck } from "lucide-react";
import {
    activityByOperation,
    activityTrend,
    agentBreakdown,
    kpiSummary,
    type TrendBucket,
    type TrendMetric,
} from "@/queries";
import {
    formatCompact,
    formatInt,
    formatLatency,
    formatPct,
    healthLabel,
    healthTextClass,
    healthTier,
    num,
    type HealthTier,
} from "@/lib/format";
import { agentDisplayName } from "@/lib/agent-identity";
import { cn } from "@/lib/utils";
import { useQueryRecords } from "@/hooks/use-query-records";
import { useFilters } from "@/hooks/filters.context";
import { KpiCard } from "./kpi-card.component";
import { Panel } from "./panel.component";
import { VegaPanel } from "./vega-panel.component";
import { Segmented } from "./segmented.component";
import { Gauge } from "./gauge.component";
import { ChartSkeleton, EmptyState, ErrorState } from "./states.component";

/** Executive overview: fleet KPIs, health, activity, and top consumers. */
export function CommandCentreView() {
    const { daxFilters } = useFilters();
    const [metric, setMetric] = useState<TrendMetric>("Tokens");
    const [bucket, setBucket] = useState<TrendBucket>("15m");

    const kpi = kpiSummary({ daxFilters });
    const kpiState = useQueryRecords(kpi);
    const summary = kpiState.records[0];

    const agents = agentBreakdown({ daxFilters });
    const agentState = useQueryRecords(agents);

    const trend = activityTrend({ metric, bucket, daxFilters });
    const operations = activityByOperation({ daxFilters });

    const successTier = healthTier(summary?.SuccessRate);

    return (
        <div className="flex flex-col gap-l">
            {/* KPI row */}
            <div className="grid grid-cols-1 gap-l sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    label="Active Agents"
                    value={formatInt(summary?.ActiveAgents)}
                    sub={`${formatInt(summary?.Models)} models · ${formatInt(summary?.Operations)} operations`}
                    icon={Bot}
                    accent="cyan"
                    loading={kpiState.isLoading}
                />
                <KpiCard
                    label="Total Invocations"
                    value={formatInt(summary?.Invocations)}
                    sub={`across ${formatInt(summary?.ActiveAgents)} agents`}
                    icon={Activity}
                    accent="info"
                    loading={kpiState.isLoading}
                />
                <KpiCard
                    label="Total Tokens"
                    value={formatCompact(summary?.TotalTokens)}
                    sub={`in ${formatCompact(summary?.InputTokens)} · out ${formatCompact(summary?.OutputTokens)}`}
                    icon={Coins}
                    accent="cyan"
                    loading={kpiState.isLoading}
                />
                <KpiCard
                    label="Success Rate"
                    value={formatPct(summary?.SuccessRate)}
                    sub={`avg latency ${formatLatency(summary?.AvgDurationMs)}`}
                    icon={ShieldCheck}
                    accent={successTier === "healthy" ? "success" : successTier === "warning" ? "warning" : "danger"}
                    loading={kpiState.isLoading}
                />
            </div>

            {/* Health + activity row */}
            <div className="grid grid-cols-1 gap-l lg:grid-cols-12">
                <AgentHealthPanel
                    className="lg:col-span-4"
                    records={agentState.records}
                    isLoading={agentState.isLoading}
                    error={agentState.error}
                    overallSuccess={num(summary?.SuccessRate)}
                />
                <VegaPanel
                    className="lg:col-span-5"
                    eyebrow="Throughput"
                    title="Activity Trend"
                    action={
                        <div className="flex flex-wrap items-center gap-s">
                            <Segmented
                                label="Trend metric"
                                value={metric}
                                onChange={setMetric}
                                options={[
                                    { value: "Tokens", label: "Tokens" },
                                    { value: "Invocations", label: "Calls" },
                                ]}
                            />
                            <Segmented
                                label="Trend granularity"
                                value={bucket}
                                onChange={setBucket}
                                options={[
                                    { value: "15m", label: "15m" },
                                    { value: "1h", label: "1h" },
                                    { value: "1d", label: "1d" },
                                ]}
                            />
                        </div>
                    }
                    height={240}
                    {...trend}
                />
                <VegaPanel
                    className="lg:col-span-3"
                    eyebrow="Runtime"
                    title="By Operation"
                    height={240}
                    {...operations}
                />
            </div>

            {/* Top consumers + fleet row */}
            <div className="grid grid-cols-1 gap-l lg:grid-cols-12">
                <TopAgentsPanel
                    className="lg:col-span-8"
                    records={agentState.records}
                    isLoading={agentState.isLoading}
                    error={agentState.error}
                />
                <FleetStatusPanel
                    className="lg:col-span-4"
                    summary={summary}
                    model={agentState.records[0]?.Model as string | undefined}
                    isLoading={kpiState.isLoading}
                />
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------- */
/* Agent health                                                            */
/* ---------------------------------------------------------------------- */

interface AgentPanelProps {
    className?: string;
    records: ReturnType<typeof useQueryRecords>["records"];
    isLoading: boolean;
    error: Error | undefined;
}

function AgentHealthPanel({
    className,
    records,
    isLoading,
    error,
    overallSuccess,
}: AgentPanelProps & { overallSuccess: number }) {
    const tiers: Record<HealthTier, number> = { healthy: 0, warning: 0, critical: 0 };
    for (const r of records) tiers[healthTier(r.SuccessRate)] += 1;

    const legend: { tier: HealthTier; count: number }[] = [
        { tier: "healthy", count: tiers.healthy },
        { tier: "warning", count: tiers.warning },
        { tier: "critical", count: tiers.critical },
    ];

    const tone =
        healthTier(overallSuccess) === "healthy"
            ? "success"
            : healthTier(overallSuccess) === "warning"
              ? "warning"
              : "danger";

    return (
        <Panel className={className} eyebrow="Fleet" title="Agent Health">
            {isLoading ? (
                <ChartSkeleton />
            ) : error ? (
                <ErrorState message={error.message} />
            ) : records.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="flex h-full flex-col items-center justify-center gap-l py-s">
                    <Gauge value={overallSuccess} tone={tone} caption="Success" />
                    <div className="grid w-full grid-cols-3 gap-s">
                        {legend.map(({ tier, count }) => (
                            <div
                                key={tier}
                                className="flex flex-col items-center rounded-xl border border-border bg-secondary px-s py-m"
                            >
                                <span className={cn("font-numeric text-500 font-semibold tabular-nums", healthTextClass(tier))}>
                                    {count}
                                </span>
                                <span className="mt-xxs font-monospace text-100 uppercase tracking-[0.12em] text-muted-foreground">
                                    {healthLabel(tier)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Panel>
    );
}

/* ---------------------------------------------------------------------- */
/* Top agents by tokens                                                    */
/* ---------------------------------------------------------------------- */

function TopAgentsPanel({ className, records, isLoading, error }: AgentPanelProps) {
    const ranked = [...records].sort((a, b) => num(b.TotalTokens) - num(a.TotalTokens));
    const max = ranked.length ? num(ranked[0].TotalTokens) : 0;

    return (
        <Panel
            className={className}
            eyebrow="Consumption"
            title="Top Agents by Tokens"
            action={
                <span className="font-monospace text-100 uppercase tracking-[0.14em] text-muted-foreground">
                    tokens · invocations
                </span>
            }
        >
            {isLoading ? (
                <ChartSkeleton />
            ) : error ? (
                <ErrorState message={error.message} />
            ) : ranked.length === 0 ? (
                <EmptyState />
            ) : (
                <ul className="flex flex-col gap-s">
                    {ranked.map((r, i) => {
                        const tokens = num(r.TotalTokens);
                        const pct = max > 0 ? (tokens / max) * 100 : 0;
                        const tier = healthTier(r.SuccessRate);
                        return (
                            <li
                                key={String(r.AgentId ?? i)}
                                className="flex items-center gap-m rounded-xl border border-border bg-secondary px-m py-s"
                            >
                                <span className="font-numeric text-200 tabular-nums text-muted-foreground">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-m">
                                        <span className="truncate font-heading text-300 font-semibold text-foreground">
                                            {agentDisplayName(r.AgentId)}
                                        </span>
                                        <span className="shrink-0 font-numeric text-300 font-semibold tabular-nums text-cyan-foreground">
                                            {formatInt(tokens)}
                                        </span>
                                    </div>
                                    <div className="mt-xs flex items-center gap-m">
                                        <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-muted-foreground/10">
                                            <div
                                                className="h-full rounded-full bg-cyan"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="shrink-0 font-monospace text-100 text-muted-foreground">
                                            {formatInt(r.Invocations)} inv · {formatLatency(r.AvgDurationMs)}
                                        </span>
                                    </div>
                                </div>
                                <span
                                    className={cn(
                                        "shrink-0 rounded-full border border-border px-s py-xxs font-monospace text-100 uppercase tracking-[0.1em]",
                                        healthTextClass(tier),
                                    )}
                                >
                                    {formatPct(r.SuccessRate)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}

/* ---------------------------------------------------------------------- */
/* Fleet status                                                            */
/* ---------------------------------------------------------------------- */

function FleetStatusPanel({
    className,
    summary,
    model,
    isLoading,
}: {
    className?: string;
    summary: ReturnType<typeof useQueryRecords>["records"][number] | undefined;
    model: string | undefined;
    isLoading: boolean;
}) {
    const rows: { icon: typeof Cpu; label: string; value: string }[] = [
        { icon: Cpu, label: "Model Fleet", value: model ?? "—" },
        { icon: Boxes, label: "Operations", value: formatInt(summary?.Operations) },
        { icon: Bot, label: "Active Agents", value: formatInt(summary?.ActiveAgents) },
        { icon: Clock, label: "Avg Latency", value: formatLatency(summary?.AvgDurationMs) },
    ];

    return (
        <Panel className={className} eyebrow="Environment" title="Fleet Status">
            {isLoading ? (
                <ChartSkeleton />
            ) : (
                <div className="flex h-full flex-col gap-s">
                    <div className="flex items-center gap-s rounded-xl border border-success/30 bg-success/10 px-m py-s">
                        <span className="relative flex h-[8px] w-[8px]">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-foreground opacity-60" />
                            <span className="relative inline-flex h-[8px] w-[8px] rounded-full bg-success-foreground" />
                        </span>
                        <span className="font-monospace text-100 uppercase tracking-[0.16em] text-success-foreground">
                            Monitoring · Live
                        </span>
                    </div>
                    {rows.map((row) => (
                        <div
                            key={row.label}
                            className="flex items-center justify-between gap-m rounded-xl border border-border bg-secondary px-m py-s"
                        >
                            <span className="flex items-center gap-s font-base text-200 text-muted-foreground">
                                <row.icon className="icon-size-200 text-muted-foreground" />
                                {row.label}
                            </span>
                            <span className="truncate font-numeric text-300 font-semibold tabular-nums text-foreground">
                                {row.value}
                            </span>
                        </div>
                    ))}
                    <p className="mt-auto font-monospace text-100 leading-200 text-muted-foreground">
                        Window {formatWindow(summary?.WindowStart)} → {formatWindow(summary?.WindowEnd)}
                    </p>
                </div>
            )}
        </Panel>
    );
}

/** Format an ISO timestamp from the model into a compact local date-time. */
function formatWindow(value: unknown): string {
    if (typeof value !== "string") return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
