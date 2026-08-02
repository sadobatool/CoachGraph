import { getRecentCheckins } from "@/lib/supabase/queries";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { withStepStatus } from "../taskPlanSteps";
import { runNutritionSubagent } from "../subagents";
import type { SignalType } from "@/types";

// Plateau: -10% first hit, then -5% each consecutive, capped at -25%
const PLATEAU_BASE_ADJUSTMENT = -0.1;
const PLATEAU_STACK_STEP = -0.05;
const PLATEAU_MAX_ADJUSTMENT = -0.25;

function countConsecutivePlateauStreak(recentSignalsNewestFirst: SignalType[][]): number {
  let streak = 0;
  for (const signals of recentSignalsNewestFirst) {
    if (signals.includes("plateau")) streak += 1;
    else break;
  }
  return streak;
}

function plateauAdjustmentPct(streak: number, primaryGoal: string): number {
  if (streak <= 0) return 0;
  const direction = primaryGoal === "muscle_gain" ? 1 : -1;
  const magnitude = Math.min(
    Math.abs(PLATEAU_BASE_ADJUSTMENT) + Math.max(0, streak - 1) * Math.abs(PLATEAU_STACK_STEP),
    Math.abs(PLATEAU_MAX_ADJUSTMENT)
  );
  return direction * magnitude;
}

/** Plateau math here; subagent handles tool call + explanation. */
export async function nutritionAgentNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const profile = state.clientProfile;
  if (!profile) {
    return { taskPlan: withStepStatus(state.taskPlan, "calc-nutrition", "skipped") };
  }

  const isAdjustment = Boolean(state.checkinResult?.needsLlmAdjustment);
  const currentWeightKg = state.checkinResult?.checkin.weightKg ?? profile.startingWeightKg;
  const plateauDetected = state.checkinResult?.signalsDetected.includes("plateau") ?? false;

  const recent = state.clientId ? await getRecentCheckins(state.clientId, 5) : [];
  const streak = plateauDetected
    ? countConsecutivePlateauStreak(recent.map((c) => c.signalsDetected))
    : 0;
  const requiredAdjustment = plateauDetected
    ? plateauAdjustmentPct(Math.max(streak, 1), profile.primaryGoal)
    : null;

  const task = [
    `Client stats: ${JSON.stringify({
      sexAtBirth: profile.sexAtBirth,
      age: profile.age,
      heightCm: profile.heightCm,
      weightKg: currentWeightKg,
      activityLevel: profile.activityLevel,
      primaryGoal: profile.primaryGoal,
    })}.`,
    isAdjustment && plateauDetected
      ? `A check-in plateau signal was detected (plateau streak=${Math.max(streak, 1)}). ` +
        `You MUST call calculate_nutrition_targets with calorieAdjustmentPct=${requiredAdjustment}.`
      : isAdjustment
        ? "A check-in signal was detected but it is not a plateau -- recalculate baseline targets with calorieAdjustmentPct=null."
        : "This is their initial plan -- calculate starting nutrition targets with calorieAdjustmentPct=null.",
  ].join(" ");

  const nutritionTargets = await runNutritionSubagent(task);

  return {
    taskPlan: withStepStatus(state.taskPlan, "calc-nutrition", "done"),
    nutritionTargets,
  };
}
