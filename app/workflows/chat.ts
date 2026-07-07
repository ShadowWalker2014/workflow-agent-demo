import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { getWritable } from "workflow";
import { stepCountIs, type ModelMessage } from "ai";
import { buildTools, CORE_TOOLS, DEFERRED_CATALOG } from "@/app/tools/registry";

// High extended-thinking budget for Claude (interleaved with tool use). Kept
// under both models' output ceilings so it never 400s (Opus 4.1 caps at 32k out).
const THINKING_BUDGET_HIGH = 16_000;
const MAX_OUTPUT_TOKENS = 32_000;

export async function chatWorkflow(messages: ModelMessage[], model?: string) {
  "use workflow";

  const selectedModel = model || "anthropic/claude-sonnet-4.5";
  const isAnthropic = selectedModel.startsWith("anthropic/");

  const writable = getWritable<ModelCallStreamPart>();

  const tools = buildTools();

  const catalog = Object.entries(DEFERRED_CATALOG)
    .map(([n, d]) => `  - ${n}: ${d}`)
    .join("\n");

  const agent = new WorkflowAgent({
    model: selectedModel, // routed via Vercel AI Gateway
    instructions: [
      "You are a helpful assistant with a durable tool loop.",
      "Think step by step before acting; your reasoning is shown to the user.",
      "Use web_search (Exa) for anything time-sensitive.",
      "Cite INLINE: immediately after a claim taken from a search result, add a markdown link whose text is a number and whose href is the EXACT source URL — e.g. `Vercel shipped v0 [1](https://vercel.com/blog/v0).` Do NOT add a separate 'Sources:' list; the UI renders sources on its own.",
      "Delegate deep multi-source research to the `research` subagent.",
      "Before any sensitive or irreversible action (e.g. schedule_reminder), call ask_for_confirmation first and only proceed if approved.",
      "When a short visual summary helps, call render_widget with a title and bullet points.",
      "",
      "Some tools are DEFERRED — call load_tool({ names: [...] }) to load them, then call them on your NEXT step:",
      catalog,
    ].join("\n"),
    tools,
  });

  await agent.stream({
    messages,
    writable,
    stopWhen: stepCountIs(12),

    // Recipe 10 — expose core + whatever load_tool has unlocked. Derive "unlocked"
    // from the JOURNALED messages (replay-safe), NOT a mutable closure (which is lost
    // across durable step boundaries on replay). Enable high extended-thinking per
    // step on the REAL model (never on a shared call-level base) so it can't leak
    // onto a model that 400s on it.
    prepareStep: async ({ messages: stepMessages }: { messages: ModelMessage[] }) => ({
      activeTools: [...CORE_TOOLS, ...unlockedFrom(stepMessages)],
      ...(isAnthropic
        ? {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            providerOptions: {
              anthropic: { thinking: { type: "enabled", budgetTokens: THINKING_BUDGET_HIGH } },
            },
          }
        : {}),
    }),
  });
}

// Scan the conversation so far for load_tool results and collect the unlocked names.
function unlockedFrom(messages: ModelMessage[]): string[] {
  const set = new Set<string>();
  for (const m of messages ?? []) {
    if (m.role !== "tool" || !Array.isArray(m.content)) continue;
    for (const part of m.content as Array<Record<string, unknown>>) {
      if (part?.type !== "tool-result" || part?.toolName !== "load_tool") continue;
      const output = part.output as { type?: string; value?: unknown } | undefined;
      const value = (output?.type === "json" ? output.value : output) as { unlocked_tools?: string[] } | undefined;
      for (const n of value?.unlocked_tools ?? []) set.add(n);
    }
  }
  return [...set];
}
