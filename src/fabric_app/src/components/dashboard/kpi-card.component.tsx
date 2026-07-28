//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./states.component";

type Accent = "cyan" | "success" | "warning" | "danger" | "info" | "foreground";

const accentText: Record<Accent, string> = {
    cyan: "text-cyan-foreground",
    success: "text-success-foreground",
    warning: "text-warning-foreground",
    danger: "text-danger-foreground",
    info: "text-info-foreground",
    foreground: "text-foreground",
};

const accentGlow: Record<Accent, string> = {
    cyan: "shadow-[0_0_20px_-6px_var(--color-cyan)]",
    success: "shadow-[0_0_20px_-6px_var(--color-success)]",
    warning: "shadow-[0_0_20px_-6px_var(--color-warning)]",
    danger: "shadow-[0_0_20px_-6px_var(--color-danger)]",
    info: "shadow-[0_0_20px_-6px_var(--color-info)]",
    foreground: "",
};

interface KpiCardProps {
    /** Uppercase caption above the value. */
    label: string;
    /** Big numeric readout. */
    value: ReactNode;
    /** Small supporting line beneath the value. */
    sub?: ReactNode;
    icon?: ComponentType<{ className?: string }>;
    accent?: Accent;
    loading?: boolean;
    className?: string;
}

/**
 * A single executive metric tile: uppercase label, monospaced numeric
 * readout with an accent color, and a supporting sub-line. Left edge is
 * marked with an accent rule to reinforce the control-room look.
 */
export function KpiCard({
    label,
    value,
    sub,
    icon: Icon,
    accent = "foreground",
    loading,
    className,
}: KpiCardProps) {
    return (
        <div
            className={cn(
                "relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-l",
                "before:absolute before:inset-y-l before:left-0 before:w-[3px] before:rounded-full",
                accentBefore[accent],
                className,
            )}
        >
            <div className="flex items-center justify-between gap-s">
                <span className="font-monospace text-100 uppercase tracking-[0.16em] text-muted-foreground">
                    {label}
                </span>
                {Icon && (
                    <span
                        className={cn(
                            "flex items-center justify-center rounded-lg border border-border bg-secondary p-s",
                            accentGlow[accent],
                        )}
                    >
                        <Icon className={cn("icon-size-200", accentText[accent])} />
                    </span>
                )}
            </div>

            <div className="mt-m">
                {loading ? (
                    <Skeleton className="h-[36px] w-[70%]" />
                ) : (
                    <div
                        className={cn(
                            "font-numeric text-hero-800 font-semibold leading-hero-800 tabular-nums",
                            accentText[accent],
                        )}
                    >
                        {value}
                    </div>
                )}
                {sub && !loading && (
                    <div className="mt-xs font-base text-200 text-muted-foreground">{sub}</div>
                )}
            </div>
        </div>
    );
}

const accentBefore: Record<Accent, string> = {
    cyan: "before:bg-cyan",
    success: "before:bg-success",
    warning: "before:bg-warning",
    danger: "before:bg-danger",
    info: "before:bg-info",
    foreground: "before:bg-border",
};
