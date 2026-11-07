import { randomUUID } from "node:crypto";
import {
    AudienceType,
    UserDataFunctions,
    type RayfinContext,
} from "@microsoft/fabric-user-data-functions";
import { askDataAgent, ChatError, prepareQuestion } from "./data-agent.js";

const udf = new UserDataFunctions();

udf.func(
    "chat_with_data",
    async (
        question: string,
        history: string,
        ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>,
    ): Promise<{ answer: string }> => {
        const requestId = randomUUID();
        try {
            const userQuestion = prepareQuestion(question, history);
            const answer = await askDataAgent(
                userQuestion,
                ctx.Tokens.Fabric,
                ctx.Secrets.FABRIC_DATA_AGENT_WORKSPACE_ID,
                ctx.Secrets.FABRIC_DATA_AGENT_ID,
            );
            return { answer };
        } catch (error) {
            const code = error instanceof ChatError ? error.code : "UNAVAILABLE";
            console.error(JSON.stringify({ event: "data_chat_failed", requestId, code }));
            const message = error instanceof ChatError
                ? error.message
                : "Chat is unavailable. Check the app's Fabric connection and server configuration.";
            throw new Error(`${message} Reference: ${requestId}`);
        }
    },
    [],
);
