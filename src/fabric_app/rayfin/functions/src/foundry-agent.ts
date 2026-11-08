import { ChatError, type Message } from "./chat.js";

const MAX_ANSWER_BYTES = 64 * 1024;
const MAX_APPROVAL_ROUNDS = 5;
const REQUEST_TIMEOUT_MS = 180_000;
const AGENT_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;

export interface FoundryAgent {
    name: string;
    model: string;
}

interface ResponseItem {
    type: string;
    id?: string;
    content?: { type: string; text?: string }[];
}

interface ResponseResult {
    id: string;
    status?: string;
    output?: ResponseItem[];
}

function projectUrl(endpoint: string, path: string): URL {
    let base: URL;
    try {
        base = new URL(endpoint);
    } catch {
        throw new ChatError("CONFIGURATION", "The server's Foundry project connection is not configured.");
    }
    if (base.protocol !== "https:" || !base.hostname.endsWith(".services.ai.azure.com")
        || !base.pathname.startsWith("/api/projects/")) {
        throw new ChatError("CONFIGURATION", "The server's Foundry project connection is not configured.");
    }
    return new URL(`${base.href.replace(/\/+$/, "")}${path}`);
}

async function callFoundry<T>(url: URL, token: string, signal: AbortSignal, body?: unknown): Promise<T> {
    if (!token) throw new ChatError("CONFIGURATION", "The server's Foundry project connection is not configured.");

    let response: Response;
    try {
        response = await fetch(url, {
            method: body ? "POST" : "GET",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
            signal,
        });
    } catch {
        if (signal.aborted) {
            throw new ChatError("TIMEOUT", "The Foundry agent timed out. Retry the question when ready.");
        }
        throw new ChatError("UPSTREAM", "Unable to contact the Foundry project. Check its availability before retrying.");
    }

    if (response.status === 401 || response.status === 403) {
        throw new ChatError("FORBIDDEN", "The app owner cannot access this Foundry project or agent.");
    }
    if (response.status === 404) {
        throw new ChatError("NOT_FOUND", "The selected Foundry agent was not found. Refresh the agent list.");
    }
    if (!response.ok) {
        throw new ChatError("UPSTREAM", `The Foundry project returned an error (${response.status}).`);
    }
    return await response.json() as T;
}

export async function listFoundryAgents(token: string, endpoint: string): Promise<FoundryAgent[]> {
    const url = projectUrl(endpoint, "/agents?api-version=v1");
    const result = await callFoundry<{
        data?: { name?: string; versions?: { latest?: { definition?: { model?: string } } } }[];
    }>(url, token, AbortSignal.timeout(30_000));

    return (result.data ?? [])
        .filter((agent) => typeof agent.name === "string" && AGENT_NAME.test(agent.name))
        .map((agent) => ({ name: agent.name as string, model: agent.versions?.latest?.definition?.model ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export async function askFoundryAgent(
    agentName: string,
    question: string,
    history: Message[],
    token: string,
    endpoint: string,
): Promise<string> {
    if (typeof agentName !== "string" || !AGENT_NAME.test(agentName)) {
        throw new ChatError("INVALID_AGENT", "Select a Foundry agent before sending.");
    }

    const url = projectUrl(endpoint, "/openai/v1/responses");
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const agentReference = { type: "agent_reference", name: agentName };
    let result = await callFoundry<ResponseResult>(url, token, signal, {
        agent_reference: agentReference,
        input: [...history, { role: "user", content: question.trim() }],
    });

    // Auto-approve tool calls that require consent, matching the web app agents.
    for (let round = 0; round < MAX_APPROVAL_ROUNDS; round++) {
        const approvals = (result.output ?? []).filter((item) => item.type === "mcp_approval_request" && item.id);
        if (approvals.length === 0) break;
        result = await callFoundry<ResponseResult>(url, token, signal, {
            agent_reference: agentReference,
            previous_response_id: result.id,
            input: approvals.map((item) => ({
                type: "mcp_approval_response",
                approval_request_id: item.id,
                approve: true,
            })),
        });
    }

    if (result.status && result.status !== "completed") {
        throw new ChatError("AGENT_ERROR", `The Foundry agent did not complete the response (${result.status}).`);
    }
    const answer = (result.output ?? [])
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((block) => block.type === "output_text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n\n");
    if (!answer.trim()) {
        throw new ChatError("EMPTY_RESPONSE", "The Foundry agent returned no answer. Try a more specific question.");
    }
    if (Buffer.byteLength(answer, "utf8") > MAX_ANSWER_BYTES) {
        throw new ChatError("ANSWER_LIMIT", "The answer is too large. Ask for a smaller summary.");
    }
    return answer;
}
