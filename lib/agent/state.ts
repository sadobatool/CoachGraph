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

/**
 * Shared state for the whole graph. Every node reads from this and returns
 * a *partial* update; LangGraph merges partial updates into the running
 * state using each field's reducer (default reducer is "last write wins"
 * unless otherwise specified below).
 *
 * No checkpointer is attached to the compiled graph (see graph.ts) -- each
 * HTTP request is a fresh run. Conversation memory = the full message list
 * the frontend resends each turn. Profile/plan memory = Supabase, reloaded
 * fresh by the router node on every turn via get_client_profile.
 */
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

  // The visible task plan streamed to AgentPlanTracker. router seeds this;
  // every subsequent node updates its own step's status before returning.
  // Merged (not overwritten) because nutritionAgent and trainingAgent can
  // run in the same superstep and must not clobber each other's progress.
  taskPlan: Annotation<TaskStep[]>({
    reducer: (existing, update) => mergeTaskPlans(existing, update),
    default: () => [],
  }),

  // Fields collected so far during a (possibly multi-turn) intake, merged
  // shallowly so later turns can fill in whatever was still missing.
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

  // Populated by the log_checkin tool -- plain code, not the LLM.
  checkinResult: Annotation<{
    checkin: CheckinRecord;
    signalsDetected: SignalType[];
    needsLlmAdjustment: boolean;
  } | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),

  // Sub-agent outputs.
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

  // Which specialists this turn actually needs to run (set by router /
  // checkin's conditional edges, read by planOrAdjust routing).
  specialistsNeeded: Annotation<("nutrition" | "training")[]>({
    reducer: (_existing, update) => update,
    default: () => [],
  }),

  // Final assistant-facing text for this turn.
  assistantReply: Annotation<string | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = typeof AgentState.Update;
