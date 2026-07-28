//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

/** Coerce a possibly-null query value to a finite number (fallback `0`). */
export function num(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

/** Integer with thousands separators, e.g. `32666` → `"32,666"`. */
export function formatInt(value: unknown): string {
    return num(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Compact, human-scale number for KPI readouts:
 * `950` → `"950"`, `32666` → `"32.7K"`, `1_800_000` → `"1.8M"`.
 */
export function formatCompact(value: unknown): string {
    const n = num(value);
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return trim(n / 1_000_000_000) + "B";
    if (abs >= 1_000_000) return trim(n / 1_000_000) + "M";
    if (abs >= 1_000) return trim(n / 1_000) + "K";
    return String(Math.round(n));
}

function trim(n: number): string {
    return n
        .toFixed(1)
        .replace(/\.0$/, "");
}

/** One-decimal percent, value already on a 0–100 scale. `100` → `"100%"`. */
export function formatPct(value: unknown): string {
    const n = num(value);
    return (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)) + "%";
}

/** Latency in ms rendered as seconds when large: `5131` → `"5.1s"`, `840` → `"840ms"`. */
export function formatLatency(value: unknown): string {
    const ms = num(value);
    if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
    return Math.round(ms) + "ms";
}

/* ---------------------------------------------------------------------- */
/* Agent health                                                            */
/* ---------------------------------------------------------------------- */

export type HealthTier = "healthy" | "warning" | "critical";

/** Map a 0–100 success rate to a health tier used across the UI. */
export function healthTier(successRate: unknown): HealthTier {
    const rate = num(successRate);
    if (rate >= 99) return "healthy";
    if (rate >= 95) return "warning";
    return "critical";
}

/** Tailwind text-color token class for a health tier. */
export function healthTextClass(tier: HealthTier): string {
    switch (tier) {
        case "healthy":
            return "text-success-foreground";
        case "warning":
            return "text-warning-foreground";
        case "critical":
            return "text-danger-foreground";
    }
}

/** Human label for a health tier. */
export function healthLabel(tier: HealthTier): string {
    switch (tier) {
        case "healthy":
            return "Healthy";
        case "warning":
            return "Warning";
        case "critical":
            return "Critical";
    }
}
