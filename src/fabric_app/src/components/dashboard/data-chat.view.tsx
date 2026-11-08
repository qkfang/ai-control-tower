import { useDataChat } from "@/hooks/data-chat.context";
import { ChatPanel } from "./chat-panel.component";

export function DataChatView() {
    return (
        <ChatPanel
            chat={useDataChat()}
            id="data-chat"
            title="Ask your data agent"
            assistantLabel="Data agent"
            emptyHint="Ask about the connected data. Dashboard filters are not applied to this conversation."
            pendingHint="Querying the data agent. This can take a few minutes."
        />
    );
}
