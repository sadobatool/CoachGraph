import type { NutritionTargets, Plan, WorkoutPlanDraft } from "@/types";

/**
 * Shared by mergePlan (right after generating/adjusting a plan) and the
 * profile lookup route (so a returning client always sees their current
 * plan on the greeting, not just once at the moment it was generated).
 *
 * Renders as plain text with real newlines -- MessageBubble uses
 * `whitespace-pre-wrap`, so this structure (headings + "- " bullets)
 * displays as a readable list instead of one dense paragraph.
 */
export function formatPlanSummary(plan: Plan): string {
  const { nutritionPlan, workoutPlan } = plan;

  const nutritionSection = [
    "Nutrition (daily targets)",
    `- Calories: ${nutritionPlan.targetCalories.toLocaleString()} kcal`,
    `- Protein: ${nutritionPlan.proteinG}g`,
    `- Carbs: ${nutritionPlan.carbsG}g`,
    `- Fat: ${nutritionPlan.fatG}g`,
  ].join("\n");

  const dayBlocks = workoutPlan.days.map((d) => {
    if (d.exercises.length === 0) {
      return `${d.day} — ${d.focus}\n  - (no safe exercises found for this day)`;
    }
    const exerciseLines = d.exercises.map((ex) => `  - ${ex.name}: ${ex.sets} sets × ${ex.reps}`);
    return [`${d.day} — ${d.focus}`, ...exerciseLines].join("\n");
  });

  const workoutSection = [`Workout (${workoutPlan.daysPerWeek} days/week)`, ...dayBlocks].join("\n\n");

  const nutritionNote = nutritionPlan.rationale?.trim()
    ? `About your nutrition:\n${nutritionPlan.rationale.trim()}`
    : null;
  const workoutNote = workoutPlan.rationale?.trim()
    ? `About your workouts:\n${workoutPlan.rationale.trim()}`
    : null;

  return [nutritionSection, nutritionNote, workoutSection, workoutNote]
    .filter((section): section is string => Boolean(section && section.trim()))
    .join("\n\n");
}

/** Compare the numbers/exercises that matter to the client -- ignores rationale text. */
export function plansHaveSameContent(
  a: { nutritionPlan: NutritionTargets; workoutPlan: WorkoutPlanDraft },
  b: { nutritionPlan: NutritionTargets; workoutPlan: WorkoutPlanDraft }
): boolean {
  const nutritionSame =
    a.nutritionPlan.targetCalories === b.nutritionPlan.targetCalories &&
    a.nutritionPlan.proteinG === b.nutritionPlan.proteinG &&
    a.nutritionPlan.carbsG === b.nutritionPlan.carbsG &&
    a.nutritionPlan.fatG === b.nutritionPlan.fatG;

  if (!nutritionSame) return false;
  if (a.workoutPlan.daysPerWeek !== b.workoutPlan.daysPerWeek) return false;
  if (a.workoutPlan.days.length !== b.workoutPlan.days.length) return false;

  return a.workoutPlan.days.every((day, i) => {
    const other = b.workoutPlan.days[i];
    if (day.focus !== other.focus || day.exercises.length !== other.exercises.length) return false;
    return day.exercises.every(
      (ex, j) =>
        ex.name === other.exercises[j].name &&
        ex.sets === other.exercises[j].sets &&
        ex.reps === other.exercises[j].reps
    );
  });
}
