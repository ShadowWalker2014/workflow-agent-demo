import type { UIMessage } from "ai";
import { convertToModelMessages, createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { chatWorkflow } from "@/app/workflows/chat";
import { createMergedTransform } from "./transform";

// POST — start a durable run for this turn and stream it. The run keeps executing
// server-side even if the browser disconnects; `x-workflow-run-id` lets
// WorkflowChatTransport reconnect to it on refresh (see [runId]/stream).
export async function POST(req: Request) {
  const {
    messages,
    model,
    clientTools,
  }: {
    messages: UIMessage[];
    model?: string;
    clientTools?: Array<{ name: string; description?: string; parameters?: unknown }>;
  } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  const run = await start(chatWorkflow, [modelMessages, model, clientTools]);

  return createUIMessageStreamResponse({
    // Stable assistant message id = msg-<runId>, so a resumed replay reconciles.
    stream: run.readable.pipeThrough(createMergedTransform(`msg-${run.runId}`)),
    headers: {
      // REQUIRED for resume — WorkflowChatTransport persists this and reconnects by it.
      "x-workflow-run-id": run.runId,
    },
  });
}
