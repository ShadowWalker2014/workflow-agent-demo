"use client";

// Interactable (https://www.assistant-ui.com/docs/tools/interactables): a component both
// the user and the model can edit. assistant-ui auto-generates an `update_note` tool; our
// runtime forwards it to the backend (see runtime.tsx → clientTools), so the model can call
// it and assistant-ui applies the streamed patch. Try: "write a haiku about Vercel in my note".

import { unstable_useInteractable } from "@assistant-ui/react";
import { z } from "zod";

const noteSchema = z.object({ title: z.string(), content: z.string() });

export function StickyNote() {
  const [state, { setState }] = unstable_useInteractable("note", {
    description: "A shared sticky note. Use update_note to set its title/content for the user.",
    stateSchema: noteSchema,
    initialState: { title: "Untitled", content: "" },
  });

  return (
    <div className="bg-card rounded-lg border p-3 shadow-sm">
      <div className="text-muted-foreground mb-1 text-xs font-medium">
        Shared note · you + the assistant can edit
      </div>
      <input
        className="mb-1 w-full bg-transparent text-sm font-semibold outline-none"
        value={state.title}
        onChange={(e) => setState((p) => ({ ...p, title: e.target.value }))}
        placeholder="Title"
      />
      <textarea
        className="text-muted-foreground min-h-16 w-full resize-none bg-transparent text-sm outline-none"
        value={state.content}
        onChange={(e) => setState((p) => ({ ...p, content: e.target.value }))}
        placeholder="Ask the assistant to fill this in…"
      />
    </div>
  );
}
