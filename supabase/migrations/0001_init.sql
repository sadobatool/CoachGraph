-- adaptcoach initial schema
-- Tables: clients, checkins, exercise_library, plans
-- See README.md for the full design writeup and tradeoffs.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ============================================================
-- CLIENTS
-- Identified by email (no auth system in scope for this project).
-- Physical stats here are what calculate_nutrition_targets needs
-- to run the Mifflin-St Jeor TDEE formula.
--
-- NOTE: most fields below are nullable even though they're logically
-- "required" -- intake is a multi-turn chat conversation, so a client row
-- can legitimately exist with only a subset of fields filled in while
-- save_client_profile persists progress turn by turn. CHECK constraints
-- still validate any value that IS provided (Postgres CHECK passes on
-- NULL by default). Application code (lib/agent/nodes/intake.ts) is what
-- enforces "all fields present" before onboarding_status flips to 'active'.
-- ============================================================
create table clients (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,
  name                text,

  sex_at_birth        text check (sex_at_birth in ('male', 'female')),
  age                 smallint check (age between 13 and 100),
  height_cm           numeric(5,1) check (height_cm between 100 and 250),
  starting_weight_kg  numeric(5,2) check (starting_weight_kg between 30 and 300),
  activity_level      text check (activity_level in
                        ('sedentary', 'light', 'moderate', 'active', 'very_active')),

  primary_goal        text check (primary_goal in
                        ('fat_loss', 'muscle_gain', 'maintenance', 'general_fitness')),
  experience_level    text check (experience_level in
                        ('beginner', 'intermediate', 'advanced')),
  -- nullable with NO default: NULL means "not yet asked", [] means "asked,
  -- client has none" (e.g. no injuries). A default of '{}' would make those
  -- two states indistinguishable, which breaks intake completeness checks.
  equipment           text[],
  injuries            text[],
  dietary_preferences text[],

  -- orchestrator routing key: has this client finished intake or not?
  onboarding_status   text not null default 'intake_in_progress'
                        check (onboarding_status in ('intake_in_progress', 'active')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_clients_email on clients (email);

-- ============================================================
-- CHECKINS
-- signals_detected / needs_llm_adjustment are written by deterministic
-- code in the log_checkin tool, never by the LLM. The orchestrator
-- checks needs_llm_adjustment before deciding to call the LLM at all.
-- ============================================================
create table checkins (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references clients(id) on delete cascade,

  checkin_date         date not null default current_date,
  weight_kg            numeric(5,2) not null check (weight_kg between 30 and 300),
  sessions_completed   smallint not null check (sessions_completed >= 0),
  sessions_planned     smallint not null check (sessions_planned >= 0),
  adherence_pct        numeric(5,2),
  soreness_level       smallint not null check (soreness_level between 1 and 5),
  energy_level         smallint check (energy_level between 1 and 5),
  notes                text,

  signals_detected     text[] not null default '{}',
  needs_llm_adjustment boolean not null default false,

  created_at           timestamptz not null default now()
);

create index idx_checkins_client_id_date on checkins (client_id, checkin_date desc);

-- ============================================================
-- EXERCISE LIBRARY
-- Standalone lookup table. generate_workout_plan filters this by
-- client equipment (must be subset match) and excludes any exercise
-- whose injury_contraindications overlaps the client's injuries.
-- ============================================================
create table exercise_library (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null unique,
  category                  text not null check (category in
                              ('push', 'pull', 'legs', 'core', 'full_body', 'cardio', 'mobility')),
  target_muscles            text[] not null default '{}',
  equipment_needed          text[] not null default '{}',
  injury_contraindications  text[] not null default '{}',
  difficulty_level          text not null check (difficulty_level in
                              ('beginner', 'intermediate', 'advanced')),
  default_sets              smallint not null default 3,
  default_reps_range        text not null default '8-12',
  cues                      text,

  created_at                timestamptz not null default now()
);

create index idx_exercise_library_equipment on exercise_library using gin (equipment_needed);
create index idx_exercise_library_contraindications on exercise_library using gin (injury_contraindications);

-- ============================================================
-- PLANS
-- Versioned/append-only: every generation or adjustment inserts a new
-- row and marks the previous 'active' row for that client as 'superseded'.
-- This gives a visible history of how the plan evolved over check-ins.
-- ============================================================
create table plans (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  version            int not null,
  status             text not null default 'active' check (status in ('active', 'superseded')),

  workout_plan       jsonb not null,
  nutrition_plan     jsonb not null,

  generated_reason   text not null check (generated_reason in
                        ('initial_intake', 'checkin_adjustment', 'manual_regeneration')),
  source_checkin_id  uuid references checkins(id),
  model_used         text,

  created_at         timestamptz not null default now(),
  unique (client_id, version)
);

create index idx_plans_client_id on plans (client_id, version desc);
