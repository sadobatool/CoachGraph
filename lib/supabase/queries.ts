import { getSupabaseClient } from "./client";
import type {
  ClientProfile,
  ClientProfileDraft,
  CheckinRecord,
  CheckinInput,
  ExerciseLibraryItem,
  Plan,
  PlanGeneratedReason,
  SignalType,
} from "@/types";

// ============================================================
// Row <-> domain type mapping (DB columns are snake_case, domain
// types are camelCase -- see types/index.ts for the full rationale).
// ============================================================

interface ClientRow {
  id: string;
  email: string;
  name: string | null;
  sex_at_birth: string | null;
  age: number | null;
  height_cm: string | number | null;
  starting_weight_kg: string | number | null;
  activity_level: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  equipment: string[] | null;
  injuries: string[] | null;
  dietary_preferences: string[] | null;
  onboarding_status: string;
  created_at: string;
  updated_at: string;
}

function mapClientRow(row: ClientRow): ClientProfile {
  return {
    id: row.id,
    email: row.email,
    // Cast-through-null, same trick used for age/heightCm/etc. below: the
    // domain type says `name: string` (always present once intake is done),
    // but while intake is still in progress the DB value can genuinely be
    // unset. Defaulting to "" here previously broke intake.ts's isMissing()
    // check (empty string is neither undefined nor null), so a client's
    // name was silently never asked for.
    name: row.name ?? (null as unknown as string),
    sexAtBirth: (row.sex_at_birth ?? null) as ClientProfile["sexAtBirth"],
    age: row.age ?? (null as unknown as number),
    heightCm: row.height_cm !== null ? Number(row.height_cm) : (null as unknown as number),
    startingWeightKg: row.starting_weight_kg !== null ? Number(row.starting_weight_kg) : (null as unknown as number),
    activityLevel: (row.activity_level ?? null) as ClientProfile["activityLevel"],
    primaryGoal: (row.primary_goal ?? null) as ClientProfile["primaryGoal"],
    experienceLevel: (row.experience_level ?? null) as ClientProfile["experienceLevel"],
    equipment: row.equipment,
    injuries: row.injuries,
    dietaryPreferences: row.dietary_preferences,
    onboardingStatus: row.onboarding_status as ClientProfile["onboardingStatus"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toClientRowUpdate(draft: ClientProfileDraft): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (draft.name !== undefined) row.name = draft.name;
  if (draft.sexAtBirth !== undefined) row.sex_at_birth = draft.sexAtBirth;
  if (draft.age !== undefined) row.age = draft.age;
  if (draft.heightCm !== undefined) row.height_cm = draft.heightCm;
  if (draft.startingWeightKg !== undefined) row.starting_weight_kg = draft.startingWeightKg;
  if (draft.activityLevel !== undefined) row.activity_level = draft.activityLevel;
  if (draft.primaryGoal !== undefined) row.primary_goal = draft.primaryGoal;
  if (draft.experienceLevel !== undefined) row.experience_level = draft.experienceLevel;
  if (draft.equipment !== undefined) row.equipment = draft.equipment;
  if (draft.injuries !== undefined) row.injuries = draft.injuries;
  if (draft.dietaryPreferences !== undefined) row.dietary_preferences = draft.dietaryPreferences;
  if (draft.onboardingStatus !== undefined) row.onboarding_status = draft.onboardingStatus;
  return row;
}

interface CheckinRow {
  id: string;
  client_id: string;
  checkin_date: string;
  weight_kg: string | number;
  sessions_completed: number;
  sessions_planned: number;
  adherence_pct: string | number | null;
  soreness_level: number;
  energy_level: number | null;
  notes: string | null;
  signals_detected: string[];
  needs_llm_adjustment: boolean;
  created_at: string;
}

function mapCheckinRow(row: CheckinRow): CheckinRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    checkinDate: row.checkin_date,
    weightKg: Number(row.weight_kg),
    sessionsCompleted: row.sessions_completed,
    sessionsPlanned: row.sessions_planned,
    adherencePct: row.adherence_pct !== null ? Number(row.adherence_pct) : null,
    sorenessLevel: row.soreness_level,
    energyLevel: row.energy_level,
    notes: row.notes,
    signalsDetected: (row.signals_detected ?? []) as SignalType[],
    needsLlmAdjustment: row.needs_llm_adjustment,
    createdAt: row.created_at,
  };
}

interface ExerciseRow {
  id: string;
  name: string;
  category: string;
  target_muscles: string[];
  equipment_needed: string[];
  injury_contraindications: string[];
  difficulty_level: string;
  default_sets: number;
  default_reps_range: string;
  cues: string | null;
}

function mapExerciseRow(row: ExerciseRow): ExerciseLibraryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ExerciseLibraryItem["category"],
    targetMuscles: row.target_muscles ?? [],
    equipmentNeeded: row.equipment_needed ?? [],
    injuryContraindications: row.injury_contraindications ?? [],
    difficultyLevel: row.difficulty_level as ExerciseLibraryItem["difficultyLevel"],
    defaultSets: row.default_sets,
    defaultRepsRange: row.default_reps_range,
    cues: row.cues,
  };
}

interface PlanRow {
  id: string;
  client_id: string;
  version: number;
  status: string;
  workout_plan: Plan["workoutPlan"];
  nutrition_plan: Plan["nutritionPlan"];
  generated_reason: string;
  source_checkin_id: string | null;
  model_used: string | null;
  created_at: string;
}

function mapPlanRow(row: PlanRow): Plan {
  return {
    id: row.id,
    clientId: row.client_id,
    version: row.version,
    status: row.status as Plan["status"],
    workoutPlan: row.workout_plan,
    nutritionPlan: row.nutrition_plan,
    generatedReason: row.generated_reason as PlanGeneratedReason,
    sourceCheckinId: row.source_checkin_id,
    modelUsed: row.model_used,
    createdAt: row.created_at,
  };
}

// ============================================================
// Clients
// ============================================================

export async function getClientByEmail(email: string): Promise<ClientProfile | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("clients").select("*").eq("email", email).maybeSingle();

  if (error) throw new Error(`getClientByEmail failed: ${error.message}`);
  return data ? mapClientRow(data as ClientRow) : null;
}

export async function getClientById(clientId: string): Promise<ClientProfile | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();

  if (error) throw new Error(`getClientById failed: ${error.message}`);
  return data ? mapClientRow(data as ClientRow) : null;
}

/**
 * Upserts on email. Only the fields present in `draft` are written, so
 * calling this repeatedly across a multi-turn intake conversation
 * progressively fills in the row without clobbering previously-saved
 * fields (see the migration note on nullable columns).
 */
export async function upsertClientProfile(
  email: string,
  draft: ClientProfileDraft & { onboardingStatus?: ClientProfile["onboardingStatus"] }
): Promise<ClientProfile> {
  const supabase = getSupabaseClient();
  const update = { email, ...toClientRowUpdate(draft), updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from("clients")
    .upsert(update, { onConflict: "email" })
    .select("*")
    .single();

  if (error) throw new Error(`upsertClientProfile failed: ${error.message}`);
  return mapClientRow(data as ClientRow);
}

// ============================================================
// Checkins
// ============================================================

export async function getRecentCheckins(clientId: string, limit = 3): Promise<CheckinRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("checkins")
    .select("*")
    .eq("client_id", clientId)
    .order("checkin_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentCheckins failed: ${error.message}`);
  return (data as CheckinRow[]).map(mapCheckinRow);
}

export async function insertCheckin(
  clientId: string,
  input: CheckinInput,
  computed: { adherencePct: number | null; signalsDetected: SignalType[]; needsLlmAdjustment: boolean }
): Promise<CheckinRecord> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("checkins")
    .insert({
      client_id: clientId,
      weight_kg: input.weightKg,
      sessions_completed: input.sessionsCompleted,
      sessions_planned: input.sessionsPlanned,
      adherence_pct: computed.adherencePct,
      soreness_level: input.sorenessLevel,
      energy_level: input.energyLevel ?? null,
      notes: input.notes ?? null,
      signals_detected: computed.signalsDetected,
      needs_llm_adjustment: computed.needsLlmAdjustment,
    })
    .select("*")
    .single();

  if (error) throw new Error(`insertCheckin failed: ${error.message}`);
  return mapCheckinRow(data as CheckinRow);
}

// ============================================================
// Exercise library
// ============================================================

export async function getAllExercises(): Promise<ExerciseLibraryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("exercise_library").select("*");

  if (error) throw new Error(`getAllExercises failed: ${error.message}`);
  return (data as ExerciseRow[]).map(mapExerciseRow);
}

// ============================================================
// Plans (versioned/append-only)
// ============================================================

export async function getLatestPlan(clientId: string): Promise<Plan | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestPlan failed: ${error.message}`);
  return data ? mapPlanRow(data as PlanRow) : null;
}

/**
 * Marks the client's current 'active' plan as 'superseded', then inserts
 * the new plan as version = previous + 1 and status = 'active'. Not
 * wrapped in a DB transaction (Supabase JS has no multi-statement
 * transaction API) -- acceptable here because plans are additive history,
 * not a source of truth that breaks if briefly inconsistent; a production
 * version would move this into a Postgres function called via rpc().
 */
export async function insertPlanVersion(input: {
  clientId: string;
  workoutPlan: Plan["workoutPlan"];
  nutritionPlan: Plan["nutritionPlan"];
  generatedReason: PlanGeneratedReason;
  sourceCheckinId?: string | null;
  modelUsed?: string | null;
}): Promise<Plan> {
  const supabase = getSupabaseClient();

  const previous = await getLatestPlan(input.clientId);
  if (previous) {
    const { error: supersedeError } = await supabase
      .from("plans")
      .update({ status: "superseded" })
      .eq("id", previous.id);
    if (supersedeError) throw new Error(`insertPlanVersion (supersede) failed: ${supersedeError.message}`);
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({
      client_id: input.clientId,
      version: (previous?.version ?? 0) + 1,
      status: "active",
      workout_plan: input.workoutPlan,
      nutrition_plan: input.nutritionPlan,
      generated_reason: input.generatedReason,
      source_checkin_id: input.sourceCheckinId ?? null,
      model_used: input.modelUsed ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`insertPlanVersion failed: ${error.message}`);
  return mapPlanRow(data as PlanRow);
}
