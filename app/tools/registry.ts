import { getTimeTool } from "./get-time";
import { webSearchTool } from "./web-search";
import { researchTool } from "./research";
import { scheduleReminderTool } from "./schedule-reminder";
import { renderWidgetTool } from "./render-widget";
import { askForConfirmationTool } from "./ask-for-confirmation";
import { calculatorTool } from "./calculator";
import { createLoadTool } from "./load-tool";

// Deferred tools: registered but not active until load_tool unlocks them (recipe 10).
const DEFERRED = { calculator: calculatorTool } as const;

// Catalog is DERIVED from each deferred tool's own `.description` — no separate metadata file.
export const DEFERRED_CATALOG: Record<string, string> = Object.fromEntries(
  Object.entries(DEFERRED).map(([name, t]) => [name, (t as { description?: string }).description ?? ""]),
);

// Assemble the ToolSet. load_tool is built here (factory) with the deferred names.
export function buildTools() {
  return {
    // always-on core
    get_time: getTimeTool,
    web_search: webSearchTool,
    research: researchTool,
    schedule_reminder: scheduleReminderTool,
    render_widget: renderWidgetTool,
    ask_for_confirmation: askForConfirmationTool,
    load_tool: createLoadTool(Object.keys(DEFERRED)),
    // deferred (registered but inactive until load_tool unlocks them)
    ...DEFERRED,
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
