"use client";

// Proper per-tool render UIs (https://www.assistant-ui.com/docs/tools/tool-ui).
// makeAssistantToolUI matches a tool part by name and renders custom UI instead of the
// raw ToolFallback. Mount these inside <AssistantRuntimeProvider>. Display-only — works
// with useExternalStoreRuntime.

import {
  makeAssistantToolUI,
  ReadonlyThreadProvider,
  ThreadPrimitive,
  MessagePrimitive,
  groupPartByType,
  type ThreadMessage,
} from "@assistant-ui/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { ToolGroupContent, ToolGroupRoot, ToolGroupTrigger } from "@/components/assistant-ui/tool-group";
import {
  ClockIcon,
  CalculatorIcon,
  BellIcon,
  SearchIcon,
  Loader2Icon,
  FlaskConicalIcon,
} from "lucide-react";

function ToolCard({
  icon,
  label,
  running,
  children,
}: {
  icon: ReactNode;
  label: string;
  running?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {running ? <Loader2Icon className="size-4 animate-spin" /> : icon}
      </span>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export const GetTimeToolUI = makeAssistantToolUI<Record<string, never>, { utc?: string }>({
  toolName: "get_time",
  render: ({ result, status }) => (
    <ToolCard icon={<ClockIcon className="size-4" />} label="Current time" running={status.type === "running"}>
      {result?.utc && <span className="ml-auto font-mono text-xs">{result.utc}</span>}
    </ToolCard>
  ),
});

export const CalculatorToolUI = makeAssistantToolUI<{ expression?: string }, { value?: number }>({
  toolName: "calculator",
  render: ({ args, result, status }) => (
    <ToolCard icon={<CalculatorIcon className="size-4" />} label="Calculator" running={status.type === "running"}>
      <span className="ml-auto font-mono text-xs">
        {args?.expression}
        {result?.value != null && <span className="text-foreground"> = {result.value}</span>}
      </span>
    </ToolCard>
  ),
});

export const ScheduleReminderToolUI = makeAssistantToolUI<
  { when?: string; text?: string },
  { scheduled?: boolean }
>({
  toolName: "schedule_reminder",
  render: ({ args, result, status }) => (
    <ToolCard icon={<BellIcon className="size-4" />} label="Reminder" running={status.type === "running"}>
      <span className="ml-auto text-xs">
        {result?.scheduled ? "Scheduled: " : ""}
        <span className="text-foreground">{args?.text}</span>
        {args?.when ? <span className="text-muted-foreground"> · {args.when}</span> : null}
      </span>
    </ToolCard>
  ),
});

export const WebSearchToolUI = makeAssistantToolUI<{ query?: string }, unknown>({
  toolName: "web_search",
  render: ({ args, status }) => (
    <ToolCard icon={<SearchIcon className="size-4" />} label="Web search" running={status.type === "running"}>
      <span className="ml-auto truncate text-xs">{args?.query}</span>
    </ToolCard>
  ),
});

// render_widget: render the titled bullet card natively from its args (no JSX eval needed).
export const RenderWidgetToolUI = makeAssistantToolUI<{ title?: string; points?: string[] }, unknown>({
  toolName: "render_widget",
  render: ({ args }) => (
    <div className="my-2 rounded-lg border p-4">
      {args?.title && <h3 className="mb-2 font-semibold">{args.title}</h3>}
      <ul className="list-disc space-y-1 pl-5">
        {(args?.points ?? []).map((p, i) => (
          <li key={i} className="text-muted-foreground text-sm">
            {p}
          </li>
        ))}
      </ul>
    </div>
  ),
});

// Nested subagent thread messages, rendered by ThreadPrimitive.Messages inside a
// ReadonlyThreadProvider. Tool-UI registrations are inherited (scope inheritance), so the
// subagent's web_search calls reuse WebSearchToolUI, and text renders as markdown.
const SubUserMessage = () => (
  <MessagePrimitive.Root className="mb-2">
    <div className="bg-muted text-foreground inline-block rounded-lg px-3 py-1.5 text-sm">
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
    </div>
  </MessagePrimitive.Root>
);

// Collapse the subagent's (potentially many) web searches into one expandable "N tool calls"
// ToolGroup — same pattern the main thread uses — so the nested card stays compact and
// inspectable instead of dumping every search row. The briefing text renders below as markdown.
const SubAssistantMessage = () => (
  <MessagePrimitive.Root className="text-foreground mb-2 text-sm leading-relaxed">
    <MessagePrimitive.GroupedParts groupBy={groupPartByType({ "tool-call": ["group-tool"] })}>
      {({ part, children }) => {
        switch (part.type) {
          case "group-tool":
            return (
              <ToolGroupRoot variant="ghost">
                <ToolGroupTrigger count={part.indices.length} active={part.status.type === "running"} />
                <ToolGroupContent>{children}</ToolGroupContent>
              </ToolGroupRoot>
            );
          case "tool-call":
            return part.toolUI ?? <ToolFallback {...part} />;
          case "text":
            return <MarkdownText />;
          default:
            return null;
        }
      }}
    </MessagePrimitive.GroupedParts>
  </MessagePrimitive.Root>
);

type ResearchResult = {
  topic?: string;
  searches?: { toolCallId: string; query: string; results?: unknown }[];
  briefing?: string;
};

// Rebuild the subagent's conversation as assistant-ui ThreadMessage[] (shape per docs' Runtime
// Types): a user turn (the topic) + an assistant turn (its web_search tool calls, then briefing).
function buildSubThread(result: ResearchResult): ThreadMessage[] {
  const now = new Date();
  const searchParts = (result.searches ?? []).map((s) => ({
    type: "tool-call" as const,
    toolCallId: s.toolCallId,
    toolName: "web_search",
    args: { query: s.query },
    argsText: JSON.stringify({ query: s.query }),
    result: s.results,
  }));
  return [
    {
      id: "sub-user",
      role: "user",
      content: [{ type: "text", text: `Research: ${result.topic ?? ""}` }],
      createdAt: now,
    },
    {
      id: "sub-assistant",
      role: "assistant",
      status: { type: "complete", reason: "stop" },
      createdAt: now,
      content: [
        ...searchParts,
        ...(result.briefing ? [{ type: "text" as const, text: result.briefing }] : []),
      ],
    },
  ] as unknown as ThreadMessage[];
}

// Multi-agent (https://www.assistant-ui.com/docs/tools/multi-agent): the `research` tool is a
// sub-agent. Render its conversation as a nested, read-only "Researcher agent" thread via
// ReadonlyThreadProvider + ThreadPrimitive.Messages — its web searches, then its cited briefing.
export const ResearchToolUI = makeAssistantToolUI<{ topic?: string }, ResearchResult>({
  toolName: "research",
  render: ({ args, result, status }) => {
    const running = status.type === "running";
    const messages = result ? buildSubThread(result) : [];
    return (
      <div className="my-2 rounded-lg border p-3">
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
          {running ? <Loader2Icon className="size-4 animate-spin" /> : <FlaskConicalIcon className="size-4" />}
          Researcher agent{running ? " · working…" : ""}
        </div>
        <div className="ml-1 border-l pl-3">
          {messages.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              <span className="text-muted-foreground">Topic: </span>
              {result?.topic ?? args?.topic}
            </div>
          ) : (
            <ReadonlyThreadProvider messages={messages}>
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === "user" ? <SubUserMessage /> : <SubAssistantMessage />
                }
              </ThreadPrimitive.Messages>
            </ReadonlyThreadProvider>
          )}
        </div>
      </div>
    );
  },
});

// HITL: the ask_for_confirmation client tool. addResult() supplies the human's answer and
// localRuntime re-runs the adapter with it, so the backend continues (or not).
export const AskForConfirmationToolUI = makeAssistantToolUI<
  { message?: string },
  { approved?: boolean }
>({
  toolName: "ask_for_confirmation",
  render: ({ args, result, addResult }) => {
    if (result === undefined) {
      return (
        <div className="my-2 rounded-lg border p-3">
          <div className="mb-2 text-sm font-medium">Approval needed</div>
          <div className="text-muted-foreground mb-3 text-sm">{args?.message ?? "Proceed with this action?"}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addResult({ approved: false })}>
              Decline
            </Button>
            <Button size="sm" onClick={() => addResult({ approved: true })}>
              Approve
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="text-muted-foreground my-2 rounded-lg border px-3 py-2 text-sm">
        {result.approved ? "✓ Approved" : "✗ Declined"}
      </div>
    );
  },
});

export function ToolUIs() {
  return (
    <>
      <GetTimeToolUI />
      <CalculatorToolUI />
      <ScheduleReminderToolUI />
      <WebSearchToolUI />
      <RenderWidgetToolUI />
      <ResearchToolUI />
      <AskForConfirmationToolUI />
    </>
  );
}
