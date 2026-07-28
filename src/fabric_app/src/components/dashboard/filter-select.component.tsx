//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterOption } from "@/hooks/filters.context";

interface FilterSelectProps<TValue extends string | number> {
    /** Short name of the dimension, e.g. "Agent". */
    label: string;
    icon?: ComponentType<{ className?: string }>;
    options: FilterOption<TValue>[];
    selected: TValue[];
    onChange: (next: TValue[]) => void;
    /** Summary shown when nothing is selected, e.g. "All agents". */
    allLabel: string;
    disabled?: boolean;
    className?: string;
}

/**
 * A compact multi-select used by the dashboard filter bar. An empty
 * selection means "no filter", which keeps the unfiltered case free of
 * ceremony for the user and free of DAX clauses for the query.
 */
export function FilterSelect<TValue extends string | number>({
    label,
    icon: Icon,
    options,
    selected,
    onChange,
    allLabel,
    disabled,
    className,
}: FilterSelectProps<TValue>) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    // Close on outside click or Escape.
    useEffect(() => {
        if (!open) return;

        function onPointerDown(event: MouseEvent) {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const isEmpty = selected.length === 0;
    const summary = isEmpty
        ? allLabel
        : selected.length === 1
          ? (options.find((o) => o.value === selected[0])?.label ?? String(selected[0]))
          : `${selected.length} selected`;

    function toggle(value: TValue) {
        onChange(
            selected.includes(value)
                ? selected.filter((v) => v !== value)
                : [...selected, value],
        );
    }

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            <button
                type="button"
                disabled={disabled || options.length === 0}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                className={cn(
                    "flex w-full items-center gap-s rounded-xl border px-m py-s text-left transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    isEmpty
                        ? "border-border bg-card text-muted-foreground hover:bg-secondary"
                        : "border-cyan-foreground/40 bg-cyan/10 text-foreground hover:bg-cyan/20",
                )}
            >
                {Icon ? <Icon className="icon-size-200 shrink-0" /> : null}
                <span className="flex min-w-0 flex-col">
                    <span className="font-monospace text-100 uppercase tracking-[0.12em] text-muted-foreground">
                        {label}
                    </span>
                    <span className="truncate font-base text-300 text-foreground">{summary}</span>
                </span>
                <ChevronDown
                    className={cn("icon-size-200 ml-auto shrink-0 transition-transform", open && "rotate-180")}
                />
            </button>

            {open ? (
                <div
                    id={listId}
                    role="listbox"
                    aria-multiselectable
                    aria-label={label}
                    className="absolute z-20 mt-xs max-h-[280px] w-full min-w-[220px] overflow-y-auto rounded-xl border border-border bg-card p-xs shadow-lg"
                >
                    {options.map((option) => {
                        const active = selected.includes(option.value);
                        return (
                            <button
                                key={String(option.value)}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => toggle(option.value)}
                                className="flex w-full items-center gap-s rounded-lg px-m py-s text-left transition-colors hover:bg-secondary"
                            >
                                <span
                                    className={cn(
                                        "flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded border",
                                        active
                                            ? "border-cyan-foreground bg-cyan text-cyan-foreground"
                                            : "border-border",
                                    )}
                                >
                                    {active ? <Check className="icon-size-100" /> : null}
                                </span>
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate font-base text-300 text-foreground">
                                        {option.label}
                                    </span>
                                    {option.hint ? (
                                        <span className="truncate font-monospace text-100 text-muted-foreground">
                                            {option.hint}
                                        </span>
                                    ) : null}
                                </span>
                            </button>
                        );
                    })}

                    {!isEmpty ? (
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="mt-xs w-full rounded-lg border border-border px-m py-s font-monospace text-100 uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                            Clear
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
