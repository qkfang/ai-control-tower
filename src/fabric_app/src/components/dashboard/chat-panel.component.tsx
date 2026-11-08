import { useEffect, useRef, type ReactNode } from "react";
import { LoaderCircle, MessageSquare, RotateCcw, Send, ShieldAlert } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatContextValue } from "@/hooks/data-chat.context";
import {
    getDataChatValidationError,
    MAX_CHAT_EXCHANGES,
    MAX_QUESTION_LENGTH,
} from "@/services/data-chat.service";

function safeLink(url: string): string {
    try {
        const parsed = new URL(url);
        if (
            (parsed.protocol === "https:" || parsed.protocol === "http:") &&
            !parsed.username &&
            !parsed.password
        ) {
            return parsed.href;
        }
    } catch {
        // Relative links and unsupported URLs are shown as plain text.
    }
    return "";
}

function MarkdownAnswer({ content }: { content: string }) {
    return (
        <div className="min-w-0 space-y-m break-words text-300 leading-400 [overflow-wrap:anywhere] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-m [&_blockquote]:text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-xs [&_code]:font-monospace [&_h1]:font-heading [&_h1]:text-500 [&_h1]:font-semibold [&_h2]:font-heading [&_h2]:text-400 [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_li]:my-xs [&_ol]:list-decimal [&_ol]:pl-xl [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-m [&_ul]:list-disc [&_ul]:pl-xl">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                allowedElements={[
                    "p", "br", "strong", "em", "del", "a", "blockquote", "ul", "ol", "li",
                    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "pre", "code",
                    "table", "thead", "tbody", "tr", "th", "td",
                ]}
                urlTransform={safeLink}
                components={{
                    a: ({ href, children }) => href ? (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            className="rounded-sm font-medium text-accent-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            {children}
                            <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                    ) : <span>{children}</span>,
                    table: ({ children }) => (
                        <div
                            role="region"
                            aria-label="Answer table"
                            tabIndex={0}
                            className="max-w-full overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            <table className="w-full border-collapse text-left text-300">{children}</table>
                        </div>
                    ),
                    th: ({ children }) => (
                        <th className="border-b border-border bg-secondary px-m py-s font-semibold">{children}</th>
                    ),
                    td: ({ children }) => (
                        <td className="border-b border-border px-m py-s align-top">{children}</td>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

interface ChatPanelProps {
    chat: ChatContextValue;
    id: string;
    title: string;
    assistantLabel: string;
    emptyHint: string;
    pendingHint: string;
    toolbar?: ReactNode;
    locked?: boolean;
}

export function ChatPanel({
    chat, id, title, assistantLabel, emptyHint, pendingHint, toolbar, locked = false,
}: ChatPanelProps) {
    const {
        messages, draft, setDraft, pendingQuestion, isSending, error,
        send, retry, editQuestion, reset,
    } = chat;
    const logRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const composing = useRef(false);
    const exchangeCount = messages.length / 2;
    const characterCount = Array.from(draft).length;
    const limitReached = exchangeCount >= MAX_CHAT_EXCHANGES;
    const validationError = draft.length > 0 || limitReached
        ? getDataChatValidationError(draft, messages)
        : null;
    const composerDisabled = locked || isSending || pendingQuestion !== null || limitReached;

    useEffect(() => {
        const log = logRef.current;
        if (log) log.scrollTop = log.scrollHeight;
    }, [messages.length, pendingQuestion, isSending]);

    return (
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-l font-base" aria-label={title}>
            <div className="flex flex-wrap items-center justify-between gap-m">
                <div>
                    <h2 className="font-heading text-500 font-semibold text-foreground">{title}</h2>
                    <p className="mt-xs text-200 text-muted-foreground">
                        Session only · {exchangeCount} / {MAX_CHAT_EXCHANGES} completed exchanges
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-s">
                    {toolbar}
                    <button
                        type="button"
                        onClick={() => {
                            reset();
                            requestAnimationFrame(() => composerRef.current?.focus());
                        }}
                        className="inline-flex items-center gap-s rounded-xl border border-border bg-card px-m py-s text-300 text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        <RotateCcw className="icon-size-200" aria-hidden />
                        New chat
                    </button>
                </div>
            </div>

            <div className="flex items-start gap-m rounded-xl border border-warning/40 bg-warning/10 p-l">
                <ShieldAlert className="icon-size-300 shrink-0 text-warning" aria-hidden />
                <div className="text-300 leading-300 text-foreground">
                    <p className="font-semibold">App-owner permissions</p>
                    <p className="mt-xs">
                        Requests run with app-owner permissions, not viewer-specific permissions.
                    </p>
                </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
                <div
                    ref={logRef}
                    role="log"
                    aria-label={`${title} conversation`}
                    aria-live="polite"
                    aria-relevant="additions text"
                    tabIndex={0}
                    className="flex max-h-[60dvh] min-h-64 flex-col gap-l overflow-y-auto p-l focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:p-xxl"
                >
                    {messages.length === 0 && pendingQuestion === null && (
                        <div className="m-auto flex max-w-prose flex-col items-center gap-m py-xxxl text-center text-muted-foreground">
                            <MessageSquare className="icon-size-600 text-accent-foreground" aria-hidden />
                            <p className="font-heading text-400 font-medium text-foreground">Start with a question</p>
                            <p className="text-300 leading-300">{emptyHint}</p>
                        </div>
                    )}
                    {messages.map((message, index) => (
                        <article key={index} className="min-w-0 rounded-xl border border-border p-l">
                            <h3 className="mb-s text-200 font-semibold text-muted-foreground">
                                {message.role === "user" ? "You" : assistantLabel}
                            </h3>
                            {message.role === "user" ? (
                                <p className="whitespace-pre-wrap break-words text-300 leading-400 [overflow-wrap:anywhere]">
                                    {message.content}
                                </p>
                            ) : <MarkdownAnswer content={message.content} />}
                        </article>
                    ))}
                    {pendingQuestion !== null && (
                        <article className="min-w-0 rounded-xl border border-border bg-secondary p-l">
                            <h3 className="mb-s text-200 font-semibold text-muted-foreground">You</h3>
                            <p className="whitespace-pre-wrap break-words text-300 leading-400 [overflow-wrap:anywhere]">
                                {pendingQuestion}
                            </p>
                        </article>
                    )}
                </div>

                {isSending && (
                    <div role="status" className="flex items-center gap-s border-t border-border px-l py-m text-300 text-muted-foreground">
                        <LoaderCircle className="icon-size-200 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
                        <span>
                            {pendingQuestion === null
                                ? "Finishing the previous request. Its answer will be discarded."
                                : pendingHint}
                        </span>
                    </div>
                )}

                {error && (
                    <div className="border-t border-destructive/30 bg-destructive/10 p-l">
                        <p role="alert" className="text-300 leading-300 text-foreground">{error}</p>
                        {pendingQuestion !== null && (
                            <div className="mt-m flex flex-wrap gap-s">
                                <button
                                    type="button"
                                    disabled={isSending}
                                    onClick={() => void retry()}
                                    className="rounded-xl border border-border bg-card px-m py-s text-300 font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Retry question
                                </button>
                                <button
                                    type="button"
                                    disabled={isSending}
                                    onClick={() => {
                                        editQuestion();
                                        requestAnimationFrame(() => composerRef.current?.focus());
                                    }}
                                    className="rounded-xl border border-border bg-card px-m py-s text-300 text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Edit question
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <form
                    className="flex flex-col gap-m border-t border-border p-l"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!composerDisabled && !validationError) void send();
                    }}
                >
                    <label htmlFor={`${id}-question`} className="text-300 font-semibold text-foreground">
                        Your question
                    </label>
                    <textarea
                        ref={composerRef}
                        id={`${id}-question`}
                        value={draft}
                        rows={3}
                        disabled={composerDisabled}
                        aria-invalid={Boolean(validationError)}
                        aria-describedby={`${id}-help ${id}-count ${id}-validation`}
                        onChange={(event) => setDraft(event.target.value)}
                        onCompositionStart={() => { composing.current = true; }}
                        onCompositionEnd={() => { composing.current = false; }}
                        onKeyDown={(event) => {
                            if (
                                event.key === "Enter" &&
                                !event.shiftKey &&
                                !composing.current &&
                                !event.nativeEvent.isComposing &&
                                event.keyCode !== 229
                            ) {
                                event.preventDefault();
                                if (!composerDisabled && !validationError) void send();
                            }
                        }}
                        placeholder="What would you like to know?"
                        className="w-full resize-y rounded-xl border border-input bg-background p-m font-base text-300 leading-400 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive"
                    />
                    <p id={`${id}-validation`} role={validationError ? "alert" : undefined} className="text-300 text-destructive">
                        {validationError}
                    </p>
                    <div className="flex flex-wrap items-end justify-between gap-m">
                        <div className="text-200 leading-300 text-muted-foreground">
                            <p id={`${id}-help`}>Enter to send · Shift+Enter for a new line</p>
                            <p id={`${id}-count`}>{characterCount.toLocaleString()} / {MAX_QUESTION_LENGTH.toLocaleString()} characters</p>
                        </div>
                        <button
                            type="submit"
                            disabled={composerDisabled || !draft.trim() || Boolean(validationError)}
                            className="inline-flex items-center justify-center gap-s rounded-xl bg-primary px-l py-s text-300 font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Send className="icon-size-200" aria-hidden />
                            Send
                        </button>
                    </div>
                    <p className="text-200 leading-300 text-muted-foreground">
                        History clears on New chat, reload, or sign-out. Verify answers before acting on them.
                    </p>
                </form>
            </div>
        </section>
    );
}
