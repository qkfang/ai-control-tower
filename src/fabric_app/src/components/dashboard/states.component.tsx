//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shimmering skeleton block used while a query is in flight. */
export function Skeleton({
    className,
    style,
}: {
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div
            style={style}
            className={cn(
                "animate-pulse rounded-lg bg-muted-foreground/10",
                className,
            )}
        />
    );
}

/** Fills a chart panel with a chart-shaped skeleton. */
export function ChartSkeleton() {
    return (
        <div className="flex h-full min-h-[160px] w-full items-end gap-s p-s">
            {[40, 65, 50, 80, 60, 90, 72].map((h, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
            ))}
        </div>
    );
}

/** Centered muted message shown when a query returns no rows. */
export function EmptyState({ message = "No data available" }: { message?: string }) {
    return (
        <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-s text-center">
            <Inbox className="icon-size-500 text-muted-foreground/60" aria-hidden />
            <p className="font-base text-300 text-muted-foreground">{message}</p>
        </div>
    );
}

/** Destructive banner shown when a query fails. */
export function ErrorState({ message }: { message: string }) {
    return (
        <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-s p-l text-center">
            <div className="flex items-center gap-s rounded-xl border border-destructive/40 bg-destructive/10 px-m py-s">
                <AlertTriangle className="icon-size-200 text-destructive" aria-hidden />
                <span className="font-base text-200 text-destructive-foreground">
                    {message}
                </span>
            </div>
        </div>
    );
}
