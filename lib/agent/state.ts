import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type {
  ClientProfile,
  ClientProfileDraft,
  CheckinRecord,
  NutritionTargets,
  WorkoutPlanDraft,
  TaskStep,
  SignalType,
  AgentFlow,
} from "@/types";
import { mergeTaskPlans } from "./taskPlanSteps";

export type { AgentFlow };

/** Shared graph state. Fresh per request; profile reloaded from Supabase. */
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),

  clientEmail: Annotation<string | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
  clientId: Annotation<string | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
  clientProfile: Annotation<ClientProfile | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),

  flow: Annotation<AgentFlow>({
    reducer: (_existing, update) => update,
    default: () => "unknown",
  }),

  // Merged so parallel specialists don't clobber each other
  taskPlan: Annotation<TaskStep[]>({
    reducer: (existing, update) => mergeTaskPlans(existing, update),
    default: () => [],
  }),

  pendingProfileFields: Annotation<ClientProfileDraft>({
    reducer: (existing, update) => ({ ...existing, ...update }),
    default: () => ({}),
  }),
  intakeComplete: Annotation<boolean>({
    reducer: (_existing, update) => update,
    default: () => false,
  }),
  missingProfileFields: Annotation<string[]>({
    reducer: (_existing, update) => update,
    default: () => [],
  }),

  checkinResult: Annotation<{
    checkin: CheckinRecord;
    signalsDetected: SignalType[];
    needsLlmAdjustment: boolean;
  } | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),

  nutritionTargets: Annotation<NutritionTargets | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
  workoutPlanDraft: Annotation<WorkoutPlanDraft | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
  guardrailWarnings: Annotation<string[]>({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),

  specialistsNeeded: Annotation<("nutrition" | "training")[]>({
    reducer: (_existing, update) => update,
    default: () => [],
  }),

  assistantReply: Annotation<string | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = typeof AgentState.Update;
