//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useState } from "react";
import { Power } from "lucide-react";
import { Panel } from "./panel.component";
import { getRayfinClient } from "@/lib/rayfin-client";

/** Stops an agent by calling the server-side Agent 365 function. */
export function KillSwitchView() {
    const [agentId, setAgentId] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    const onKill = async () => {
        if (!window.confirm(`Stop agent ${agentId}?`)) return;
        setBusy(true);
        setMessage("");
        try {
            const result = await getRayfinClient().functions.kill_agent.invoke({ agent_id: agentId.trim() });
            setMessage(`Agent ${result.agentId}: ${result.status}`);
        } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Panel eyebrow="Agent 365" title="Kill Switch" className="max-w-[560px]">
            <div className="flex flex-col gap-m">
                <input
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="Agent ID"
                    className="rounded-xl border border-border bg-background px-m py-s text-300 text-foreground"
                />
                <button
                    type="button"
                    disabled={busy || !agentId.trim()}
                    onClick={onKill}
                    className="flex items-center justify-center gap-s rounded-xl bg-destructive px-m py-s text-300 font-semibold text-destructive-foreground disabled:opacity-50"
                >
                    <Power className="icon-size-200" />
                    {busy ? "Stopping..." : "Stop agent"}
                </button>
                {message && <p className="font-monospace text-100 text-muted-foreground">{message}</p>}
            </div>
        </Panel>
    );
}
