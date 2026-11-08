import { createContext, useContext } from "react";
import type { FoundryAgent } from "@/services/foundry-chat.service";
import type { ChatContextValue } from "./data-chat.context";

export interface FoundryChatContextValue extends ChatContextValue {
    agents: FoundryAgent[];
    agent: string;
    setAgent: (agent: string) => void;
    agentsLoading: boolean;
    agentsError: string | null;
    reloadAgents: () => void;
    ensureAgents: () => void;
}

export const FoundryChatContext = createContext<FoundryChatContextValue | null>(null);

export function useFoundryChat() {
    const context = useContext(FoundryChatContext);
    if (!context) throw new Error("useFoundryChat must be used within FoundryChatProvider.");
    return context;
}
