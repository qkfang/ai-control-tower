const MAX_QUESTION_LENGTH = 4_000;
const MAX_EXCHANGES = 10;
const MAX_REQUEST_BYTES = 96 * 1024;

export interface Message {
    role: "user" | "assistant";
    content: string;
}

export class ChatError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = "ChatError";
    }
}

export function parseHistory(question: string, history: string): Message[] {
    if (typeof question !== "string" || !question.trim() || Array.from(question).length > MAX_QUESTION_LENGTH) {
        throw new ChatError("INVALID_QUESTION", "Enter a question of 1 to 4,000 characters.");
    }
    if (typeof history !== "string"
        || Buffer.byteLength(JSON.stringify({ question, history }), "utf8") > MAX_REQUEST_BYTES) {
        throw new ChatError("CONTEXT_LIMIT", "This conversation is too large. Start a new chat.");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(history);
    } catch {
        throw new ChatError("INVALID_HISTORY", "Conversation context is invalid. Start a new chat.");
    }
    if (!Array.isArray(parsed) || parsed.length % 2 !== 0 || parsed.length >= MAX_EXCHANGES * 2) {
        throw new ChatError("CONTEXT_LIMIT", "A chat supports up to 10 exchanges. Start a new chat.");
    }

    return parsed.map((message: unknown, index: number) => {
        const expectedRole = index % 2 === 0 ? "user" : "assistant";
        if (typeof message !== "object" || message === null
            || !("role" in message) || message.role !== expectedRole
            || !("content" in message) || typeof message.content !== "string"
            || !message.content.trim()
            || (expectedRole === "user" && Array.from(message.content).length > MAX_QUESTION_LENGTH)) {
            throw new ChatError("INVALID_HISTORY", "Conversation context is invalid. Start a new chat.");
        }
        return { role: expectedRole, content: message.content };
    });
}
