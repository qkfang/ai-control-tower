import { randomUUID } from "node:crypto";
import {
    AudienceType,
    UserDataFunctions,
    type RayfinContext,
} from "@microsoft/fabric-user-data-functions";
import { ChatError, parseHistory } from "./chat.js";
import { askDataAgent, prepareQuestion } from "./data-agent.js";
import { askFoundryAgent, listFoundryAgents, type FoundryAgent } from "./foundry-agent.js";

const udf = new UserDataFunctions();

async function withReference<T>(event: string, fallback: string, run: () => Promise<T>): Promise<T> {
    const requestId = randomUUID();
    try {
        return await run();
    } catch (error) {
        const code = error instanceof ChatError ? error.code : "UNAVAILABLE";
        console.error(JSON.stringify({ event, requestId, code }));
        const message = error instanceof ChatError ? error.message : fallback;
        throw new Error(`${message} Reference: ${requestId}`);
    }
}

udf.func(
    "chat_with_data",
    async (
        question: string,
        history: string,
        ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>,
    ): Promise<{ answer: string }> => withReference(
        "data_chat_failed",
        "Chat is unavailable. Check the app's Fabric connection and server configuration.",
        async () => {
            const answer = await askDataAgent(
                prepareQuestion(question, history),
                ctx.Tokens.Fabric,
                ctx.Secrets.FABRIC_DATA_AGENT_WORKSPACE_ID,
                ctx.Secrets.FABRIC_DATA_AGENT_ID,
            );
            return { answer };
        },
    ),
    [],
);

udf.func(
    "list_foundry_agents",
    async (
        ctx: RayfinContext<Record<string, never>, AudienceType.AzureAI>,
    ): Promise<{ agents: FoundryAgent[] }> => withReference(
        "foundry_agents_failed",
        "Foundry agents are unavailable. Check the app's Foundry project configuration.",
        async () => ({
            agents: await listFoundryAgents(ctx.Tokens.AzureAI, ctx.Secrets.FOUNDRY_PROJECT_ENDPOINT),
        }),
    ),
    [],
);

udf.func(
    "chat_with_foundry_agent",
    async (
        agent: string,
        question: string,
        history: string,
        ctx: RayfinContext<Record<string, never>, AudienceType.AzureAI>,
    ): Promise<{ answer: string }> => withReference(
        "foundry_chat_failed",
        "Chat is unavailable. Check the app's Foundry project configuration.",
        async () => {
            const answer = await askFoundryAgent(
                agent,
                question,
                parseHistory(question, history),
                ctx.Tokens.AzureAI,
                ctx.Secrets.FOUNDRY_PROJECT_ENDPOINT,
            );
            return { answer };
        },
    ),
    [],
);
