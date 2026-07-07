import { tool } from "ai";
import { z } from "zod";

// CLIENT tool (no execute): the agent stops on this call and the browser renders a
// Confirmation prompt; the user's answer is fed back on the next turn (HITL).
export const askForConfirmationTool = tool({
  description:
    "Ask the human to approve a sensitive action before doing it. Provide a clear one-line message.",
  inputSchema: z.object({ message: z.string() }),
});
