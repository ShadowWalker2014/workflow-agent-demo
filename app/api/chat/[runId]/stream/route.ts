import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";
import { createMergedTransform } from "../../transform";

// GET — reconnect a refreshed/dropped client to an in-flight (or just-finished) run.
// The durable run keeps executing server-side; this replays its stream so the client
// resumes exactly where the agent is. We deliberately DO NOT return
// `x-workflow-stream-tail-index`, which makes WorkflowChatTransport do a full replay
// from the start — required here because the client sees the *transformed* stream while
// the durable store indexes the raw ModelCallStreamPart chunks (indices don't align, so
// relative tailing would land at the wrong spot; full replay is index-safe + cheap).
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const readable = getRun(runId).getReadable();
  return createUIMessageStreamResponse({
    stream: readable.pipeThrough(createMergedTransform()),
  });
}
