import type { CheckinRecord, NutritionTargets, Plan, SignalType } from "@/types";
import { formatPlanSummary } from "./planSummary";

/** Join non-empty sections with a blank line for readable chat bubbles. */
export function joinSections(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n");
}

function formatWeightKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/** Conversational "why we updated your plan" opener for check-in adjustments. */
export function formatAdjustmentWhy(
  signals: SignalType[],
  checkin?: CheckinRecord | null,
  changedParts?: string
): string {
  const hasPlateau = signals.includes("plateau");
  const hasMissed = signals.includes("missed_sessions");
  const weight = checkin ? formatWeightKg(checkin.weightKg) : null;
  const done = checkin?.sessionsCompleted;
  const planned = checkin?.sessionsPlanned;

  let why: string;
  if (hasPlateau && hasMissed) {
    why = [
      "Thanks for the check-in — I took a look, and two things stood out.",
      weight && done !== undefined && planned !== undefined
        ? `Your weight is holding around ${weight} kg, and you only got to ${done} of ${planned} workouts this week.`
        : "Your weight hasn't really moved, and workout consistency has been low.",
      "So I refreshed your plan to help with both.",
    ].join(" ");
  } else if (hasPlateau) {
    why = [
      "Thanks for checking in.",
      weight
        ? `Your weight has been hovering around ${weight} kg without much progress, so it looks like you've hit a plateau.`
        : "It looks like you've hit a plateau — your weight hasn't moved much lately.",
      changedParts?.includes("nutrition")
        ? "I updated your nutrition targets to help get things moving again."
        : "I tweaked your plan to help get things moving again.",
    ].join(" ");
  } else if (hasMissed) {
    why = [
      "Thanks for being honest about this week.",
      done !== undefined && planned !== undefined
        ? `You made it to ${done} of ${planned} workouts, which is tougher than ideal.`
        : "It looks like completing workouts has been tough lately.",
      changedParts?.includes("workout")
        ? "I simplified your workout plan so it's easier to stay consistent."
        : "I adjusted your plan so it's easier to stay consistent.",
    ].join(" ");
  } else {
    why = "Thanks for the check-in — I updated your plan based on how things are going.";
  }

  return why;
}

export function formatNutritionReminder(nutrition: NutritionTargets): string {
  return [
    "Your daily nutrition targets:",
    `- Calories: ${nutrition.targetCalories.toLocaleString()} kcal`,
    `- Protein: ${nutrition.proteinG}g`,
    `- Carbs: ${nutrition.carbsG}g`,
    `- Fat: ${nutrition.fatG}g`,
  ].join("\n");
}

export function formatCheckinLoggedReply(checkin: CheckinRecord, nutrition?: NutritionTargets | null): string {
  const adherence =
    checkin.adherencePct !== null
      ? `${Math.round(checkin.adherencePct)}% of planned workouts`
      : "workouts logged";

  return joinSections(
    "Check-in saved ✓",
    [
      "Here's what I logged:",
      `- Weight: ${formatWeightKg(checkin.weightKg)} kg`,
      `- Workouts: ${checkin.sessionsCompleted} of ${checkin.sessionsPlanned} (${adherence})`,
      `- Soreness: ${checkin.sorenessLevel}/5`,
    ].join("\n"),
    "You're on track — keep following your current plan.",
    nutrition ? formatNutritionReminder(nutrition) : null,
    "Tip: this app sets your calorie/macro targets, but it doesn't log meals yet. Use these targets as your daily guide."
  );
}

export function formatCheckinMissingReply(
  missing: string[],
  context?: { knownCompleted?: number | null }
): string {
  const lines = missing.map((item) => `- ${item}`);

  const opener =
    context?.knownCompleted === 0
      ? "Got it — sounds like you didn't get workouts in this week. I can still log that."
      : "I can save your check-in — I just need a bit more info:";

  const example =
    missing.length === 1 && missing[0].toLowerCase().includes("weight")
      ? 'Just reply with your weight, like: "I\'m 62 kg" or "138 lbs"'
      : 'Example: "Weight 62 kg, did 2 of 3 workouts this week, soreness 3"';

  return joinSections(opener, lines.join("\n"), example);
}

export function formatIntakeFollowUp(acknowledgment: string, fieldLabels: string[]): string {
  const askLines = fieldLabels.map((label) => `- ${label}`);
  return joinSections(
    acknowledgment,
    "To finish your plan, please tell me:",
    askLines.join("\n")
  );
}

export function formatPlanReadyReply(
  plan: Plan,
  options?: {
    isAdjustment?: boolean;
    warnings?: string[];
    changedParts?: string;
    signals?: SignalType[];
    checkin?: CheckinRecord | null;
  }
): string {
  const warningsText =
    options?.warnings && options.warnings.length > 0
      ? ["Quick heads-up:", ...options.warnings.map((w) => `- ${w}`)].join("\n")
      : null;

  if (options?.isAdjustment) {
    const why = formatAdjustmentWhy(options.signals ?? [], options.checkin, options.changedParts);
    return joinSections(
      why,
      `Here's your updated plan (v${plan.version}):`,
      formatPlanSummary(plan),
      warningsText,
      "Give this a go this week and check in again when you're ready."
    );
  }

  return joinSections(
    "Nice — I've got everything I need.",
    `Here's your starter plan (v${plan.version}):`,
    formatPlanSummary(plan),
    warningsText,
    "When you're ready, send a weekly check-in with your weight and how many workouts you completed."
  );
}

export function formatPlanUnchangedReply(
  plan: Plan,
  signals: SignalType[],
  checkin?: CheckinRecord | null
): string {
  const why = formatAdjustmentWhy(signals, checkin);
  return joinSections(
    why,
    `Your current plan (v${plan.version}) already has the latest adjustment for this, so I'm keeping it the same for now instead of changing it again.`,
    "Here's what you're still working with:",
    formatPlanSummary({
      ...plan,
      workoutPlan: { ...plan.workoutPlan, rationale: null },
      nutritionPlan: { ...plan.nutritionPlan, rationale: "" },
    }),
    "Keep at it this week and check in again — we'll adjust further if we need to."
  );
}

export function formatWelcomeBack(name: string | null, planSummary: string | null): string {
  return joinSections(
    `Welcome back${name ? `, ${name}` : ""}!`,
    "How has training been going?",
    planSummary,
    [
      "When you're ready, send a check-in like:",
      '- "Weighed 62 kg, did all 3 workouts, soreness 2"',
      '- "Weight 138 lbs, did 2 of 3 workouts this week"',
    ].join("\n"),
    "Note: check-ins track weight and workouts. Meal logging isn't available yet — follow the calorie/macro targets on your plan."
  );
}

export function formatNewUserGreeting(): string {
  return joinSections(
    "Hi! I'm your adaptcoach.",
    "I'll build a simple starter plan for you. Tell me about:",
    [
      "- Your goal (fat loss, muscle gain, etc.)",
      "- Age, height, and weight",
      "- How active you are",
      "- What equipment you have",
      "- Any injuries (or say none)",
    ].join("\n"),
    "You can share it all at once, or one thing at a time — whatever's easier."
  );
}
