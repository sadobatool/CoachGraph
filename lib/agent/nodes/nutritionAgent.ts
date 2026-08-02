import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { createGpt4o } from "@/lib/openai/client";
import { calculateNutritionTargetsTool } from "../tools/calculateNutritionTargets";
import { getRecentCheckins } from "@/lib/supabase/queries";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { withStepStatus } from "../taskPlanSteps";
import type { NutritionTargets, SignalType } from "@/types";

const SYSTEM_PROMPT = [
  "You are the nutrition specialist on a fitness coaching team. You only handle calorie and macro targets --",
  "exercise selection is a different specialist's job and you have no tool for it.",
  "",
  "Always call calculate_nutrition_targets to get the numbers -- never estimate calories or macros yourself.",
  "If the context gives you an exact calorieAdjustmentPct to use, pass that value exactly -- do not pick a different one.",
  "If you're adjusting for a plateau and no exact value is given, pass calorieAdjustmentPct to nudge the deficit/surplus",
  "(e.g. -0.10 for a stalled fat_loss goal, +0.05 for a stalled muscle_gain goal).",
  "",
  "After calling the tool, write a short (2-3 sentence) friendly explanation a non-expert can understand.",
  "Avoid jargon where possible. If this is an adjustment, say clearly what changed and why",
  "(including that this is a further cut if the streak is > 1). This text is shown directly to the client.",
].join("\n");

// First plateau: -10% of TDEE on top of the goal default. Each consecutive
// plateau check-in stacks another -5%, capped so we don't keep cutting forever.
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

/**
 * Nutrition specialist sub-agent: its own system prompt, its own tool
 * (calculate_nutrition_targets), and nothing else. A small manual
 * tool-calling loop rather than a framework agent, so the control flow
 * here stays explicit and easy to reason about/debug.
 */
export async function nutritionAgentNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const profile = state.clientProfile;
  if (!profile) {
    return { taskPlan: withStepStatus(state.taskPlan, "calc-nutrition", "skipped") };
  }

  const isAdjustment = Boolean(state.checkinResult?.needsLlmAdjustment);
  const currentWeightKg = state.checkinResult?.checkin.weightKg ?? profile.startingWeightKg;
  const plateauDetected = state.checkinResult?.signalsDetected.includes("plateau") ?? false;

  // Include the check-in just logged (newest) so streak counts this turn.
  const recent = state.clientId ? await getRecentCheckins(state.clientId, 5) : [];
  const streak = plateauDetected
    ? countConsecutivePlateauStreak(recent.map((c) => c.signalsDetected))
    : 0;
  const requiredAdjustment = plateauDetected
    ? plateauAdjustmentPct(Math.max(streak, 1), profile.primaryGoal)
    : null;

  const contextMessage = new HumanMessage(
    `Client stats: ${JSON.stringify({
      sexAtBirth: profile.sexAtBirth,
      age: profile.age,
      heightCm: profile.heightCm,
      weightKg: currentWeightKg,
      activityLevel: profile.activityLevel,
      primaryGoal: profile.primaryGoal,
    })}. ${
      isAdjustment && plateauDetected
        ? `A check-in plateau signal was detected (plateau streak=${Math.max(streak, 1)}). ` +
          `You MUST call calculate_nutrition_targets with calorieAdjustmentPct=${requiredAdjustment} ` +
          `(stacked further than the previous plateau cut when streak > 1, so the calorie target actually moves).`
        : isAdjustment
          ? "A check-in signal was detected but it is not a plateau -- recalculate baseline targets with calorieAdjustmentPct=null."
          : "This is their initial plan -- calculate their starting nutrition targets with calorieAdjustmentPct=null."
    }`
  );

  const model = createGpt4o().bindTools([calculateNutritionTargetsTool]);
  const messages: Array<SystemMessage | HumanMessage | ToolMessage | Awaited<ReturnType<typeof model.invoke>>> = [
    new SystemMessage(SYSTEM_PROMPT),
    contextMessage,
  ];

  let response = await model.invoke(messages);
  let nutritionTargets: NutritionTargets | null = null;

  // Typically resolves in one round trip since the tool is deterministic
  // and self-sufficient; the loop cap just guards against a runaway model.
  for (let i = 0; i < 3 && response.tool_calls && response.tool_calls.length > 0; i++) {
    messages.push(response);
    for (const call of response.tool_calls) {
      const toolResult = (await calculateNutritionTargetsTool.invoke(call.args as never)) as string;
      nutritionTargets = JSON.parse(toolResult) as NutritionTargets;
      messages.push(new ToolMessage({ content: toolResult, tool_call_id: call.id ?? "" }));
    }
    response = await model.invoke(messages);
  }

  if (nutritionTargets && typeof response.content === "string" && response.content.trim().length > 0) {
    nutritionTargets = { ...nutritionTargets, rationale: response.content };
  }

  return {
    taskPlan: withStepStatus(state.taskPlan, "calc-nutrition", "done"),
    nutritionTargets,
  };
}
