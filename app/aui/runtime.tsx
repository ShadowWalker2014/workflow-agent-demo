"use client";

// Bridges assistant-ui to the SAME durable WorkflowAgent backend as the AI Elements
// build. We deliberately DON'T use @assistant-ui/react-ai-sdk (it's pinned to the ai@6
// generation; we're on ai@7). Instead we own the ai@7 useChat + WorkflowChatTransport
// and feed it into assistant-ui via useExternalStoreRuntime — so durable resume is kept.

import { useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow";
import {
  useExternalStoreRuntime,
  useRemoteThreadListRuntime,
  InMemoryThreadListAdapter,
  useThreadListItem,
  useThreadListItemRuntime,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import type { UIMessage } from "ai";
import { runKey } from "@/app/lib/chats";

const MODEL = "anthropic/claude-sonnet-4.5";

// ai@7 UIMessage → assistant-ui ThreadMessageLike (text · reasoning · tool calls · files).
// Loose array + cast at the bridge boundary (the strict content union is version-specific).
function toThreadMessage(m: UIMessage): ThreadMessageLike {
  const content: Array<Record<string, unknown>> = [];
  for (const part of m.parts) {
    const p = part as Record<string, unknown> & { type: string };
    if (p.type === "text") content.push({ type: "text", text: String(p.text ?? "") });
    else if (p.type === "reasoning") content.push({ type: "reasoning", text: String(p.text ?? "") });
    else if (p.type === "file") {
      const url = String(p.url ?? "");
      const mime = String(p.mediaType ?? "");
      // Render images as compact <img>; a generic "file" part would dump the base64 data
      // URL as text and make the message enormous.
      if (mime.startsWith("image/")) content.push({ type: "image", image: url });
      else content.push({ type: "file", filename: p.filename, mimeType: mime, data: url });
    }
    else if (p.type.startsWith("tool-") || p.type === "dynamic-tool") {
      const toolName = (p.toolName as string) ?? p.type.replace(/^tool-/, "");
      content.push({
        type: "tool-call",
        toolCallId: String(p.toolCallId ?? ""),
        toolName,
        args: p.input ?? {},
        result: p.output,
      });
      // web_search results → assistant-ui "source" parts (Sources UI).
      if (toolName === "web_search" && Array.isArray(p.output)) {
        for (const r of p.output as Array<{ title?: string; url?: string }>) {
          if (r?.url)
            content.push({ type: "source", sourceType: "url", id: r.url, url: r.url, title: r.title });
        }
      }
    }
  }
  if (content.length === 0) content.push({ type: "text", text: "" });
  return { role: m.role, id: m.id, content } as unknown as ThreadMessageLike;
}

// One assistant-ui thread = one durable session (WorkflowChatTransport, resume kept).
function useThreadRuntime(chatId: string) {
  const transport = useMemo(
    () =>
      new WorkflowChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: (config: { messages: UIMessage[]; body?: Record<string, unknown> }) => ({
          ...config,
          body: { ...config.body, messages: config.messages, chatId },
        }),
        onChatSendMessage: (response: Response) => {
          const runId = response.headers.get("x-workflow-run-id");
          if (runId) localStorage.setItem(runKey(chatId), runId);
        },
        onChatEnd: () => localStorage.removeItem(runKey(chatId)),
        prepareReconnectToStreamRequest: (config: Record<string, unknown>) => {
          const runId = typeof window !== "undefined" ? localStorage.getItem(runKey(chatId)) : null;
          if (!runId) throw new Error("No active workflow run to resume");
          return { ...config, api: `/api/chat/${encodeURIComponent(runId)}/stream` };
        },
      }),
    [chatId],
  );

  const activeRun = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem(runKey(chatId)) : null),
    [chatId],
  );

  const chat = useChat<UIMessage>({ id: chatId, transport, resume: Boolean(activeRun) });

  // Auto-name the thread from its first user message so the sidebar isn't all "New Chat".
  // The thread list item may not be initialized on the first render where the user message
  // appears, so guard the rename — the effect re-runs on the next message update (e.g. the
  // assistant's reply) by which point the thread exists.
  const item = useThreadListItem();
  const itemRuntime = useThreadListItemRuntime();
  useEffect(() => {
    if (item.title) return;
    const firstUser = chat.messages.find((m) => m.role === "user");
    if (!firstUser) return;
    const title = firstUser.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join(" ")
      .trim()
      .slice(0, 60);
    if (!title) return;
    try {
      itemRuntime.rename(title);
    } catch {
      // thread not initialized yet — will retry on the next message update
    }
  }, [chat.messages, item.title, itemRuntime]);

  return useExternalStoreRuntime({
    isRunning: chat.status === "streaming" || chat.status === "submitted",
    messages: chat.messages,
    convertMessage: toThreadMessage,
    onNew: async (msg: AppendMessage) => {
      let text = msg.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");
      const files: Array<Record<string, unknown>> = [];
      for (const a of msg.attachments ?? []) {
        for (const c of (a.content ?? []) as Array<Record<string, unknown> & { type: string }>) {
          if (c.type === "image")
            files.push({ type: "file", url: String(c.image ?? ""), mediaType: "image/png", filename: a.name });
          else if (c.type === "file")
            files.push({
              type: "file",
              url: String(c.data ?? ""),
              mediaType: (c.mimeType as string) ?? "application/octet-stream",
              filename: a.name,
            });
          // Text/code files: the text adapter inlines their content — fold it into the
          // message so the model actually receives it (otherwise it "sees no file").
          else if (c.type === "text")
            text += `\n\n--- Attached file: ${a.name} ---\n${String(c.text ?? "")}`;
        }
      }
      await chat.sendMessage(
        { text, ...(files.length ? { files: files as never } : {}) },
        { body: { model: MODEL } },
      );
    },
    onCancel: async () => {
      chat.stop();
    },
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

// Multi-thread runtime (sidebar). InMemory list = session-scoped; swap for a localStorage
// RemoteThreadListAdapter for full cross-refresh parity with the AI Elements build.
export function useWorkflowAssistantRuntime() {
  return useRemoteThreadListRuntime({
    runtimeHook: ThreadRuntimeHook,
    adapter: new InMemoryThreadListAdapter(),
  });
}
