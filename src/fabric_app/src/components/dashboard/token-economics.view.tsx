//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Divide, Sigma } from "lucide-react";
import {
    activityTrend,
    agentBreakdown,
    kpiSummary,
    tokensByAgent,
    type TrendBucket,
} from "@/queries";
import { formatCompact, formatInt, formatPct, num } from "@/lib/format";
import { agentDisplayName } from "@/lib/agent-identity";
import { cn } from "@/lib/utils";
import { useQueryRecords } from "@/hooks/use-query-records";
import { useFilters } from "@/hooks/filters.context";
import { KpiCard } from "./kpi-card.component";
import { Panel } from "./panel.component";
import { VegaPanel } from "./vega-panel.component";
import { Segmented } from "./segmented.component";
import { ChartSkeleton, EmptyState, ErrorState } from "./states.component";

/** Which slice of the token flow the page is currently focused on. */
type Direction = "Tokens" | "InputTokens" | "OutputTokens";

/** The `agentBreakdown` record field backing each direction. */
const DIRECTION_FIELD: Record<Direction, string> = {
    Tokens: "TotalTokens",
    InputTokens: "InputTokens",
    OutputTokens: "OutputTokens",
};

/** Token consumption economics: volume, input/output split, per-agent efficiency. */
export function TokenEconomicsView() {
    const { daxFilters } = useFilters();
    const [direction, setDirection] = useState<Direction>("Tokens");
    const [bucket, setBucket] = useState<TrendBucket>("15m");

    const kpiState = useQueryRecords(kpiSummary({ daxFilters }));
    const summary = kpiState.records[0];
    const agentState = useQueryRecords(agentBreakdown({ daxFilters }));

    const total = num(summary?.TotalTokens);
    const input = num(summary?.InputTokens);
    const output = num(summary?.OutputTokens);
    const invocations = num(summary?.Invocations);
    const perInvocation = invocations > 0 ? Math.round(total / invocations) : 0;
    const outputShare = total > 0 ? (output / total) * 100 : 0;

    return (
        <div className="flex flex-col gap-l">
            <div className="grid grid-cols-1 gap-l sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Total Tokens" value={formatCompact(total)} sub={`${formatInt(total)} tokens`} icon={Sigma} accent="cyan" loading={kpiState.isLoading} />
                <KpiCard label="Input Tokens" value={formatCompact(input)} sub={`${formatPct(100 - outputShare)} of total`} icon={ArrowDownLeft} accent="info" loading={kpiState.isLoading} />
                <KpiCard label="Output Tokens" value={formatCompact(output)} sub={`${formatPct(outputShare)} of total`} icon={ArrowUpRight} accent="cyan" loading={kpiState.isLoading} />
                <KpiCard label="Tokens / Invocation" value={formatInt(perInvocation)} sub={`over ${formatInt(invocations)} calls`} icon={Divide} accent="foreground" loading={kpiState.isLoading} />
            </div>

            <div className="grid grid-cols-1 gap-l lg:grid-cols-12">
                <VegaPanel
                    className="lg:col-span-8"
                    eyebrow="Volume"
                    title="Token Consumption Over Time"
                    action={
                        <div className="flex flex-wrap items-center gap-s">
                            <Segmented
                                label="Token direction"
                                value={direction}
                                onChange={setDirection}
                                options={[
                                    { value: "Tokens", label: "Total" },
                                    { value: "InputTokens", label: "Input" },
                                    { value: "OutputTokens", label: "Output" },
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
                    height={260}
                    {...activityTrend({ metric: direction, bucket, daxFilters })}
                />
                <InputOutputSplitPanel
                    className="lg:col-span-4"
                    input={input}
                    output={output}
                    total={total}
                    isLoading={kpiState.isLoading}
                    error={kpiState.error}
                />
            </div>

            <div className="grid grid-cols-1 gap-l lg:grid-cols-12">
                <VegaPanel
                    className="lg:col-span-7"
                    eyebrow="Consumption"
                    title="Tokens by Agent"
                    height={260}
                    {...tokensByAgent({ daxFilters })}
                />
                <EfficiencyPanel
                    className="lg:col-span-5"
                    records={agentState.records}
                    field={DIRECTION_FIELD[direction]}
                    isLoading={agentState.isLoading}
                    error={agentState.error}
                />
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------- */
/* Input vs output split                                                   */
/* ---------------------------------------------------------------------- */

function InputOutputSplitPanel({
    className,
    input,
    output,
    total,
    isLoading,
    error,
}: {
    className?: string;
    input: number;
    output: number;
    total: number;
    isLoading: boolean;
    error: Error | undefined;
}) {
    const inputPct = total > 0 ? (input / total) * 100 : 0;
    const outputPct = total > 0 ? (output / total) * 100 : 0;

    return (
        <Panel className={className} eyebrow="Direction" title="Input vs Output">
            {isLoading ? (
                <ChartSkeleton />
            ) : error ? (
                <ErrorState message={error.message} />
            ) : total === 0 ? (
                <EmptyState />
            ) : (
                <div className="flex h-full flex-col justify-center gap-l">
                    <div className="flex h-[16px] w-full overflow-hidden rounded-full border border-border">
                        <div className="h-full bg-info" style={{ width: `${inputPct}%` }} />
                        <div className="h-full bg-cyan" style={{ width: `${outputPct}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-m">
                        <SplitStat label="Input" value={input} pct={inputPct} swatch="bg-info" tone="text-info-foreground" />
                        <SplitStat label="Output" value={output} pct={outputPct} swatch="bg-cyan" tone="text-cyan-foreground" />
                    </div>
                    <p className="font-monospace text-100 leading-200 text-muted-foreground">
                        Output-heavy workloads generate {formatInt(Math.round(output / Math.max(1, input) * 10) / 10)}× more tokens than they ingest.
                    </p>
                </div>
            )}
        </Panel>
    );
}

function SplitStat({
    label,
    value,
    pct,
    swatch,
    tone,
}: {
    label: string;
    value: number;
    pct: number;
    swatch: string;
    tone: string;
}) {
    return (
        <div className="rounded-xl border border-border bg-secondary px-m py-s">
            <div className="flex items-center gap-s">
                <span className={cn("h-[8px] w-[8px] rounded-full", swatch)} />
                <span className="font-monospace text-100 uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
            </div>
            <div className={cn("mt-xs font-numeric text-500 font-semibold tabular-nums", tone)}>{formatCompact(value)}</div>
            <div className="font-monospace text-100 text-muted-foreground">{formatPct(pct)} of total</div>
        </div>
    );
}

/* ---------------------------------------------------------------------- */
/* Per-agent efficiency                                                    */
/* ---------------------------------------------------------------------- */

function EfficiencyPanel({
    className,
    records,
    field,
    isLoading,
    error,
}: {
    className?: string;
    records: ReturnType<typeof useQueryRecords>["records"];
    field: string;
    isLoading: boolean;
    error: Error | undefined;
}) {
    const rows = [...records]
        .map((r) => {
            const inv = num(r.Invocations);
            return {
                id: String(r.AgentId),
                name: agentDisplayName(r.AgentId),
                perCall: inv > 0 ? Math.round(num(r[field]) / inv) : 0,
            };
        })
        .sort((a, b) => b.perCall - a.perCall);
    const max = rows.length ? rows[0].perCall : 0;

    return (
        <Panel className={className} eyebrow="Efficiency" title="Tokens per Invocation">
            {isLoading ? (
                <ChartSkeleton />
            ) : error ? (
                <ErrorState message={error.message} />
            ) : rows.length === 0 ? (
                <EmptyState />
            ) : (
                <ul className="flex h-full flex-col justify-center gap-m">
                    {rows.map((r) => (
                        <li key={r.id} className="flex flex-col gap-xs">
                            <div className="flex items-center justify-between gap-m">
                                <span className="truncate font-heading text-300 font-semibold text-foreground">{r.name}</span>
                                <span className="shrink-0 font-numeric text-300 font-semibold tabular-nums text-cyan-foreground">
                                    {formatInt(r.perCall)}
                                    <span className="ml-xs font-monospace text-100 text-muted-foreground">tok/call</span>
                                </span>
                            </div>
                            <div className="h-[6px] overflow-hidden rounded-full bg-muted-foreground/10">
                                <div className="h-full rounded-full bg-cyan" style={{ width: `${max > 0 ? (r.perCall / max) * 100 : 0}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}
