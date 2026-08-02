create extension if not exists "pgcrypto";

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
  equipment           text[],
  injuries            text[],
  dietary_preferences text[],

  onboarding_status   text not null default 'intake_in_progress'
                        check (onboarding_status in ('intake_in_progress', 'active')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_clients_email on clients (email);

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
