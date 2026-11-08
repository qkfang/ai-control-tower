import { getRayfinClient } from "@/lib/rayfin-client";
import { DataChatError, getDataChatValidationError, type DataChatMessage } from "./data-chat.service";

export interface FoundryAgent {
    name: string;
    model: string;
}

export async function listFoundryAgents(): Promise<FoundryAgent[]> {
    try {
        const result = await getRayfinClient().functions.list_foundry_agents.invoke(undefined, { timeoutMs: 60000 });
        return Array.isArray(result?.agents) ? result.agents : [];
    } catch {
        throw new DataChatError("Foundry agents could not be loaded. Check the app's Foundry project configuration.");
    }
}

export async function chatWithFoundryAgent(
    agent: string,
    question: string,
    messages: DataChatMessage[],
): Promise<string> {
    if (!agent) throw new DataChatError("Select a Foundry agent before sending.");
    const validationError = getDataChatValidationError(question, messages);
    if (validationError) throw new DataChatError(validationError);

    try {
        const result = await getRayfinClient().functions.chat_with_foundry_agent.invoke(
            { agent, question, history: JSON.stringify(messages) },
            { timeoutMs: 210000 },
        );
        if (typeof result?.answer !== "string" || !result.answer.trim()) {
            throw new DataChatError("The Foundry agent returned no answer. Retry the question or start a new chat.");
        }
        return result.answer;
    } catch (error) {
        if (error instanceof DataChatError) throw error;
        if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
            throw new DataChatError(
                "The request timed out. It may still finish on the server. Retry only when you want to send the question again.",
            );
        }
        throw new DataChatError(
            "The Foundry agent could not complete this request. Retry the question, edit it, or start a new chat.",
        );
    }
}
