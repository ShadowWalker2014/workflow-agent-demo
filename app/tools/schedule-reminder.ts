import { tool } from "ai";
import { z } from "zod";

async function scheduleReminder({ when, text }: { when: string; text: string }) {
  "use step";
  return { scheduled: true, when, text, id: "rem_" + Date.now().toString(36) };
}

export const scheduleReminderTool = tool({
  description:
    "Schedule a reminder. Call ask_for_confirmation FIRST and only proceed if the user approves.",
  inputSchema: z.object({ when: z.string(), text: z.string() }),
  execute: scheduleReminder,
});
