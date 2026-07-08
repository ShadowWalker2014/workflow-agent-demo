"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Thread } from "@/components/assistant-ui/thread";
import { useWorkflowAssistantRuntime } from "./runtime";

// assistant-ui variant of the demo — same durable WorkflowAgent backend, different UI
// framework, for side-by-side comparison with the AI Elements build at /c/<id>.
export default function AuiPage() {
  const runtime = useWorkflowAssistantRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Collapsible sidebar (shadcn Sidebar shell). Toggle: the rail, <SidebarTrigger/>, or ⌘/Ctrl+B. */}
      <SidebarProvider>
        <ThreadListSidebar collapsible="icon" />
        <SidebarInset className="min-w-0">
          <SidebarTrigger className="absolute top-3 left-3 z-10" />
          <Thread />
        </SidebarInset>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}
