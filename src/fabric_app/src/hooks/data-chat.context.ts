import { createContext, useContext } from "react";
import type { DataChatMessage } from "@/services/data-chat.service";

export interface ChatContextValue {
    messages: DataChatMessage[];
    draft: string;
    setDraft: (draft: string) => void;
    pendingQuestion: string | null;
    isSending: boolean;
    error: string | null;
    send: () => Promise<void>;
    retry: () => Promise<void>;
    editQuestion: () => void;
    reset: () => void;
}

export const DataChatContext = createContext<ChatContextValue | null>(null);

export function useDataChat() {
    const context = useContext(DataChatContext);
    if (!context) throw new Error("useDataChat must be used within DataChatProvider.");
    return context;
}
