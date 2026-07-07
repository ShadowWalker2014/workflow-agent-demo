"use client";

import Link from "next/link";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { useWorkflowAssistantRuntime } from "./runtime";

// assistant-ui variant of the demo — same durable WorkflowAgent backend, different UI
// framework, for side-by-side comparison with the AI Elements build at /c/<id>.
export default function AuiPage() {
  const runtime = useWorkflowAssistantRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid h-dvh grid-cols-[260px_1fr]">
        <aside className="bg-sidebar flex flex-col gap-2 overflow-y-auto border-r p-2">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 text-xs"
          >
            <span aria-hidden>←</span> AI Elements demo
          </Link>
          <ThreadList />
        </aside>
        <main className="min-w-0">
          <Thread />
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
