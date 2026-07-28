//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
    /** Panel heading. */
    title?: ReactNode;
    /** Optional small label above the title. */
    eyebrow?: ReactNode;
    /** Right-aligned header content (filters, legends, actions). */
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    /** Removes inner body padding — useful for edge-to-edge tables. */
    flush?: boolean;
}

/**
 * The base surface for every dashboard tile: a bordered card with an
 * optional header row. Colors and radius come from theme tokens so it
 * adapts to light/dark automatically.
 */
export function Panel({ title, eyebrow, action, children, className, flush }: PanelProps) {
    return (
        <section
            className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card",
                "shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-16px_rgba(0,0,0,0.6)]",
                className,
            )}
        >
            {(title || action) && (
                <header className="flex items-start justify-between gap-m px-l pt-l pb-m">
                    <div className="min-w-0">
                        {eyebrow && (
                            <div className="font-monospace text-100 uppercase tracking-[0.14em] text-muted-foreground">
                                {eyebrow}
                            </div>
                        )}
                        {title && (
                            <h2 className="truncate font-heading text-400 font-semibold leading-500 text-foreground">
                                {title}
                            </h2>
                        )}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </header>
            )}
            <div className={cn("min-h-0 flex-1", flush ? "" : "px-l pb-l")}>{children}</div>
        </section>
    );
}
