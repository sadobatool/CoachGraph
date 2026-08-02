import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ActivityLevel, NutritionTargets, PrimaryGoal, SexAtBirth } from "@/types";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Calorie adjustment from TDEE for each goal, before any signal-driven tweak.
const GOAL_CALORIE_ADJUSTMENT: Record<PrimaryGoal, number> = {
  fat_loss: -0.2,
  muscle_gain: 0.1,
  maintenance: 0,
  general_fitness: 0,
};

const PROTEIN_G_PER_KG: Record<PrimaryGoal, number> = {
  fat_loss: 2.0,
  muscle_gain: 2.0,
  maintenance: 1.8,
  general_fitness: 1.6,
};

// Guardrail: never recommend below a safe calorie floor, regardless of how
// aggressive a deficit the math would otherwise produce.
const SAFETY_FLOOR_CALORIES: Record<SexAtBirth, number> = {
  male: 1500,
  female: 1200,
};

export interface CalculateNutritionTargetsParams {
  sexAtBirth: SexAtBirth;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  primaryGoal: PrimaryGoal;
  /** Extra adjustment on top of the goal default, e.g. -0.10 for an additional
   * 10% cut when log_checkin detects a fat-loss plateau. Decided by the
   * nutritionAgent LLM's reasoning about the check-in context; the actual
   * arithmetic here stays 100% deterministic either way. */
  calorieAdjustmentPct?: number | null;
}

/**
 * Deterministic TDEE + macro calculator (Mifflin-St Jeor equation).
 * No LLM involved -- this is plain arithmetic, called directly by the
 * nutrition sub-agent's tool-calling loop.
 */
export function calculateNutritionTargets(params: CalculateNutritionTargetsParams): NutritionTargets {
  const { sexAtBirth, age, heightCm, weightKg, activityLevel, primaryGoal, calorieAdjustmentPct } = params;
  const adjustmentPct = calorieAdjustmentPct ?? 0;

  const bmr =
    sexAtBirth === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel];

  const totalAdjustment = GOAL_CALORIE_ADJUSTMENT[primaryGoal] + adjustmentPct;
  let targetCalories = tdee * (1 + totalAdjustment);

  const floor = SAFETY_FLOOR_CALORIES[sexAtBirth];
  let flooredNote = "";
  if (targetCalories < floor) {
    targetCalories = floor;
    flooredNote = ` Calories floored at the ${floor} kcal safety minimum for ${
      sexAtBirth === "male" ? "men" : "women"
    } rather than following the raw deficit/surplus math.`;
  }

  const proteinG = weightKg * PROTEIN_G_PER_KG[primaryGoal];
  const fatG = (targetCalories * 0.25) / 9;
  const remainingCalories = Math.max(targetCalories - proteinG * 4 - fatG * 9, 0);
  const carbsG = remainingCalories / 4;

  return {
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    rationale: `TDEE estimated via Mifflin-St Jeor at ${activityLevel} activity. Target calories reflect a ${Math.round(
      totalAdjustment * 100
    )}% adjustment from TDEE for a ${primaryGoal.replace("_", " ")} goal.${flooredNote}`,
  };
}

/** Bindable LangChain tool wrapper -- what the nutritionAgent LLM actually calls. */
export const calculateNutritionTargetsTool = tool(
  async (input) => JSON.stringify(calculateNutritionTargets(input)),
  {
    name: "calculate_nutrition_targets",
    description:
      "Deterministically compute TDEE and macro targets (protein/carbs/fat) for a client using the " +
      "Mifflin-St Jeor formula. Always call this instead of estimating calories or macros yourself.",
    schema: z.object({
      sexAtBirth: z.enum(["male", "female"]),
      age: z.number(),
      heightCm: z.number(),
      weightKg: z.number(),
      activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
      primaryGoal: z.enum(["fat_loss", "muscle_gain", "maintenance", "general_fitness"]),
      calorieAdjustmentPct: z
        .number()
        .nullable()
        .describe(
          "Extra adjustment beyond the goal default, e.g. -0.10 for an additional 10% cut after a plateau. Pass null if not adjusting."
        ),
    }),
  }
);
