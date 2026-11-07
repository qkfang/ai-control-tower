import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    chatWithData,
    DataChatError,
    getDataChatValidationError,
    type DataChatMessage,
} from "@/services/data-chat.service";
import { DataChatContext } from "./data-chat.context";

export function DataChatProvider({ children }: { children: ReactNode }) {
    const [messages, setMessages] = useState<DataChatMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);
    const inFlight = useRef(false);
    const generation = useRef(0);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            generation.current += 1;
        };
    }, []);

    async function sendQuestion(question: string) {
        if (inFlight.current || !mounted.current) return;
        const validationError = getDataChatValidationError(question, messages);
        if (validationError) return;

        inFlight.current = true;
        const requestGeneration = generation.current;
        setIsSending(true);
        setPendingQuestion(question);
        setDraft("");
        setError(null);

        try {
            const answer = await chatWithData(question, messages);
            if (!mounted.current || generation.current !== requestGeneration) return;
            setMessages([
                ...messages,
                { role: "user", content: question },
                { role: "assistant", content: answer },
            ]);
            setPendingQuestion(null);
        } catch (error) {
            if (!mounted.current || generation.current !== requestGeneration) return;
            setError(
                error instanceof DataChatError
                    ? error.message
                    : "The request could not be completed. Retry the question or start a new chat.",
            );
        } finally {
            inFlight.current = false;
            if (mounted.current) setIsSending(false);
        }
    }

    function reset() {
        generation.current += 1;
        setMessages([]);
        setDraft("");
        setPendingQuestion(null);
        setError(null);
        // Without cancellation support, keep sends locked until the discarded request settles.
    }

    function editQuestion() {
        if (inFlight.current || pendingQuestion === null) return;
        setDraft(pendingQuestion);
        setPendingQuestion(null);
        setError(null);
    }

    return (
        <DataChatContext.Provider
            value={{
                messages,
                draft,
                setDraft,
                pendingQuestion,
                isSending,
                error,
                send: () => sendQuestion(draft),
                retry: () => pendingQuestion === null ? Promise.resolve() : sendQuestion(pendingQuestion),
                editQuestion,
                reset,
            }}
        >
            {children}
        </DataChatContext.Provider>
    );
}
