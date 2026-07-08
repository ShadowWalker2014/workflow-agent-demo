import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import Exa from "exa-js";

// SUBAGENT (agent-as-tool): a nested LLM tool-loop with its own context + web search.
// Returns its conversation pieces (each web search + the cited briefing) so the frontend can
// render a nested read-only thread via ReadonlyThreadProvider + ThreadPrimitive.Messages
// (https://www.assistant-ui.com/docs/tools/multi-agent).
async function research({ topic }: { topic: string }) {
  "use step";
  const exa = new Exa(process.env.EXA_API_KEY!);
  const result = await generateText({
    model: "anthropic/claude-sonnet-4.5",
    system:
      "You are a research subagent. Run 2-4 focused web searches (never more), then STOP searching and write a tight, cited briefing. Cite inline with numbered markdown links to the exact source URLs. Your final message MUST be the briefing text — do not end on a tool call.",
    prompt: `Research: ${topic}`,
    // 5 steps leaves room for a final synthesis turn after the searches, so the subagent's
    // own briefing lands in its conversation (rendered inside the nested Researcher card).
    stopWhen: stepCountIs(5),
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

  // Each web search the subagent ran (query + results), paired via toolCallId, so the UI can
  // rebuild the subagent's conversation as ThreadMessages.
  const searches = result.steps.flatMap((step) =>
    (step.toolCalls ?? [])
      .filter((c) => c.toolName === "search")
      .map((c) => ({
        toolCallId: c.toolCallId,
        query: (c.input as { query: string }).query,
        results: (step.toolResults ?? []).find((r) => r.toolCallId === c.toolCallId)?.output ?? [],
      })),
  );
  return { topic, searches, briefing: result.text };
}

export const researchTool = tool({
  description: "Delegate a self-contained research task to a subagent (its own context + web search).",
  inputSchema: z.object({ topic: z.string() }),
  execute: research,
});
