//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useState, type ComponentType } from "react";
import { Boxes, Brain, Coins, LayoutDashboard, Moon, Radar, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeContext } from "@/hooks/theme.context";
import { FilterBar } from "./filter-bar.component";
import { CommandCentreView } from "./command-centre.view";
import { AiEstateView } from "./ai-estate.view";
import { TokenEconomicsView } from "./token-economics.view";

type ViewId = "command" | "estate" | "tokens";

interface NavItem {
    id: ViewId;
    label: string;
    icon: ComponentType<{ className?: string }>;
    view: ComponentType;
}

const NAV: NavItem[] = [
    { id: "command", label: "Command Centre", icon: LayoutDashboard, view: CommandCentreView },
    { id: "estate", label: "AI Estate", icon: Boxes, view: AiEstateView },
    { id: "tokens", label: "Token Economics", icon: Coins, view: TokenEconomicsView },
];

/** Root layout: brand rail, top bar with theme toggle, and the active view. */
export function AppShell() {
    const [active, setActive] = useState<ViewId>("command");
    const { isDark, toggleTheme } = useThemeContext();

    const current = NAV.find((n) => n.id === active) ?? NAV[0];
    const ActiveView = current.view;

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* Left brand rail */}
            <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-border bg-card md:flex">
                <BrandMark />
                <nav className="flex flex-1 flex-col gap-xs px-m py-l">
                    <p className="px-m pb-s font-monospace text-100 uppercase tracking-[0.16em] text-muted-foreground">
                        Control Room
                    </p>
                    {NAV.map((item) => (
                        <NavButton
                            key={item.id}
                            item={item}
                            active={item.id === active}
                            onClick={() => setActive(item.id)}
                        />
                    ))}
                </nav>
                <div className="border-t border-border p-l">
                    <div className="flex items-center gap-s rounded-xl border border-success/30 bg-success/10 px-m py-s">
                        <span className="relative flex h-[8px] w-[8px]">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-foreground opacity-60" />
                            <span className="relative inline-flex h-[8px] w-[8px] rounded-full bg-success-foreground" />
                        </span>
                        <span className="font-monospace text-100 uppercase tracking-[0.14em] text-success-foreground">
                            Live Telemetry
                        </span>
                    </div>
                </div>
            </aside>

            {/* Main column */}
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
                    <header className="flex items-center justify-between gap-m px-l py-m">
                        <div className="flex min-w-0 items-center gap-m">
                            <Radar className="icon-size-300 shrink-0 text-cyan-foreground" />
                            <div className="min-w-0">
                                <h1 className="truncate font-heading text-500 font-semibold leading-500 text-foreground">
                                    {current.label}
                                </h1>
                                <p className="truncate font-monospace text-100 uppercase tracking-[0.16em] text-muted-foreground">
                                    AI Control Tower
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
                            className="flex items-center justify-center rounded-xl border border-border bg-card p-s text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                            {isDark ? <Sun className="icon-size-200" /> : <Moon className="icon-size-200" />}
                        </button>
                    </header>
                    <FilterBar />
                </div>

                {/* Mobile nav */}
                <div className="flex gap-xs overflow-x-auto border-b border-border bg-card px-m py-s md:hidden">
                    {NAV.map((item) => (
                        <NavButton
                            key={item.id}
                            item={item}
                            active={item.id === active}
                            onClick={() => setActive(item.id)}
                            compact
                        />
                    ))}
                </div>

                <main className="min-w-0 flex-1 p-l">
                    <ActiveView />
                </main>
            </div>
        </div>
    );
}

function BrandMark() {
    return (
        <div className="flex items-center gap-m border-b border-border px-l py-l">
            <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-xl bg-cyan text-cyan-foreground">
                <Brain className="icon-size-300" aria-hidden />
            </span>
            <div className="min-w-0">
                <div className="truncate font-heading text-400 font-bold leading-400 text-foreground">AI</div>
                <div className="truncate font-monospace text-100 uppercase tracking-[0.14em] text-muted-foreground">
                    Control Tower
                </div>
            </div>
        </div>
    );
}

function NavButton({
    item,
    active,
    onClick,
    compact,
}: {
    item: NavItem;
    active: boolean;
    onClick: () => void;
    compact?: boolean;
}) {
    const Icon = item.icon;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex shrink-0 items-center gap-s rounded-xl px-m py-s font-base text-300 transition-colors",
                compact ? "" : "w-full",
                active
                    ? "border border-border bg-secondary text-foreground"
                    : "border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
        >
            <Icon className={cn("icon-size-200 shrink-0", active && "text-cyan-foreground")} />
            <span className="truncate">{item.label}</span>
        </button>
    );
}
