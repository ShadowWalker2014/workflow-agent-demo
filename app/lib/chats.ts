// Client-side multi-chat index (localStorage). Each chat = a route /c/<id> with its
// own persisted transcript + durable run id, so every conversation refreshes/resumes
// independently. Replace with a DB (Neon/Upstash) for cross-device history.

export type ChatMeta = { id: string; title: string; updatedAt: number };

const INDEX_KEY = "wdk-chats";
export const msgsKey = (id: string) => `wdk-msgs:${id}`;
export const runKey = (id: string) => `wdk-run:${id}`; // per-chat durable run id
const CHANGED = "wdk-chats-changed";

export function newChatId(): string {
  return `chat-${crypto.randomUUID()}`;
}

export function listChats(): ChatMeta[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]") as ChatMeta[];
  } catch {
    return [];
  }
}

export function upsertChat(meta: ChatMeta) {
  if (typeof window === "undefined") return;
  const rest = listChats().filter((c) => c.id !== meta.id);
  const next = [meta, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  localStorage.setItem(INDEX_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGED));
}

export function removeChat(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INDEX_KEY, JSON.stringify(listChats().filter((c) => c.id !== id)));
  localStorage.removeItem(msgsKey(id));
  localStorage.removeItem(runKey(id));
  window.dispatchEvent(new Event(CHANGED));
}

// Sidebar subscribes to this to re-render on index changes (this tab + other tabs).
export function onChatsChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}
