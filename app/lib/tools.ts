import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import Exa from "exa-js";

// ─────────────────────────────────────────────────────────────────────────────
// Each server tool's execute is a "use step" — full Node.js access, journaled +
// retryable. `ask_for_confirmation` is a CLIENT tool (no execute): the agent
// stops on the tool call and the browser resolves it (HITL) via addToolOutput.
// ─────────────────────────────────────────────────────────────────────────────

async function getTime() {
  "use step";
  return { utc: new Date().toISOString() };
}

async function exaSearch({ query, numResults }: { query: string; numResults?: number }) {
  "use step";
  const exa = new Exa(process.env.EXA_API_KEY!);
  const res = await exa.searchAndContents(query, {
    numResults: numResults ?? 5,
    text: { maxCharacters: 600 },
  });
  return res.results.map((r) => ({ title: r.title, url: r.url, text: (r.text ?? "").slice(0, 600) }));
}

// SUBAGENT (agent-as-tool): a nested LLM tool-loop with its own context + web_search.
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
  // steps/plan feed the <Plan> card; briefing is the cited answer.
  const plan = result.steps
    .flatMap((s) => s.toolCalls)
    .filter((c) => c.toolName === "search")
    .map((c) => (c.input as { query: string }).query);
  return { topic, plan, briefing: result.text };
}

async function scheduleReminder({ when, text }: { when: string; text: string }) {
  "use step";
  return { scheduled: true, when, text, id: "rem_" + Date.now().toString(36) };
}

// Builds a small JSX card string for the <JSXPreview> component to render live.
// The tool authors safe JSX from structured input (no arbitrary model JSX).
async function renderWidget({ title, points }: { title: string; points: string[] }) {
  "use step";
  const items = points
    .map((p) => `    <li className="text-sm text-muted-foreground">${escapeJsx(p)}</li>`)
    .join("\n");
  const jsx = `<div className="rounded-lg border p-4">
  <h3 className="mb-2 font-semibold">${escapeJsx(title)}</h3>
  <ul className="list-disc space-y-1 pl-5">
${items}
  </ul>
</div>`;
  return { title, jsx };
}

function escapeJsx(s: string): string {
  return s.replace(/[<>{}]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "{": "&#123;", "}": "&#125;" })[c]!);
}

// DEFERRED long-tail tool — NOT in the always-on core; the model must load_tool it first.
async function calculator({ expression }: { expression: string }) {
  "use step";
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) throw new Error("Only basic arithmetic is allowed.");
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${expression});`)() as number;
  return { expression, value };
}

// ── The deferred catalog (name → one-line) rendered into the system prompt. ──
export const DEFERRED_CATALOG: Record<string, string> = {
  calculator: "Evaluate a basic arithmetic expression.",
};

export function buildTools(loadTool: ReturnType<typeof tool>) {
  return {
    // always-on core
    get_time: tool({ description: "Get the current UTC time.", inputSchema: z.object({}), execute: getTime }),
    web_search: tool({
      description: "Search the live web with Exa. Returns title, url, and text snippet.",
      inputSchema: z.object({ query: z.string(), numResults: z.number().optional() }),
      execute: exaSearch,
    }),
    research: tool({
      description: "Delegate a self-contained research task to a subagent (its own context + web search).",
      inputSchema: z.object({ topic: z.string() }),
      execute: research,
    }),
    schedule_reminder: tool({
      description:
        "Schedule a reminder. Call ask_for_confirmation FIRST and only proceed if the user approves.",
      inputSchema: z.object({ when: z.string(), text: z.string() }),
      execute: scheduleReminder,
    }),
    render_widget: tool({
      description:
        "Render a small titled bullet-point card in the UI. Use to summarize conclusions visually. Returns JSX.",
      inputSchema: z.object({ title: z.string(), points: z.array(z.string()) }),
      execute: renderWidget,
    }),
    // CLIENT tool (no execute): the agent stops on this call and the browser
    // renders a Confirmation prompt; the user's answer is fed back on the next turn.
    ask_for_confirmation: tool({
      description:
        "Ask the human to approve a sensitive action before doing it. Provide a clear one-line message.",
      inputSchema: z.object({ message: z.string() }),
    }),
    load_tool: loadTool,
    // deferred (registered but not active until load_tool unlocks them)
    calculator: tool({
      description: "Evaluate a basic arithmetic expression.",
      inputSchema: z.object({ expression: z.string() }),
      execute: calculator,
    }),
  };
}

export const CORE_TOOLS = [
  "get_time",
  "web_search",
  "research",
  "schedule_reminder",
  "render_widget",
  "ask_for_confirmation",
  "load_tool",
] as const;
