import type { UIMessageChunk } from "ai";
import { toUIMessageChunk } from "@ai-sdk/workflow";

// Superset of the installed `LanguageModelUsage` (which carries token *details*
// objects); we only aggregate the flat counters the <Context> component reads.
type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

// Drop-in replacement for createModelCallToUIChunkTransform() that ALSO:
//   • aggregates per-step usage from `model-call-end` → one final `message-metadata`
//     chunk so the client can render <Context> (the stock transform drops usage), and
//   • passes custom `data-*` parts straight through (the stock transform drops them).
//
// Both the POST route and the resumable GET reconnect route pipe the run's
// ModelCallStreamPart stream through a FRESH instance of this (state is per-call).
// `messageId` MUST be stable across the initial POST and every reconnect replay of the
// SAME run — otherwise a resumed stream creates a NEW assistant message each refresh
// (duplicate lines) instead of reconciling with the one already in the transcript.
export function createMergedTransform(messageId?: string) {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  return new TransformStream<{ type?: string; usage?: Partial<Usage> }, UIMessageChunk>({
    start(c) {
      c.enqueue({ type: "start", messageId });
      c.enqueue({ type: "start-step" });
    },
    flush(c) {
      c.enqueue({ type: "message-metadata", messageMetadata: { usage } });
      c.enqueue({ type: "finish-step" });
      c.enqueue({ type: "finish" });
    },
    transform(part, c) {
      if (part?.type === "model-call-end" && part.usage) {
        usage.inputTokens = (usage.inputTokens ?? 0) + (part.usage.inputTokens ?? 0);
        usage.outputTokens = (usage.outputTokens ?? 0) + (part.usage.outputTokens ?? 0);
        usage.totalTokens = (usage.totalTokens ?? 0) + (part.usage.totalTokens ?? 0);
        if (part.usage.reasoningTokens != null)
          usage.reasoningTokens = (usage.reasoningTokens ?? 0) + part.usage.reasoningTokens;
        if (part.usage.cachedInputTokens != null)
          usage.cachedInputTokens = (usage.cachedInputTokens ?? 0) + part.usage.cachedInputTokens;
        return;
      }
      if (typeof part?.type === "string" && part.type.startsWith("data-")) {
        c.enqueue(part as unknown as UIMessageChunk);
        return;
      }
      const ui = toUIMessageChunk(part as never);
      if (ui) c.enqueue(ui);
    },
  });
}
