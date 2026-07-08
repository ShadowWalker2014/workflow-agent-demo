"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Thread } from "@/components/assistant-ui/thread";
import { useWorkflowAssistantRuntime } from "./runtime";
import { ToolUIs } from "./tool-uis";
import { QueueProvider } from "./queue";

// assistant-ui variant of the demo — same durable WorkflowAgent backend, different UI
// framework, for side-by-side comparison with the AI Elements build at /c/<id>.
export default function AuiPage() {
  const runtime = useWorkflowAssistantRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ToolUIs />
      {/* Collapsible sidebar — assistant-ui's design uses the shadcn default "offcanvas"
          (slides fully away). Toggle: the rail, <SidebarTrigger/>, or ⌘/Ctrl+B.
          h-dvh + overflow-hidden: SidebarProvider is `min-h-svh` (grows) by default, which
          leaves Thread's viewport unbounded so its scroll-anchoring reserves runaway empty
          space on later turns. Pin the height so only the thread viewport scrolls. */}
      <SidebarProvider className="h-dvh overflow-hidden">
        <ThreadListSidebar />
        <SidebarInset className="relative min-h-0 min-w-0">
          <SidebarTrigger className="absolute top-3 left-3 z-10" />
          <QueueProvider>
            <Thread />
          </QueueProvider>
        </SidebarInset>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}
