import { tool } from "ai";
import { z } from "zod";

// execute is a "use step" — journaled + retryable, full Node.js access.
async function getTime() {
  "use step";
  return { utc: new Date().toISOString() };
}

export const getTimeTool = tool({
  description: "Get the current UTC time.",
  inputSchema: z.object({}),
  execute: getTime,
});
