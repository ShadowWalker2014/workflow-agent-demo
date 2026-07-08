import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import Exa from "exa-js";

// SUBAGENT (agent-as-tool): a nested LLM tool-loop with its own context + web search.
// Returns its search queries (`plan`) + cited briefing. The frontend renders this via the
// documented makeAssistantToolUI mechanism (https://www.assistant-ui.com/docs/tools/tool-ui).
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

  // The sub-queries the subagent ran (its "plan"); briefing is its cited answer.
  const plan = result.steps
    .flatMap((s) => s.toolCalls)
    .filter((c) => c.toolName === "search")
    .map((c) => (c.input as { query: string }).query);
  return { topic, plan, briefing: result.text };
}

export const researchTool = tool({
  description: "Delegate a self-contained research task to a subagent (its own context + web search).",
  inputSchema: z.object({ topic: z.string() }),
  execute: research,
});
