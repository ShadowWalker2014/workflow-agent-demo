import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import Exa from "exa-js";

// SUBAGENT (agent-as-tool): a nested LLM tool-loop with its own context + web search.
// Returns the subagent's conversation as `messages` (assistant-ui ThreadMessage shape) so
// the frontend can render it as a nested, read-only thread via MessagePartPrimitive.Messages
// (https://www.assistant-ui.com/docs/tools/multi-agent) — NOT just a flat result card.
async function research({ topic }: { topic: string }) {
  "use step";
  const exa = new Exa(process.env.EXA_API_KEY!);
  const result = await generateText({
    model: "anthropic/claude-sonnet-4.5",
    system:
      "You are a research subagent. Investigate the topic using the search tool and return a tight, cited briefing.",
    prompt: `Research: ${topic}`,
    stopWhen: stepCountIs(4),
    tools: {
      search: tool({
        description: "Search the web.",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }: { query: string }) => {
          const r = await exa.searchAndContents(query, { numResults: 4, text: { maxCharacters: 500 } });
          return r.results.map((x) => ({ title: x.title, url: x.url, text: (x.text ?? "").slice(0, 500) }));
        },
      }),
    },
  });

  // Map each search tool-result back to its call so the nested thread shows complete
  // web_search tool cards (query + results), then the assistant's cited briefing.
  const resultsByCallId = new Map<string, unknown>();
  for (const step of result.steps) {
    for (const tr of step.toolResults ?? []) {
      resultsByCallId.set(tr.toolCallId, (tr as { output?: unknown }).output);
    }
  }
  const searchParts = result.steps
    .flatMap((s) => s.toolCalls)
    .filter((c) => c.toolName === "search")
    .map((c) => ({
      type: "tool-call" as const,
      toolCallId: c.toolCallId,
      toolName: "web_search", // reuse the WebSearchToolUI card in the nested thread
      args: { query: (c.input as { query: string }).query },
      result: resultsByCallId.get(c.toolCallId) ?? [],
    }));

  // assistant-ui ThreadMessage[] — the subagent's own conversation history.
  const messages = [
    { id: "sub-user", role: "user", content: [{ type: "text", text: `Research: ${topic}` }] },
    {
      id: "sub-assistant",
      role: "assistant",
      content: [...searchParts, { type: "text", text: result.text }],
    },
  ];

  return { answer: result.text, messages };
}

export const researchTool = tool({
  description: "Delegate a self-contained research task to a subagent (its own context + web search).",
  inputSchema: z.object({ topic: z.string() }),
  execute: research,
});
