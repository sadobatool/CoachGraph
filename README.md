# CoachGraph

Fitness coaching agent. Intake over chat → deterministic workout + nutrition plan → check-ins that only invoke LLM specialists when code detects a real signal.

Demo: https://coach-graph.vercel.app/

## Problem

Most AI coaches re-plan on every turn. That burns tokens and lets the model invent check-in numbers. CoachGraph separates concerns: LLMs extract and explain; TypeScript owns routing, signal detection, calorie math, and exercise selection.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **LangGraph** outer control plane + **LangChain** `createReactAgent` specialist subagents
- **OpenAI** via `@langchain/openai` (structured extraction + ReAct tool loops)
- **Supabase** (Postgres) for clients, check-ins, append-only plan versions, seeded exercise library
- **Zod** for structured LLM outputs
- **Tailwind CSS** + **shadcn/ui** (Radix primitives)

## How the harness works

LangGraph Deep Agent pattern as a **gated control plane**, not an open-ended agent loop. The outer `StateGraph` owns routing, signal gates, and persistence; domain work is delegated to isolated ReAct subagents that are only reachable when code says so.

```
START → router
          ├─ intake  → intakeComplete? → nutritionAgent ∥ trainingAgent → mergePlan → END
          │                         └─ END (ask next missing field)
          └─ checkin → needsLlmAdjustment?
                          ├─ true  → specialistsNeeded → mergePlan → END
                          └─ false → respondNoSignal → END
```

### Control plane (`lib/agent/graph.ts`)

- Annotated shared state (`AgentState`) with reducers: message concat, task-plan merge across parallel specialists, profile/check-in/plan drafts.
- Conditional edges branch on `flow`, `intakeComplete`, and `checkinResult.needsLlmAdjustment`.
- Specialist fan-out is selective: `specialistsForSignals` maps `plateau → nutrition`, `missed_sessions → training`, so a single signal does not pay for both subagents.
- Stateless compile (`compiledGraph.compile()`): conversation history is rehydrated from the client each turn; durable state lives in Supabase. Compatible with serverless cold starts.

### Intake (`nodes/intake.ts`)

- LLM + Zod schema extracts profile fields; **which field to ask next is decided in TypeScript**, not by the model.
- Profile upserted every turn (`save_client_profile`). When required fields are complete, both specialists are scheduled in parallel.

### Check-in + signal gate (`nodes/checkin.ts`, `tools/logCheckin.ts`)

- LLM extracts weight / sessions / optional subjective fields with nullable Zod fields — nulls are required so the model cannot invent numbers that false-fire detectors.
- Deterministic TypeScript detectors for plateau and missed sessions.
- `needsLlmAdjustment = signalsDetected.length > 0`. No signal → `respondNoSignal` (templated reply, zero specialist tokens).

### Specialist subagents (`subagents.ts`)

Two `createReactAgent` loops with isolated toolsets and prompts:

| Subagent | Tool (required) | Forbidden |
|---|---|---|
| `nutrition-subagent` | `calculate_nutrition_targets` | Estimating calories/macros |
| `training-subagent` | `generate_workout_plan` | Inventing exercises |

Tool outputs become the plan; the LLM only writes the short client-facing rationale.

### Merge / versioning (`nodes/mergePlan.ts`)

- Append-only plan rows in Postgres.
- Partial specialist runs carry forward the untouched half from the previous version.
- Content-equality short-circuit skips a new version when the adjusted plan is identical.

### Streaming UX (`app/api/agent`)

`runAgent` yields `streamMode: "values"` snapshots. The route encodes them as **NDJSON** (`application/x-ndjson`). The chat UI’s checklist is the live `taskPlan` from graph state — not a cosmetic loader.

## What a session looks like

1. New email → intake chat (goal, stats, gear, injuries). Profile saves every turn.
2. Fields complete → both specialists run → starter plan `v1`.
3. Later check-ins: weight + sessions completed/planned.
4. Plateau or bad adherence → only the mapped specialist(s) rewrite. Otherwise: on-track reply, no ReAct loop.

## Setup

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.

2. Copy `.env.example` to `.env.local`:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
OPENAI_API_KEY=
```

3. Then:

```
npm install
npm run dev
```

Open http://localhost:3000 and hit Start coaching.

## Layout

- `app/` — pages + `/api/agent` NDJSON stream
- `components/chat/` — chat UI + plan tracker
- `components/ui/` — shadcn/ui primitives
- `lib/agent/` — graph, nodes, subagents, tools, signal detectors
- `lib/supabase/` — client + queries
- `supabase/` — migration + seed
