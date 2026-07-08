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
      if (toolName === "web_search" && Array.isArray(p.output))
        for (const r of p.output as Array<{ title?: string; url?: string }>)
          if (r?.url) content.push({ type: "source", sourceType: "url", id: r.url, url: r.url, title: r.title });
    }
  }
  return content;
}

function useThreadRuntime(chatId: string) {
  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({ api: "/api/chat" }), []);

  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal }) {
        const chunkStream = await transport.sendMessages({
          trigger: "submit-message",
          chatId,
          messageId: undefined,
          messages: (messages as ThreadMessage[]).map(threadToUIMessage),
          abortSignal,
          metadata: undefined,
          headers: undefined,
          body: { model: MODEL, chatId },
        } as any);
        for await (const uiMessage of readUIMessageStream({ stream: chunkStream })) {
          yield { content: uiPartsToContent(uiMessage) };
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
