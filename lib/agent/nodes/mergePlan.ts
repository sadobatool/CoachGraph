import { insertPlanVersion, getLatestPlan } from "@/lib/supabase/queries";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { withStepStatus } from "../taskPlanSteps";
import { plansHaveSameContent } from "../planSummary";
import { formatPlanReadyReply, formatPlanUnchangedReply } from "../replies";
import type { NutritionTargets, WorkoutPlanDraft } from "@/types";

/**
 * Assembles and persists the final plan. Handles the partial-adjustment
 * case explicitly: a check-in adjustment might only have run ONE
 * specialist (e.g. missed_sessions only touches training), so whichever
 * half didn't get recalculated this turn is carried over from the
 * client's current active plan rather than left null.
 *
 * Carried-over halves intentionally drop the previous specialist's
 * rationale text -- otherwise a plateau-only re-run would keep showing
 * last week's "fix your workout frequency" note even though training
 * didn't run this turn.
 */
export async function mergePlanNode(state: AgentStateType): Promise<AgentStateUpdate> {
  if (!state.clientId) {
    return { taskPlan: withStepStatus(state.taskPlan, "save-plan", "skipped") };
  }

  const previousPlan = await getLatestPlan(state.clientId);
  const nutritionRan = state.nutritionTargets !== null && state.nutritionTargets !== undefined;
  const trainingRan = state.workoutPlanDraft !== null && state.workoutPlanDraft !== undefined;

  const nutritionPlan: NutritionTargets | null = state.nutritionTargets
    ? state.nutritionTargets
    : previousPlan?.nutritionPlan
      ? { ...previousPlan.nutritionPlan }
      : null;

  const workoutPlan: WorkoutPlanDraft | null = state.workoutPlanDraft
    ? state.workoutPlanDraft
    : previousPlan?.workoutPlan
      ? { ...previousPlan.workoutPlan, rationale: null }
      : null;

  if (!nutritionPlan || !workoutPlan) {
    return {
      taskPlan: withStepStatus(state.taskPlan, "save-plan", "skipped"),
      assistantReply: "Something went wrong while building your plan. Please try again in a moment.",
    };
  }

  if (
    previousPlan &&
    state.checkinResult &&
    plansHaveSameContent({ nutritionPlan, workoutPlan }, previousPlan)
  ) {
    return {
      taskPlan: withStepStatus(state.taskPlan, "save-plan", "skipped"),
      assistantReply: formatPlanUnchangedReply(
        {
          ...previousPlan,
          nutritionPlan,
          workoutPlan: { ...workoutPlan, rationale: null },
        },
        state.checkinResult.signalsDetected,
        state.checkinResult.checkin
      ),
    };
  }

  const generatedReason = state.checkinResult ? "checkin_adjustment" : "initial_intake";

  const plan = await insertPlanVersion({
    clientId: state.clientId,
    workoutPlan,
    nutritionPlan,
    generatedReason,
    sourceCheckinId: state.checkinResult?.checkin.id ?? null,
    modelUsed: "gpt-4o",
  });

  const displayPlan = {
    ...plan,
    nutritionPlan: {
      ...plan.nutritionPlan,
      rationale: nutritionRan ? plan.nutritionPlan.rationale : "",
    },
    workoutPlan: {
      ...plan.workoutPlan,
      rationale: trainingRan ? plan.workoutPlan.rationale : null,
    },
  };

  const changedParts =
    nutritionRan && trainingRan
      ? "nutrition targets and workout plan"
      : nutritionRan
        ? "nutrition targets"
        : trainingRan
          ? "workout plan"
          : undefined;

  return {
    taskPlan: withStepStatus(state.taskPlan, "save-plan", "done"),
    assistantReply: formatPlanReadyReply(displayPlan, {
      isAdjustment: Boolean(state.checkinResult),
      warnings: trainingRan ? state.guardrailWarnings : [],
      changedParts,
      signals: state.checkinResult?.signalsDetected ?? [],
      checkin: state.checkinResult?.checkin ?? null,
    }),
  };
}
