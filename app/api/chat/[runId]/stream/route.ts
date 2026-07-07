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
  try {
    const readable = getRun(runId).getReadable();
    return createUIMessageStreamResponse({
      // Same stable message id as the POST → the replay updates the existing assistant
      // message instead of appending a duplicate on every refresh.
      stream: readable.pipeThrough(createMergedTransform(`msg-${runId}`)),
    });
  } catch (e) {
    // Stale/unknown run id (e.g. left in localStorage after a restart) — don't 500 the
    // page load; tell the client there's nothing to resume.
    console.error("[reconnect] cannot resume run", runId, e);
    return new Response(null, { status: 204 });
  }
}
