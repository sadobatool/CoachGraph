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
  equipment: string[] | null; // null = unasked; [] = none
  injuries: string[] | null;
  dietaryPreferences: string[] | null;
  onboardingStatus: OnboardingStatus;
  createdAt: string;
  updatedAt: string;
}

/** Partial profile accumulated during intake. */
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

/** Extracted check-in fields before log_checkin computes signals. */
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
  rationale: string;
}

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  sets: number;
  reps: string;
  notes?: string;
}

export interface WorkoutDay {
  day: string;
  focus: string;
  exercises: WorkoutExercise[];
}

export interface WorkoutPlanDraft {
  daysPerWeek: number;
  days: WorkoutDay[];
  warnings: string[];
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

/** NDJSON event from /api/agent per graph superstep. */
export interface AgentStreamEvent {
  flow: AgentFlow;
  taskPlan: TaskStep[];
  assistantReply: string | null;
  clientName: string | null;
  onboardingStatus: OnboardingStatus | null;
  error?: string;
}
