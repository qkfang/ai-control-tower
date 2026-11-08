import { useCallback, useRef, useState, type ReactNode } from "react";
import { chatWithFoundryAgent, listFoundryAgents, type FoundryAgent } from "@/services/foundry-chat.service";
import { DataChatError } from "@/services/data-chat.service";
import { FoundryChatContext } from "./foundry-chat.context";
import { useChatState } from "./use-chat-state";

export function FoundryChatProvider({ children }: { children: ReactNode }) {
    const [agents, setAgents] = useState<FoundryAgent[]>([]);
    const [agent, setSelectedAgent] = useState("");
    const [agentsLoading, setAgentsLoading] = useState(true);
    const [agentsError, setAgentsError] = useState<string | null>(null);
    const chat = useChatState((question, messages) => chatWithFoundryAgent(agent, question, messages));

    const reloadAgents = useCallback(() => {
        setAgentsLoading(true);
        setAgentsError(null);
        listFoundryAgents()
            .then((list) => {
                setAgents(list);
                setSelectedAgent((current) => list.some((a) => a.name === current) ? current : list[0]?.name ?? "");
            })
            .catch((error) => setAgentsError(
                error instanceof DataChatError ? error.message : "Foundry agents could not be loaded.",
            ))
            .finally(() => setAgentsLoading(false));
    }, []);

    const agentsRequested = useRef(false);
    const ensureAgents = useCallback(() => {
        if (agentsRequested.current) return;
        agentsRequested.current = true;
        reloadAgents();
    }, [reloadAgents]);

    function setAgent(name: string) {
        if (name === agent || chat.isSending) return;
        setSelectedAgent(name);
        chat.reset();
    }

    return (
        <FoundryChatContext.Provider
            value={{ ...chat, agents, agent, setAgent, agentsLoading, agentsError, reloadAgents, ensureAgents }}
        >
            {children}
        </FoundryChatContext.Provider>
    );
}
