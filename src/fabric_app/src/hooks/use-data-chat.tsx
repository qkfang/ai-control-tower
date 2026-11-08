import type { ReactNode } from "react";
import { chatWithData } from "@/services/data-chat.service";
import { DataChatContext } from "./data-chat.context";
import { useChatState } from "./use-chat-state";

export function DataChatProvider({ children }: { children: ReactNode }) {
    const chat = useChatState(chatWithData);
    return <DataChatContext.Provider value={chat}>{children}</DataChatContext.Provider>;
}