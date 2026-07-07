"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { listChats, newChatId } from "@/app/lib/chats";

// Landing → open the most recent chat, or start a fresh one at /c/<id>.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const recent = listChats()[0]?.id;
    router.replace(`/c/${recent ?? newChatId()}`);
  }, [router]);
  return null;
}
