import { tool } from "ai";
import { z } from "zod";

function escapeJsx(s: string): string {
  return s.replace(/[<>{}]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "{": "&#123;", "}": "&#125;" })[c]!);
}

// Authors safe JSX from structured input (never arbitrary model JSX) for <JSXPreview>.
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

export const renderWidgetTool = tool({
  description:
    "Render a small titled bullet-point card in the UI. Use to summarize conclusions visually. Returns JSX.",
  inputSchema: z.object({ title: z.string(), points: z.array(z.string()) }),
  execute: renderWidget,
});
