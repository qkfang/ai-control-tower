//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { cn } from "@/lib/utils";

interface SegmentedProps<TValue extends string> {
    /** Accessible name for the group, e.g. "Trend metric". */
    label: string;
    options: { value: TValue; label: string }[];
    value: TValue;
    onChange: (next: TValue) => void;
    className?: string;
}

/**
 * A single-choice inline toggle for page-level view options such as which
 * measure a chart plots. Used where a dropdown would be heavier than the
 * two or three choices warrant.
 */
export function Segmented<TValue extends string>({
    label,
    options,
    value,
    onChange,
    className,
}: SegmentedProps<TValue>) {
    return (
        <div
            role="radiogroup"
            aria-label={label}
            className={cn("flex items-center gap-xxs rounded-xl border border-border bg-card p-xxs", className)}
        >
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "rounded-lg px-m py-xxs font-monospace text-100 uppercase tracking-[0.12em] transition-colors",
                            active
                                ? "bg-cyan text-cyan-foreground"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
