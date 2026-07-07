"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow";
import { useParams } from "next/navigation";
import { msgsKey, runKey, upsertChat } from "@/app/lib/chats";
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type LanguageModelUsage,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CopyIcon, RefreshCcwIcon, SearchIcon, XIcon, ListIcon, ChevronsUpDownIcon } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorName,
  ModelSelectorLogo,
} from "@/components/ai-elements/model-selector";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Sources, SourcesTrigger, SourcesContent, Source } from "@/components/ai-elements/sources";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import { Spinner } from "@/components/ui/spinner";
import { Plan, PlanHeader, PlanTitle, PlanDescription, PlanAction, PlanTrigger, PlanContent } from "@/components/ai-elements/plan";
import { Task, TaskTrigger, TaskContent, TaskItem } from "@/components/ai-elements/task";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from "@/components/ai-elements/chain-of-thought";
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextCacheUsage,
} from "@/components/ai-elements/context";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import { JSXPreview, JSXPreviewContent, JSXPreviewError } from "@/components/ai-elements/jsx-preview";
import {
  OpenIn,
  OpenInContent,
  OpenInTrigger,
  OpenInChatGPT,
  OpenInClaude,
  OpenInv0,
} from "@/components/ai-elements/open-in-chat";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
  type AttachmentData,
} from "@/components/ai-elements/attachments";
import {
  Queue,
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemContent,
  QueueItemActions,
  QueueItemAction,
} from "@/components/ai-elements/queue";

/* ─────────────────────────────── config ─────────────────────────────── */

type ChatMessage = UIMessage<{ usage?: LanguageModelUsage }>;

const models = [
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "anthropic", context: 200_000 },
  { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1", provider: "anthropic", context: 200_000 },
  { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "openai", context: 1_000_000 },
];

const starters = [
  "What's the latest news about Vercel? Cite sources.",
  "Research the Workflow DevKit and summarize it as a card",
  "What is 8231 × 47?",
  "Schedule a reminder to ship the demo tomorrow at 9am",
];

type SearchResult = { title?: string; url?: string; text?: string };
type QueuedMessage = { id: string; text: string; files?: PromptInputMessage["files"] };

/* ───────────────────────────────  page  ─────────────────────────────── */

// Force a clean mount per chat (Next reuses the component across [id] values otherwise),
// so useChat/transport/history reset cleanly when you switch conversations.
export default function ChatPage() {
  const chatId = String(useParams().id);
  return <ChatSession key={chatId} chatId={chatId} />;
}

// The route /c/<id> IS the session id — each chat refreshes/resumes independently.
function ChatSession({ chatId }: { chatId: string }) {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(models[0].id);
  const [modelOpen, setModelOpen] = useState(false);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);

  const model = models.find((m) => m.id === modelId) ?? models[0];

  // On mount: is there an in-flight run to reconnect to? + prior transcript to restore.
  const activeRunIdOnMount = useMemo(
    () => (typeof window === "undefined" ? null : localStorage.getItem(runKey(chatId))),
    [chatId],
  );
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(msgsKey(chatId)) || "[]") as ChatMessage[];
    } catch {
      return [];
    }
  }, [chatId]);

  const transport = useMemo(
    () =>
      new WorkflowChatTransport({
        api: "/api/chat",
        // Overriding prepareSendMessagesRequest means WE build the body — `messages`
        // is a TOP-LEVEL field here (not in `config.body`), so it must be added back
        // or the route receives `undefined`. `config.body` carries the per-send
        // `{ model }` from sendMessage.
        prepareSendMessagesRequest: (config: {
          messages: ChatMessage[];
          body?: Record<string, unknown>;
        }) => ({
          ...config,
          body: { ...config.body, messages: config.messages, chatId },
        }),
        // After POST: persist this chat's durable run id so a refresh can reconnect.
        onChatSendMessage: (response: Response) => {
          const runId = response.headers.get("x-workflow-run-id");
          if (runId) localStorage.setItem(runKey(chatId), runId);
        },
        // Terminal finish arrived — the turn is done; stop trying to reconnect.
        onChatEnd: () => localStorage.removeItem(runKey(chatId)),
        // Build the reconnect GET URL for this chat's stored run.
        prepareReconnectToStreamRequest: (config: Record<string, unknown>) => {
          const runId = typeof window !== "undefined" ? localStorage.getItem(runKey(chatId)) : null;
          if (!runId) throw new Error("No active workflow run to resume");
          return { ...config, api: `/api/chat/${encodeURIComponent(runId)}/stream` };
        },
      }),
    [chatId],
  );

  const { messages, sendMessage, status, stop, error, regenerate, addToolOutput } =
    useChat<ChatMessage>({
      id: chatId,
      messages: initialMessages,
      resume: Boolean(activeRunIdOnMount), // refresh mid-run → reconnect to the live run
      transport,
      sendAutomaticallyWhen: (opts) =>
        lastAssistantMessageIsCompleteWithToolCalls(opts) ||
        lastAssistantMessageIsCompleteWithApprovalResponses(opts),
      onError: (e) => console.error("[useChat]", e),
    });

  const busy = status === "submitted" || status === "streaming";

  // Persist the transcript + index this chat in the sidebar (title = first user line).
  useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return;
    try {
      localStorage.setItem(msgsKey(chatId), JSON.stringify(messages));
      const firstUser = messages.find((m) => m.role === "user");
      const title =
        firstUser?.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join(" ")
          .slice(0, 60) || "New chat";
      upsertChat({ id: chatId, title, updatedAt: Date.now() });
    } catch (e) {
      console.error("[persist]", e);
    }
  }, [messages, chatId]);

  // The last user query — fed to <OpenIn> so you can reopen it in another AI app.
  const lastUserQuery = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((m) => m.role === "user")
        ?.parts.filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join(" ") ?? "",
    [messages],
  );

  const dispatch = useCallback(
    (value: string, files?: PromptInputMessage["files"]) => {
      sendMessage({ text: value, files }, { body: { model: modelId } });
    },
    [sendMessage, modelId],
  );

  // Queue-while-busy: drain one queued message whenever the agent goes idle.
  useEffect(() => {
    if (busy || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    dispatch(next.text, next.files);
  }, [busy, queue, dispatch]);

  const submit = (value: string, files?: PromptInputMessage["files"]) => {
    const trimmed = value.trim();
    if (!trimmed && !files?.length) return;
    if (busy) {
      setQueue((q) => [...q, { id: crypto.randomUUID(), text: trimmed, files }]);
    } else {
      dispatch(trimmed, files);
    }
    setText("");
  };

  const handleSubmit = (message: PromptInputMessage) => {
    if (busy && !message.text?.trim() && !message.files?.length) {
      stop();
      return;
    }
    submit(message.text ?? "", message.files);
  };

  const usage = [...messages].reverse().find((m) => m.role === "assistant")?.metadata?.usage;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex-none border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold">WDK Agent Demo</h1>
            <p className="text-muted-foreground text-xs">
              Durable WorkflowAgent · extended thinking · web search · subagents · HITL
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUserQuery && (
              <OpenIn query={lastUserQuery}>
                <OpenInTrigger />
                <OpenInContent>
                  <OpenInChatGPT />
                  <OpenInClaude />
                  <OpenInv0 />
                </OpenInContent>
              </OpenIn>
            )}
            {usage ? (
              <Context
                usedTokens={usage.totalTokens ?? 0}
                maxTokens={model.context}
                usage={usage}
                modelId={modelId}
              >
                <ContextTrigger />
                <ContextContent>
                  <ContextContentHeader />
                  <ContextContentBody>
                    <ContextInputUsage />
                    <ContextOutputUsage />
                    <ContextReasoningUsage />
                    <ContextCacheUsage />
                  </ContextContentBody>
                  <ContextContentFooter />
                </ContextContent>
              </Context>
            ) : (
              <span className="text-muted-foreground rounded-full border px-2.5 py-1 text-xs">
                {model.name}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Conversation */}
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-16">
              <ConversationEmptyState
                title="Ask the agent anything"
                description="A durable Workflow DevKit agent: extended thinking, live web search, research subagents, and human-in-the-loop."
              />
              <Suggestions className="justify-center">
                {starters.map((s) => (
                  <Suggestion key={s} suggestion={s} onClick={(v) => submit(v)} />
                ))}
              </Suggestions>
            </div>
          ) : (
            messages.map((message, mi) => (
              <MessageView
                key={message.id}
                message={message}
                isLast={mi === messages.length - 1}
                streaming={status === "streaming" && mi === messages.length - 1}
                busy={busy}
                addToolOutput={addToolOutput}
                regenerate={regenerate}
              />
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Composer */}
      <div className="flex-none">
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          {error && (
            <div className="bg-destructive/10 text-destructive mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm">
              <span>Error: {error.message}</span>
              <button className="underline" onClick={() => regenerate()}>
                Retry
              </button>
            </div>
          )}

          {queue.length > 0 && (
            <div className="mb-2">
              <Queue>
                <QueueSection defaultOpen>
                  <QueueSectionTrigger>
                    <QueueSectionLabel count={queue.length} label="queued" icon={<ListIcon className="size-4" />} />
                  </QueueSectionTrigger>
                  <QueueSectionContent>
                    <QueueList>
                      {queue.map((q) => (
                        <QueueItem key={q.id}>
                          <div className="flex items-center gap-2">
                            <QueueItemContent>{q.text}</QueueItemContent>
                            <QueueItemActions>
                              <QueueItemAction
                                onClick={() => setQueue((cur) => cur.filter((x) => x.id !== q.id))}
                                aria-label="Remove"
                              >
                                <XIcon className="size-3" />
                              </QueueItemAction>
                            </QueueItemActions>
                          </div>
                        </QueueItem>
                      ))}
                    </QueueList>
                  </QueueSectionContent>
                </QueueSection>
              </Queue>
            </div>
          )}

          <PromptInput onSubmit={handleSubmit} className="rounded-2xl shadow-sm" globalDrop multiple>
            <PromptInputBody>
              {/* Selected attachments render here (removable) — confirms the file is attached. */}
              <AttachmentsPreview />
              <PromptInputTextarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message the agent…"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools className="min-w-0">
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>

                <ModelSelector open={modelOpen} onOpenChange={setModelOpen}>
                  <ModelSelectorTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-8 min-w-0 shrink items-center gap-1.5 rounded-md border px-2.5 text-sm">
                    <ModelSelectorLogo provider={model.provider} />
                    <span className="min-w-0 truncate">{model.name}</span>
                    <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-60" />
                  </ModelSelectorTrigger>
                  <ModelSelectorContent title="Select a model">
                    <ModelSelectorInput placeholder="Search models…" />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      <ModelSelectorGroup heading="Models">
                        {models.map((m) => (
                          <ModelSelectorItem
                            key={m.id}
                            value={m.id}
                            onSelect={(v) => {
                              setModelId(v);
                              setModelOpen(false);
                            }}
                          >
                            <ModelSelectorLogo provider={m.provider} />
                            <ModelSelectorName>{m.name}</ModelSelectorName>
                          </ModelSelectorItem>
                        ))}
                      </ModelSelectorGroup>
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              </PromptInputTools>
              <PromptInputSubmit disabled={!text.trim() && !busy} status={status} />
            </PromptInputFooter>
          </PromptInput>

          <p className="text-muted-foreground mt-2 text-center text-xs">
            Runs as a durable Vercel Workflow — safe to refresh mid-run.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── message view ──────────────────────────── */

function MessageView({
  message,
  isLast,
  streaming,
  busy,
  addToolOutput,
  regenerate,
}: {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  busy: boolean;
  addToolOutput: ReturnType<typeof useChat<ChatMessage>>["addToolOutput"];
  regenerate: ReturnType<typeof useChat<ChatMessage>>["regenerate"];
}) {
  const parts = message.parts;
  const reasoning = parts
    .filter((p) => p.type === "reasoning")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");
  const hasText = parts.some((p) => p.type === "text");
  const sources = collectSources(message);
  const toolParts = parts.filter((p) => p.type.startsWith("tool-")) as ToolUIPart[];
  const searchParts = toolParts.filter((p) => p.type === "tool-web_search");
  const firstSearchIdx = parts.findIndex((p) => p.type === "tool-web_search");

  return (
    <Message from={message.role}>
      <MessageContent>
        {/* Attachments the user sent */}
        {message.role === "user" && <UserAttachments message={message} />}

        {/* Thinking (extended reasoning) */}
        {reasoning && (
          <Reasoning className="w-full" isStreaming={streaming && !hasText} defaultOpen={false}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoning}</ReasoningContent>
          </Reasoning>
        )}

        {/* Ordered parts — process (the search trace) renders INLINE, before the final answer */}
        {parts.map((part, i) => {
          if (part.type === "reasoning") return null; // consolidated above
          if (part.type === "tool-web_search") {
            return i === firstSearchIdx ? (
              <SearchTrace key={`${message.id}-${i}`} searchParts={searchParts} open={streaming} />
            ) : null;
          }
          return (
            <PartView
              key={`${message.id}-${i}`}
              part={part}
              sources={sources}
              streaming={streaming}
              addToolOutput={addToolOutput}
            />
          );
        })}

        {/* Citations list at the end (inline pills live inside the answer text) */}
        {sources.length > 0 && (
          <Sources>
            <SourcesTrigger count={sources.length} />
            <SourcesContent>
              {sources.map((s, i) => (
                <Source key={`${s.url}-${i}`} href={s.url} title={s.title || s.url}>
                  {s.title || s.url}
                </Source>
              ))}
            </SourcesContent>
          </Sources>
        )}

        {/* Copy / Retry */}
        {message.role === "assistant" && isLast && !busy && (
          <MessageActions>
            <MessageAction label="Copy" onClick={() => copyText(message)}>
              <CopyIcon className="size-3" />
            </MessageAction>
            <MessageAction label="Retry" onClick={() => regenerate()}>
              <RefreshCcwIcon className="size-3" />
            </MessageAction>
          </MessageActions>
        )}
      </MessageContent>
    </Message>
  );
}

/* ──────────────────────────── part renderer ─────────────────────────── */

function PartView({
  part,
  sources,
  streaming,
  addToolOutput,
}: {
  part: ChatMessage["parts"][number];
  sources: SearchResult[];
  streaming: boolean;
  addToolOutput: ReturnType<typeof useChat<ChatMessage>>["addToolOutput"];
}) {
  // Assistant text renders markdown; source-URL links become inline citation pills.
  if (part.type === "text")
    return <MessageResponse components={citeComponents(sources)}>{part.text}</MessageResponse>;
  if (part.type === "reasoning") return null; // rendered once, above
  if (part.type === "file") return null; // rendered via UserAttachments
  if (!part.type.startsWith("tool-")) return null;

  const tp = part as ToolUIPart;

  // Deep research → a spinner while running; a collapsed Plan (queries + briefing) once done.
  if (tp.type === "tool-research") {
    const out = tp.output as { topic?: string; plan?: string[]; briefing?: string } | undefined;
    const input = tp.input as { topic?: string } | undefined;
    const topic = out?.topic ?? input?.topic ?? "the topic";
    if (tp.state !== "output-available") {
      return (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-3.5" />
          Researching {topic}…
        </div>
      );
    }
    return (
      <Plan defaultOpen className="w-full">
        <PlanHeader>
          <div className="flex-1">
            <PlanTitle>Deep research</PlanTitle>
            <PlanDescription>{topic}</PlanDescription>
          </div>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent className="space-y-3">
          {out?.plan && out.plan.length > 0 && (
            <Task defaultOpen={false}>
              <TaskTrigger title={`Searched ${out.plan.length} quer${out.plan.length > 1 ? "ies" : "y"}`} />
              <TaskContent>
                {out.plan.map((q, i) => (
                  <TaskItem key={i}>{q}</TaskItem>
                ))}
              </TaskContent>
            </Task>
          )}
          {out?.briefing && <MessageResponse>{out.briefing}</MessageResponse>}
        </PlanContent>
      </Plan>
    );
  }

  // HITL → Confirmation (client tool, resolved in-browser)
  if (tp.type === "tool-ask_for_confirmation") {
    const input = tp.input as { message?: string } | undefined;
    const output = tp.output as { approved?: boolean } | undefined;
    const answered = tp.state === "output-available";
    const approval = { id: tp.toolCallId, approved: answered ? output?.approved : undefined };
    const state = answered ? "output-available" : "approval-requested";
    const answer = (approved: boolean) =>
      addToolOutput({ tool: "ask_for_confirmation", toolCallId: tp.toolCallId, output: { approved } });
    return (
      <Confirmation approval={approval} state={state as ToolUIPart["state"]}>
        <ConfirmationTitle>Approval needed</ConfirmationTitle>
        <ConfirmationRequest>{input?.message ?? "Proceed with this action?"}</ConfirmationRequest>
        <ConfirmationAccepted>Approved</ConfirmationAccepted>
        <ConfirmationRejected>Declined</ConfirmationRejected>
        <ConfirmationActions>
          <ConfirmationAction variant="outline" onClick={() => answer(false)}>
            Decline
          </ConfirmationAction>
          <ConfirmationAction variant="default" onClick={() => answer(true)}>
            Approve
          </ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    );
  }

  // Rendered widget → JSXPreview + source CodeBlock
  if (tp.type === "tool-render_widget") {
    const out = tp.output as { title?: string; jsx?: string } | undefined;
    if (!out?.jsx) return <Tool><ToolHeader type={tp.type} state={tp.state} /></Tool>;
    return (
      <div className="w-full space-y-2">
        <JSXPreview jsx={out.jsx} isStreaming={streaming}>
          <JSXPreviewContent />
          <JSXPreviewError />
        </JSXPreview>
        <CodeBlock code={out.jsx} language="jsx">
          <CodeBlockHeader>
            <CodeBlockTitle>
              <CodeBlockFilename>{(out.title ?? "widget").toLowerCase().replace(/\s+/g, "-")}.jsx</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      </div>
    );
  }

  // web_search → surfaced via Sources / ChainOfThought, not inline
  if (tp.type === "tool-web_search") return null;

  // Everything else (get_time, calculator, …) → generic Tool card
  return (
    <Tool>
      <ToolHeader type={tp.type} state={tp.state} />
      <ToolContent>
        <ToolInput input={tp.input} />
        <ToolOutput
          output={
            tp.output != null ? (
              <MessageResponse>{"```json\n" + JSON.stringify(tp.output, null, 2) + "\n```"}</MessageResponse>
            ) : undefined
          }
          errorText={tp.errorText}
        />
      </ToolContent>
    </Tool>
  );
}

// Live preview of files the user has attached (inside the composer, before sending).
function AttachmentsPreview() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <Attachments variant="inline" className="px-3 pt-3">
      {attachments.files.map((file) => (
        <Attachment key={file.id} data={file as AttachmentData} onRemove={() => attachments.remove(file.id)}>
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

function UserAttachments({ message }: { message: ChatMessage }) {
  const files = message.parts.filter((p) => p.type === "file");
  if (files.length === 0) return null;
  return (
    <Attachments variant="grid" className="mb-1">
      {files.map((f, i) => (
        <Attachment key={i} data={{ ...f, id: `${message.id}-file-${i}` } as AttachmentData}>
          <AttachmentPreview />
        </Attachment>
      ))}
    </Attachments>
  );
}

// Inline progress: the web searches shown as a live chain-of-thought before the answer.
function SearchTrace({ searchParts, open }: { searchParts: ToolUIPart[]; open: boolean }) {
  return (
    <ChainOfThought defaultOpen={open} className="w-full">
      <ChainOfThoughtHeader>Searching the web</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {searchParts.map((p, i) => {
          const results = (p.output as SearchResult[] | undefined) ?? [];
          return (
            <ChainOfThoughtStep
              key={i}
              icon={SearchIcon}
              label={(p.input as { query?: string })?.query ?? "Searching…"}
              status={p.state === "output-available" ? "complete" : "active"}
            >
              {results.length > 0 && (
                <ChainOfThoughtSearchResults>
                  {results.slice(0, 5).map((r, j) => (
                    <ChainOfThoughtSearchResult key={j}>
                      {hostname(r.url) ?? r.title ?? "result"}
                    </ChainOfThoughtSearchResult>
                  ))}
                </ChainOfThoughtSearchResults>
              )}
            </ChainOfThoughtStep>
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

// Markdown renderer override: a link whose href is a known source URL becomes an
// inline InlineCitation pill; all other links render normally.
function citeComponents(sources: SearchResult[]) {
  const byUrl = new Map(sources.filter((s) => s.url).map((s) => [s.url as string, s] as const));
  return {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const src = href ? byUrl.get(href) : undefined;
      if (src?.url) {
        return (
          <InlineCitation>
            <InlineCitationCard>
              <InlineCitationCardTrigger sources={[src.url]} />
              <InlineCitationCardBody>
                {/* CardBody is p-0 (padding normally comes from the carousel item),
                    so a single source needs its own padded wrapper. */}
                <div className="p-4">
                  <InlineCitationSource
                    title={src.title}
                    url={src.url}
                    description={src.text?.slice(0, 160)}
                  />
                </div>
              </InlineCitationCardBody>
            </InlineCitationCard>
          </InlineCitation>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {children}
        </a>
      );
    },
  };
}

/* ─────────────────────────────── helpers ────────────────────────────── */

function collectSources(message: ChatMessage): SearchResult[] {
  if (message.role !== "assistant") return [];
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const part of message.parts) {
    if (part.type !== "tool-web_search") continue;
    const results = (part as ToolUIPart).output as SearchResult[] | undefined;
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      if (!r?.url || seen.has(r.url)) continue;
      seen.add(r.url);
      out.push(r);
    }
  }
  return out;
}

function hostname(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function copyText(message: ChatMessage) {
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n");
  navigator.clipboard.writeText(text).catch((e) => console.error("[copy]", e));
}
