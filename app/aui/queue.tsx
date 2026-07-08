"use client";

// Message queueing parity with the AI Elements demo. assistant-ui's default composer
// swaps Send→Cancel while a run is active (no send-while-running), and the native queue
// is thin/undocumented — so we queue with the runtime API: buffer while isRunning, drain
// via thread().append when idle. Send-now / remove per item.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { ArrowUpIcon, XIcon } from "lucide-react";

type QueuedMessage = { id: string; text: string };

type QueueApi = {
  queue: QueuedMessage[];
  enqueue: (text: string) => void;
  remove: (id: string) => void;
  sendNow: (id: string) => void;
};

const QueueContext = createContext<QueueApi | null>(null);
export const useQueue = () => useContext(QueueContext);

export function QueueProvider({ children }: { children: ReactNode }) {
  const api = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);

  const enqueue = (text: string) =>
    setQueue((q) => [...q, { id: crypto.randomUUID(), text }]);
  const remove = (id: string) => setQueue((q) => q.filter((x) => x.id !== id));
  const sendNow = (id: string) =>
    setQueue((q) => {
      const item = q.find((x) => x.id === id);
      return item ? [item, ...q.filter((x) => x.id !== id)] : q;
    });

  // Drain one queued message whenever the thread goes idle.
  useEffect(() => {
    if (isRunning || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    api.thread().append({ role: "user", content: [{ type: "text", text: next.text }] });
  }, [isRunning, queue, api]);

  return (
    <QueueContext.Provider value={{ queue, enqueue, remove, sendNow }}>{children}</QueueContext.Provider>
  );
}

// The running-state composer button: queue the current input instead of sending.
export function ComposerQueueButton() {
  const api = useAui();
  const q = useQueue();
  const text = useAuiState((s) => s.composer.text);
  const disabled = !text.trim();
  return (
    <button
      type="button"
      aria-label="Queue message"
      title="Queue message (sends when the current turn finishes)"
      disabled={disabled}
      onClick={() => {
        if (disabled || !q) return;
        q.enqueue(text);
        api.composer().setText("");
      }}
      className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex size-7 items-center justify-center rounded-full disabled:opacity-40"
    >
      <ArrowUpIcon className="size-4.5" />
    </button>
  );
}

// The queued-messages list (placed above the composer).
export function QueuedMessages() {
  const q = useQueue();
  if (!q || q.queue.length === 0) return null;
  return (
    <div className="mx-auto mb-2 flex w-full max-w-(--thread-max-width) flex-col gap-1 px-4">
      {q.queue.map((item, i) => (
        <div
          key={item.id}
          className="group hover:bg-muted flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
        >
          <span className="text-muted-foreground flex-1 truncate">{item.text}</span>
          <button
            type="button"
            aria-label="Send now"
            title="Send next"
            disabled={i === 0}
            onClick={() => q.sendNow(item.id)}
            className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 disabled:opacity-0"
          >
            <ArrowUpIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Remove"
            onClick={() => q.remove(item.id)}
            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
