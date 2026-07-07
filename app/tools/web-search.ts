import { tool } from "ai";
import { z } from "zod";
import Exa from "exa-js";

async function exaSearch({ query, numResults }: { query: string; numResults?: number }) {
  "use step";
  const exa = new Exa(process.env.EXA_API_KEY!);
  const res = await exa.searchAndContents(query, {
    numResults: numResults ?? 5,
    text: { maxCharacters: 600 },
  });
  return res.results.map((r) => ({ title: r.title, url: r.url, text: (r.text ?? "").slice(0, 600) }));
}

export const webSearchTool = tool({
  description: "Search the live web with Exa. Returns title, url, and text snippet.",
  inputSchema: z.object({ query: z.string(), numResults: z.number().optional() }),
  execute: exaSearch,
});
