//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "cyan";

const toneStroke: Record<Tone, string> = {
    success: "var(--color-success-foreground)",
    warning: "var(--color-warning-foreground)",
    danger: "var(--color-danger-foreground)",
    cyan: "var(--color-cyan-foreground)",
};

interface GaugeProps {
    /** Progress value on a 0–100 scale. */
    value: number;
    tone?: Tone;
    /** Large centered readout (defaults to the rounded value + %). */
    label?: ReactNode;
    /** Small caption under the label. */
    caption?: ReactNode;
    size?: number;
    className?: string;
}

/**
 * A circular progress ring for headline rates (success, health). Purely
 * presentational — the value is supplied by the caller from real query data.
 */
export function Gauge({
    value,
    tone = "cyan",
    label,
    caption,
    size = 168,
    className,
}: GaugeProps) {
    const clamped = Math.max(0, Math.min(100, value));
    const stroke = 12;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dash = (clamped / 100) * circumference;

    return (
        <div className={cn("relative flex items-center justify-center", className)}>
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth={stroke}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={toneStroke[tone]}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    style={{ transition: "stroke-dasharray 600ms ease" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-numeric text-hero-700 font-semibold leading-hero-700 tabular-nums text-foreground">
                    {label ?? `${Math.round(clamped)}%`}
                </span>
                {caption && (
                    <span className="mt-xs font-monospace text-100 uppercase tracking-[0.14em] text-muted-foreground">
                        {caption}
                    </span>
                )}
            </div>
        </div>
    );
}
