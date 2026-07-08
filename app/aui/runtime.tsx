"use client";

// NATIVE assistant-ui runtime: useLocalRuntime + a ChatModelAdapter that streams from our
// ai@7 WorkflowAgent backend. assistant-ui owns the message state, so HITL (addResult),
// queueing, and interactables all work the assistant-ui way. (We can't use
// @assistant-ui/react-ai-sdk — it's pinned to the ai@6 generation; we're on ai@7.)

import { useMemo } from "react";
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";
import {
  useLocalRuntime,
  useRemoteThreadListRuntime,
  InMemoryThreadListAdapter,
  useThreadListItem,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  type ChatModelAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";

const MODEL = "anthropic/claude-sonnet-4.5";

/* eslint-disable @typescript-eslint/no-explicit-any */

// assistant-ui ThreadMessage → ai@7 UIMessage (POST body; includes tool RESULTS so a
// resolved HITL/tool continues on the next turn).
function threadToUIMessage(m: ThreadMessage): UIMessage {
  const parts: any[] = [];
  for (const c of m.content as any[]) {
    if (c.type === "text") parts.push({ type: "text", text: c.text });
    else if (c.type === "reasoning") parts.push({ type: "reasoning", text: c.text });
    else if (c.type === "tool-call")
      parts.push({
        type: `tool-${c.toolName}`,
        toolCallId: c.toolCallId,
        state: c.result !== undefined ? "output-available" : "input-available",
        input: c.args ?? {},
        ...(c.result !== undefined ? { output: c.result } : {}),
      });
    else if (c.type === "image") parts.push({ type: "file", mediaType: "image/png", url: c.image });
    else if (c.type === "file")
      parts.push({ type: "file", mediaType: c.mimeType, url: c.data, filename: c.filename });
  }
  return { id: m.id, role: m.role, parts } as UIMessage;
}

// ai@7 UIMessage parts → assistant-ui content parts (text · reasoning · tool-call · image ·
// file · web_search → source parts for the Sources UI).
function uiPartsToContent(msg: UIMessage): any[] {
  const content: any[] = [];
  for (const p of msg.parts as any[]) {
    if (p.type === "text") content.push({ type: "text", text: p.text });
    else if (p.type === "reasoning") content.push({ type: "reasoning", text: p.text });
    else if (p.type === "file") {
      if (String(p.mediaType ?? "").startsWith("image/")) content.push({ type: "image", image: p.url });
      else content.push({ type: "file", filename: p.filename, mimeType: p.mediaType, data: p.url });
    } else if (typeof p.type === "string" && (p.type.startsWith("tool-") || p.type === "dynamic-tool")) {
      const toolName = p.toolName ?? p.type.replace(/^tool-/, "");
      content.push({
        type: "tool-call",
        toolCallId: p.toolCallId,
        toolName,
        args: p.input ?? {},
        result: p.output,
      });
      // NOTE: assistant-ui's <Sources> renders native model-emitted `source-url` parts.
      // Our web_search is a TOOL, so results appear via the WebSearchToolUI card + the
      // model's inline citation links ([1](url)) that MarkdownText renders. Synthesizing
      // "source" content parts here rendered as empty pills, so we don't.
    }
  }
  return content;
}

function useThreadRuntime(chatId: string) {
  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({ api: "/api/chat" }), []);

  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal, context }) {
        // Forward client-registered tools (e.g. interactables' update_* tools) so the
        // backend can offer them to the model.
        const ctxTools = (context as any)?.tools;
        const clientTools = ctxTools
          ? Object.entries(ctxTools as Record<string, any>).map(([name, t]) => ({
              name,
              description: t?.description,
              parameters: t?.parameters,
            }))
          : [];
        const chunkStream = await transport.sendMessages({
          trigger: "submit-message",
          chatId,
          messageId: undefined,
          messages: (messages as ThreadMessage[]).map(threadToUIMessage),
          abortSignal,
          metadata: undefined,
          headers: undefined,
          body: { model: MODEL, chatId, ...(clientTools.length ? { clientTools } : {}) },
        } as any);
        let last: UIMessage | undefined;
        for await (const uiMessage of readUIMessageStream({ stream: chunkStream })) {
          last = uiMessage;
          yield { content: uiPartsToContent(uiMessage) };
        }
        // If the run stopped on an unresolved CLIENT tool (no output — e.g.
        // ask_for_confirmation, or an interactable update_* tool), pause the run with
        // requires-action so a tool UI's addResult() resumes it (localRuntime re-runs the
        // adapter with the tool result → the backend continues). Otherwise addResult has no
        // paused run to continue and "nothing happens".
        const waiting = (last?.parts ?? []).some(
          (p) =>
            typeof (p as any).type === "string" &&
            ((p as any).type.startsWith("tool-") || (p as any).type === "dynamic-tool") &&
            (p as any).output === undefined &&
            (p as any).state !== "output-error",
        );
        if (waiting && last) {
          yield {
            content: uiPartsToContent(last),
            status: { type: "requires-action", reason: "interrupt" } as any,
          };
        }
      },
    }),
    [transport, chatId],
  );

  return useLocalRuntime(adapter, {
    adapters: {
      attachments: new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
      ]),
    },
  });
}

function ThreadRuntimeHook() {
  const item = useThreadListItem();
  return useThreadRuntime(item.id);
}

export function useWorkflowAssistantRuntime() {
  return useRemoteThreadListRuntime({
    runtimeHook: ThreadRuntimeHook,
    adapter: new InMemoryThreadListAdapter(),
  });
}
