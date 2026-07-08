"use client";

// Proper per-tool render UIs (https://www.assistant-ui.com/docs/tools/tool-ui).
// makeAssistantToolUI matches a tool part by name and renders custom UI instead of the
// raw ToolFallback. Mount these inside <AssistantRuntimeProvider>. Display-only — works
// with useExternalStoreRuntime.

import { makeAssistantToolUI } from "@assistant-ui/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
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

// Multi-agent: the `research` tool is itself a sub-agent. Render its activity as a nested,
// read-only "Researcher agent" conversation (its search queries + cited briefing).
export const ResearchToolUI = makeAssistantToolUI<
  { topic?: string },
  { topic?: string; plan?: string[]; briefing?: string }
>({
  toolName: "research",
  render: ({ args, result, status }) => {
    const running = status.type === "running";
    return (
      <div className="my-2 rounded-lg border p-3">
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
          {running ? <Loader2Icon className="size-4 animate-spin" /> : <FlaskConicalIcon className="size-4" />}
          Researcher agent{running ? " · working…" : ""}
        </div>
        <div className="ml-1 space-y-2 border-l pl-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Topic: </span>
            {result?.topic ?? args?.topic}
          </div>
          {result?.plan && result.plan.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.plan.map((q, i) => (
                <span
                  key={i}
                  className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                >
                  <SearchIcon className="size-3" />
                  {q}
                </span>
              ))}
            </div>
          )}
          {result?.briefing && (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{result.briefing}</div>
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
