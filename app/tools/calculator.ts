import { tool } from "ai";
import { z } from "zod";

// DEFERRED long-tail tool — NOT in the always-on core; the model must load_tool it first.
async function calculator({ expression }: { expression: string }) {
  "use step";
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) throw new Error("Only basic arithmetic is allowed.");
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${expression});`)() as number;
  return { expression, value };
}

export const calculatorTool = tool({
  description: "Evaluate a basic arithmetic expression.",
  inputSchema: z.object({ expression: z.string() }),
  execute: calculator,
});
