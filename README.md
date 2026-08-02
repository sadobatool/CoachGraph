# CoachGraph

Fitness coaching agent. You chat through intake, get a workout + nutrition plan, then check in over time. The plan only changes when the numbers say so.

Demo: https://coach-graph.vercel.app/

## Problem

AI coaches tend to rewrite your whole plan every time you talk to them. That gets expensive fast, and worse — the model will invent check-in numbers if you let it.

I wanted something tighter: take intake over chat, build a real plan from real math / a real exercise library, then gate any LLM adjustment behind code that detects plateau or missed sessions. No signal → no specialist call.

## How the harness works

It's a LangGraph Deep Agent-style setup, but not a free-roaming `createDeepAgent()` loop. Fitness needs hard gates. So:

- Outer graph owns routing, signal checks, and merge/persist
- Nutrition and training are separate ReAct subagents with their own tools
- Those subagents only get invoked when intake finishes or `logCheckin` sets `needsLlmAdjustment`

Flow looks like this:

```
router
  ├─ intake  → (complete?) nutrition + training subagents → mergePlan
  └─ checkin → signal? → relevant specialist(s) → mergePlan
             → no signal? → short templated reply, done
```

Router loads the client from Supabase and picks intake vs check-in from `onboarding_status`. Intake uses gpt-4o-mini + Zod for extraction; what to ask next is decided in code (early on the model would claim it had everything and stall). Check-in extracts weight/sessions, then plain TypeScript computes adherence and plateau.

Nutrition tool is Mifflin-St Jeor. Workout tool filters the seeded exercise library by equipment and injuries. Merge writes an append-only plan version — if only one specialist ran (e.g. missed sessions → training only), the other half carries over from the previous plan.

`/api/agent` streams NDJSON snapshots of graph state, so the checklist in the UI is the real task plan, not a fake loader. No checkpointer. History comes back from the browser each turn; profile/check-ins/plans live in Supabase. Works fine on Vercel cold starts.

Stack: Next.js, LangGraph, OpenAI (mini for extract, gpt-4o inside specialists), Supabase, Tailwind.

## What a session looks like

1. New email → intake chat (goal, stats, gear, injuries). Profile saves every turn.
2. When fields are full, both specialists run and you get a starter plan.
3. Later check-ins: weight + sessions completed/planned.
4. Plateau or bad adherence → only the needed specialist rewrites. Otherwise you just get an "on track" reply.

## Time / next

Took about a weekend. Schema and tools first, then the outer graph, then subagents, then the chat UI.

Next if I had more time: real auth, a proper plan page (not only chat text), better check-in UX, more signals (sleep/stress/deload), tighter tests on the detectors, and RLS instead of service-role-only on the server.

## Setup

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.

2. Copy `.env.example` to `.env.local`:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

3. Then:

```
npm install
npm run dev
```

Open http://localhost:3000 and hit Start coaching.

## Layout

- `app/` — pages + `/api/agent`
- `components/chat/` — chat UI + plan tracker
- `lib/agent/` — graph, nodes, subagents, tools
- `lib/supabase/` — client + queries
- `supabase/` — migration + seed
