import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useFoundryChat } from "@/hooks/foundry-chat.context";
import { ChatPanel } from "./chat-panel.component";

export function FoundryChatView() {
    const chat = useFoundryChat();
    const { agents, agent, setAgent, agentsLoading, agentsError, reloadAgents, ensureAgents, isSending } = chat;

    useEffect(ensureAgents, [ensureAgents]);

    return (
        <div className="flex flex-col gap-l">
            {agentsError && (
                <p role="alert" className="mx-auto w-full max-w-5xl rounded-xl border border-destructive/30 bg-destructive/10 p-l text-300 text-foreground">
                    {agentsError}
                </p>
            )}
            <ChatPanel
                chat={chat}
                id="foundry-chat"
                title="Ask a Foundry agent"
                assistantLabel={agent || "Foundry agent"}
                emptyHint="Select an agent, then ask a question. Changing the agent starts a new chat."
                pendingHint="Calling the Foundry agent. This can take a minute."
                locked={!agent}
                toolbar={
                    <>
                        <label htmlFor="foundry-agent" className="sr-only">Foundry agent</label>
                        <select
                            id="foundry-agent"
                            value={agent}
                            disabled={agentsLoading || isSending || agents.length === 0}
                            onChange={(event) => setAgent(event.target.value)}
                            className="rounded-xl border border-input bg-card px-m py-s text-300 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {agents.length === 0 && (
                                <option value="">{agentsLoading ? "Loading agents…" : "No agents found"}</option>
                            )}
                            {agents.map((item) => (
                                <option key={item.name} value={item.name}>
                                    {item.model ? `${item.name} (${item.model})` : item.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={reloadAgents}
                            disabled={agentsLoading}
                            aria-label="Refresh agents"
                            className="inline-flex items-center rounded-xl border border-border bg-card p-s text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RefreshCw className="icon-size-200" aria-hidden />
                        </button>
                    </>
                }
            />
        </div>
    );
}
