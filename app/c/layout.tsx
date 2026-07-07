import { ChatSidebar } from "./sidebar";

// Sidebar persists across /c/<id> navigation; each chat renders in the main column.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh">
      <ChatSidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
