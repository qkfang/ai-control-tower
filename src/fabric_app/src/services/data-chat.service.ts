import { getRayfinClient } from "@/lib/rayfin-client";

export const MAX_QUESTION_LENGTH = 4000;
export const MAX_CHAT_EXCHANGES = 10;
const MAX_REQUEST_BYTES = 96 * 1024;

export interface DataChatMessage {
    role: "user" | "assistant";
    content: string;
}

export class DataChatError extends Error {}

export function getDataChatValidationError(question: string, messages: DataChatMessage[]): string | null {
    if (messages.length >= MAX_CHAT_EXCHANGES * 2) {
        return "This chat has reached 10 exchanges. Start a new chat to continue.";
    }
    if (Array.from(question).length > MAX_QUESTION_LENGTH) {
        return "Questions can contain at most 4,000 characters. Shorten your question before sending.";
    }
    if (!question.trim()) {
        return "Enter a question before sending.";
    }

    const request = JSON.stringify({ question, history: JSON.stringify(messages) });
    if (new TextEncoder().encode(request).byteLength > MAX_REQUEST_BYTES) {
        return "This request exceeds the 96 KiB conversation limit. Shorten your question or start a new chat.";
    }
    return null;
}

export async function chatWithData(question: string, messages: DataChatMessage[]): Promise<string> {
    const validationError = getDataChatValidationError(question, messages);
    if (validationError) throw new DataChatError(validationError);

    try {
        const result = await getRayfinClient().functions.chat_with_data.invoke(
            { question, history: JSON.stringify(messages) },
            { timeoutMs: 210000 },
        );
        if (typeof result?.answer !== "string" || !result.answer.trim()) {
            throw new DataChatError("The data agent returned no answer. Retry the question or start a new chat.");
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
            "The data agent could not complete this request. Retry the question, edit it, or start a new chat.",
        );
    }
}
