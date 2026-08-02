import type { NutritionTargets, Plan, WorkoutPlanDraft } from "@/types";

/** Plain-text plan summary for chat bubbles. */
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

/** Content equality ignoring rationale text. */
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
