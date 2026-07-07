"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlusIcon, MessageSquareIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listChats, removeChat, newChatId, onChatsChanged, type ChatMeta } from "@/app/lib/chats";

export function ChatSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [chats, setChats] = useState<ChatMeta[]>([]);

  useEffect(() => onChatsChanged(() => setChats(listChats())), []);
  useEffect(() => setChats(listChats()), [pathname]); // reflect the current chat after nav

  const del = (id: string) => {
    removeChat(id);
    if (pathname === `/c/${id}`) router.push(`/c/${newChatId()}`);
  };

  return (
    <aside className="bg-sidebar flex w-64 flex-none flex-col border-r">
      <div className="p-3">
        <Button className="w-full justify-start gap-2" onClick={() => router.push(`/c/${newChatId()}`)}>
          <PlusIcon className="size-4" />
          New chat
        </Button>
      </div>
      <ScrollArea className="flex-1 px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          {chats.length === 0 && (
            <p className="text-muted-foreground px-2 py-6 text-center text-xs">No chats yet</p>
          )}
          {chats.map((c) => {
            const active = pathname === `/c/${c.id}`;
            return (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md pr-1 text-sm",
                  active ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <Link href={`/c/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
                  <MessageSquareIcon className="size-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{c.title || "New chat"}</span>
                </Link>
                <button
                  type="button"
                  aria-label="Delete chat"
                  onClick={() => del(c.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0 rounded p-1 opacity-0 group-hover:opacity-100"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <div className="border-t p-2">
        <Link
          href="/aui"
          className="text-muted-foreground hover:text-foreground flex items-center justify-between rounded-md px-2 py-1.5 text-xs"
        >
          Compare: assistant-ui
          <span aria-hidden>→</span>
        </Link>
      </div>
    </aside>
  );
}
