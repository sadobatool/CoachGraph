// Domain types shared across the app (DB layer, agent, and frontend).
// TS objects use camelCase; lib/supabase/queries.ts maps to/from the
// snake_case DB columns defined in supabase/migrations/0001_init.sql.

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type PrimaryGoal = "fat_loss" | "muscle_gain" | "maintenance" | "general_fitness";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type SexAtBirth = "male" | "female";
export type OnboardingStatus = "intake_in_progress" | "active";
export type SignalType = "plateau" | "missed_sessions";
export type PlanGeneratedReason = "initial_intake" | "checkin_adjustment" | "manual_regeneration";
export type ExerciseCategory = "push" | "pull" | "legs" | "core" | "full_body" | "cardio" | "mobility";
export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export interface ClientProfile {
  id: string;
  email: string;
  name: string;
  sexAtBirth: SexAtBirth;
  age: number;
  heightCm: number;
  startingWeightKg: number;
  activityLevel: ActivityLevel;
  primaryGoal: PrimaryGoal;
  experienceLevel: ExperienceLevel;
  // null = not yet asked during intake; [] = asked, client explicitly has none.
  equipment: string[] | null;
  injuries: string[] | null;
  dietaryPreferences: string[] | null;
  onboardingStatus: OnboardingStatus;
  createdAt: string;
  updatedAt: string;
}

// All fields optional — this is what accumulates in clients while intake
// is still in progress. save_client_profile upserts whatever subset of
// these is known after each turn.
export type ClientProfileDraft = Partial<Omit<ClientProfile, "id" | "createdAt" | "updatedAt">>;

export interface CheckinRecord {
  id: string;
  clientId: string;
  checkinDate: string;
  weightKg: number;
  sessionsCompleted: number;
  sessionsPlanned: number;
  adherencePct: number | null;
  sorenessLevel: number;
  energyLevel: number | null;
  notes: string | null;
  signalsDetected: SignalType[];
  needsLlmAdjustment: boolean;
  createdAt: string;
}

// What the LLM extracts from a free-text check-in message, before the
// deterministic log_checkin tool computes adherence/signals.
export interface CheckinInput {
  weightKg: number;
  sessionsCompleted: number;
  sessionsPlanned: number;
  sorenessLevel: number;
  energyLevel?: number;
  notes?: string;
}

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  category: ExerciseCategory;
  targetMuscles: string[];
  equipmentNeeded: string[];
  injuryContraindications: string[];
  difficultyLevel: DifficultyLevel;
  defaultSets: number;
  defaultRepsRange: string;
  cues: string | null;
}

export interface NutritionTargets {
  tdee: number;
  targetCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  rationale: string; // short plain-English explanation, written by nutritionAgent
}

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  sets: number;
  reps: string;
  notes?: string;
}

export interface WorkoutDay {
  day: string; // e.g. "Day 1 - Push"
  focus: string; // e.g. "Chest, Shoulders, Triceps"
  exercises: WorkoutExercise[];
}

export interface WorkoutPlanDraft {
  daysPerWeek: number;
  days: WorkoutDay[];
  warnings: string[]; // guardrail notes, e.g. limited leg options due to injury+equipment
  // Plain-English explanation written by trainingAgent's LLM call, mirroring
  // NutritionTargets.rationale. Not set by the deterministic tool itself --
  // trainingAgentNode attaches it after the tool call returns.
  rationale?: string | null;
}

export interface Plan {
  id: string;
  clientId: string;
  version: number;
  status: "active" | "superseded";
  workoutPlan: WorkoutPlanDraft;
  nutritionPlan: NutritionTargets;
  generatedReason: PlanGeneratedReason;
  sourceCheckinId: string | null;
  modelUsed: string | null;
  createdAt: string;
}

// Drives the live AgentPlanTracker UI. This is real LangGraph state, not
// a fake loading animation -- each node flips its own step's status.
export interface TaskStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done" | "skipped";
}

export type AgentFlow = "unknown" | "intake" | "checkin" | "plan_generation" | "adjustment";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// The NDJSON contract between app/api/agent/route.ts and the frontend --
// one of these per graph superstep, terminated by stream close.
export interface AgentStreamEvent {
  flow: AgentFlow;
  taskPlan: TaskStep[];
  assistantReply: string | null;
  clientName: string | null;
  onboardingStatus: OnboardingStatus | null;
  error?: string;
}
