# Workflow Agent Demo

A **durable AI chat agent** built on the Vercel stack, with a full [AI Elements](https://elements.ai-sdk.dev) UI:

- **[Vercel Workflow DevKit](https://workflow.vercel.sh)** — the agent runs as a durable, resumable workflow (`"use workflow"` / `"use step"`).
- **[AI SDK](https://ai-sdk.dev) v7** + **[Vercel AI Gateway](https://vercel.com/docs/ai-gateway)** — one API for every model (`anthropic/*`, `openai/*`).
- **[AI Elements](https://elements.ai-sdk.dev)** — the entire chat UI: conversation, streamed markdown, tool cards, reasoning, sources, plan, task, confirmation, context meter, model selector, attachments, and more.
- **[Exa](https://exa.ai)** — live web search + a research subagent.

## Features

- **Extended thinking** — Claude reasoning streamed into the `Reasoning` ("Thinking") block.
- **Live web search + inline citations** — `web_search` results become inline citation pills in the prose (`InlineCitation`) plus an end-of-message `Sources` list.
- **Research subagent** — an agent-as-tool that runs its own search loop, surfaced in a `Plan` card.
- **Human-in-the-loop** — a client-side confirmation tool gates sensitive actions via the `Confirmation` component.
- **Deferred tools** — a lean tool core + `load_tool` to unlock the long tail on demand.
- **Token usage meter** — per-turn usage surfaced to the `Context` component.

## Two UIs, one backend (comparison POC)

The same durable WorkflowAgent backend powers two front-ends so you can compare frameworks:

- **`/c/<id>`** — built with **[Vercel AI Elements](https://elements.ai-sdk.dev)** (18 components; multi-chat, resume, thinking, citations, HITL, queue…).
- **`/aui`** — built with **[assistant-ui](https://www.assistant-ui.com)** (`Thread` + `ThreadList` + `Composer` + `Attachments`).

Both talk to the *same* `/api/chat` durable run. assistant-ui's own AI-SDK adapter (`@assistant-ui/react-ai-sdk`) is
pinned to the `ai@6` generation and we're on `ai@7`, so we skip it and bridge our `ai@7` `useChat` +
`WorkflowChatTransport` into assistant-ui via `useExternalStoreRuntime` — keeping durable resume. (The assistant-ui
thread list is in-memory for now; the AI Elements build has full localStorage persistence.)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

### Environment variables

See [`.env.example`](./.env.example):

| Var | Required | Notes |
|---|---|---|
| `AI_GATEWAY_API_KEY` | dev | Vercel AI Gateway key. On Vercel, OIDC is used automatically. |
| `EXA_API_KEY` | yes | Powers `web_search` / `research`. Get one at [exa.ai](https://exa.ai). |

## Architecture

```
app/
  page.tsx              # the AI Elements client (useChat)
  api/chat/route.ts     # starts the durable run; merged transform (data-* + token usage)
  workflows/chat.ts     # the WorkflowAgent ("use workflow") — model, thinking, tool loop
  lib/tools.ts          # tools: get_time, web_search, research, schedule_reminder,
                        #        render_widget, ask_for_confirmation (client/HITL), calculator (deferred)
components/ai-elements/  # AI Elements components (shadcn/ui based)
```

The `/api/chat` route swaps the stock `createModelCallToUIChunkTransform()` for a **merged transform** that reuses
`toUIMessageChunk` but also passes `data-*` parts through and emits a `message-metadata` chunk carrying token usage —
the stock transform drops both.

## Durable & resumable sessions

The whole point of a Workflow agent: **the run keeps executing server-side even if the browser disconnects.** This demo
wires that up (recipe 03):

- `POST /api/chat` starts a durable run and returns `x-workflow-run-id`.
- The client uses **`WorkflowChatTransport`** + `useChat({ resume })`; it persists the run id (and the transcript) to
  `localStorage`.
- On refresh, `GET /api/chat/[runId]/stream` re-attaches to the same run via `getRun(runId).getReadable()` and replays it —
  the in-flight agent turn continues instead of restarting.

**Multi-chat:** every conversation lives at its own route **`/c/<id>`** with its own persisted transcript and durable run
id, so you can run several in parallel, switch between them in the sidebar, and start fresh ones — each refreshes/resumes
independently. `/` opens your most recent chat (or a new one). The header's **Open in…** menu (`open-in-chat`) re-opens the
last query in ChatGPT / Claude / v0.

**Try it:** send a message that triggers a long turn (e.g. *"Research the Workflow DevKit…"*), then **refresh the browser
mid-generation** — the answer keeps streaming in. Open a second chat in another tab; both resume on their own.

**Do you need a database?** For local testing, **no** — the Workflow **Local World** persists runs/stream chunks to
`.workflow-data/` on disk, so refresh-while-`next dev`-is-running resumes out of the box. On **Vercel**, the durable store
is fully managed (nothing to provision). You only need a Postgres world (`@workflow/world-postgres`) if you want a turn that
was mid-generation to auto-resume across a **server restart** locally — see recipe 06 of the `vercel-workflow-agents` skill.

## Deploy

Deploys to **Vercel** as-is (`next build` passes). Set `EXA_API_KEY` (and `AI_GATEWAY_API_KEY` or rely on OIDC) in the
project's Environment Variables. The Workflow durable runtime is managed by Vercel — nothing to provision.

> The generated AI Elements components ship some upstream type-skew, so `next.config.ts` sets
> `typescript.ignoreBuildErrors` (the app's own code typechecks clean under `strict`).

## License

MIT
