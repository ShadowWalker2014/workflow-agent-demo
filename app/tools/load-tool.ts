import { tool } from "ai";
import { z } from "zod";

// Pure factory (DI): takes the deferred-tool names so it never imports the registry
// (avoids the registry ↔ load_tool cycle). Recipe 10 / 12.
export function createLoadTool(deferredNames: string[]) {
  const known = new Set(deferredNames);
  return tool({
    description:
      "Load a deferred tool's schema so you can call it on your NEXT step. Only deferred tools listed in the catalog need this.",
    inputSchema: z.object({ names: z.array(z.string()).describe("Deferred tool names to load") }),
    execute: async ({ names }: { names: string[] }) => {
      const unlocked_tools = names.filter((n) => known.has(n));
      const rejected = names.filter((n) => !known.has(n));
      return { unlocked_tools, rejected };
    },
  });
}
