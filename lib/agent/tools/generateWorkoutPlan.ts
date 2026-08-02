import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAllExercises } from "@/lib/supabase/queries";
import type { ExerciseCategory, ExerciseLibraryItem, ExperienceLevel, WorkoutDay, WorkoutExercise, WorkoutPlanDraft } from "@/types";

const DAYS_PER_WEEK_BY_EXPERIENCE: Record<ExperienceLevel, 2 | 3 | 4> = {
  beginner: 3,
  intermediate: 4,
  advanced: 4,
};

interface DayTemplate {
  day: string;
  focus: string;
  categories: ExerciseCategory[];
}

const SPLITS: Record<2 | 3 | 4, DayTemplate[]> = {
  2: [
    { day: "Day 1", focus: "Full Body A", categories: ["legs", "push", "core"] },
    { day: "Day 2", focus: "Full Body B", categories: ["pull", "legs", "core"] },
  ],
  3: [
    { day: "Day 1", focus: "Full Body A", categories: ["legs", "push", "core"] },
    { day: "Day 2", focus: "Full Body B", categories: ["pull", "legs", "core"] },
    { day: "Day 3", focus: "Full Body C", categories: ["push", "pull", "core"] },
  ],
  4: [
    { day: "Day 1", focus: "Push", categories: ["push"] },
    { day: "Day 2", focus: "Pull", categories: ["pull"] },
    { day: "Day 3", focus: "Legs", categories: ["legs"] },
    { day: "Day 4", focus: "Full Body + Core", categories: ["push", "pull", "legs", "core"] },
  ],
};

const DIFFICULTY_RANK: Record<ExperienceLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

// Below this many eligible exercises for a category on a given day, we flag
// a guardrail warning instead of silently shipping a thin/unsafe plan.
const MIN_EXERCISES_PER_CATEGORY = 2;

function isEquipmentAvailable(exercise: ExerciseLibraryItem, clientEquipment: string[]): boolean {
  const available = new Set([...clientEquipment, "bodyweight"]);
  return exercise.equipmentNeeded.every((needed) => available.has(needed));
}

function isSafeForInjuries(exercise: ExerciseLibraryItem, injuries: string[]): boolean {
  if (injuries.length === 0) return true;
  return !exercise.injuryContraindications.some((contraindication) => injuries.includes(contraindication));
}

function isDifficultyAppropriate(exercise: ExerciseLibraryItem, experienceLevel: ExperienceLevel): boolean {
  return DIFFICULTY_RANK[exercise.difficultyLevel] <= DIFFICULTY_RANK[experienceLevel];
}

function toWorkoutExercise(exercise: ExerciseLibraryItem, reduceSets: boolean): WorkoutExercise {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    sets: reduceSets ? Math.max(2, exercise.defaultSets - 1) : exercise.defaultSets,
    reps: exercise.defaultRepsRange,
    notes: exercise.cues ?? undefined,
  };
}

export interface GenerateWorkoutPlanParams {
  equipment: string[];
  injuries: string[];
  experienceLevel: ExperienceLevel;
  exerciseLibrary: ExerciseLibraryItem[];
  /** When true (missed-sessions adjustment), drop one training day and one set per exercise. */
  missedSessionsAdjustment?: boolean;
}

/**
 * Deterministic exercise selection -- filters the library by equipment and
 * injury contraindications (real array-overlap checks, no LLM judgment),
 * then assembles a weekly split. Pure and independently testable: DB
 * fetching happens in the tool wrapper below, not in here.
 */
export function generateWorkoutPlan(params: GenerateWorkoutPlanParams): WorkoutPlanDraft {
  const { equipment, injuries, experienceLevel, exerciseLibrary, missedSessionsAdjustment } = params;

  const eligible = exerciseLibrary.filter(
    (exercise) =>
      isEquipmentAvailable(exercise, equipment) &&
      isSafeForInjuries(exercise, injuries) &&
      isDifficultyAppropriate(exercise, experienceLevel)
  );

  const baseDays = DAYS_PER_WEEK_BY_EXPERIENCE[experienceLevel];
  const daysPerWeek = (missedSessionsAdjustment ? Math.max(2, baseDays - 1) : baseDays) as 2 | 3 | 4;
  const split = SPLITS[daysPerWeek];
  const warnings: string[] = [];

  const days: WorkoutDay[] = split.map((template) => {
    const exercises: WorkoutExercise[] = [];

    for (const category of template.categories) {
      const pool = eligible
        .filter((exercise) => exercise.category === category)
        .sort((a, b) => a.name.localeCompare(b.name));

      const countNeeded = template.categories.length === 1 ? 5 : category === "core" ? 1 : 2;

      if (pool.length < MIN_EXERCISES_PER_CATEGORY && category !== "core") {
        warnings.push(
          `Limited safe "${category}" exercises for ${template.focus} given your equipment and injuries ` +
            `(only ${pool.length} option${pool.length === 1 ? "" : "s"} found). Consider adding equipment ` +
            `(e.g. a machine that isolates the movement) or consulting a physical therapist before progressing this area.`
        );
      }

      exercises.push(
        ...pool
          .slice(0, Math.min(countNeeded, pool.length))
          .map((exercise) => toWorkoutExercise(exercise, Boolean(missedSessionsAdjustment)))
      );
    }

    return { day: template.day, focus: template.focus, exercises };
  });

  return { daysPerWeek, days, warnings: Array.from(new Set(warnings)) };
}

/** Bindable LangChain tool wrapper -- what the trainingAgent LLM actually calls. */
export const generateWorkoutPlanTool = tool(
  async (input) => {
    const exerciseLibrary = await getAllExercises();
    const result = generateWorkoutPlan({ ...input, exerciseLibrary });
    return JSON.stringify(result);
  },
  {
    name: "generate_workout_plan",
    description:
      "Deterministically assemble a weekly workout plan from the exercise library, filtered by the client's " +
      "available equipment and stated injuries. Always call this instead of inventing exercises yourself. " +
      "Pass missedSessionsAdjustment=true when a missed-sessions signal fired -- that shortens the week by one " +
      "day and reduces sets so the plan is realistically easier to stick to. " +
      "The result may include `warnings` when a muscle group has very few safe options -- you must surface " +
      "those warnings to the client in your explanation, not drop them.",
    schema: z.object({
      equipment: z.array(z.string()),
      injuries: z.array(z.string()),
      experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
      missedSessionsAdjustment: z
        .boolean()
        .optional()
        .describe("True when adjusting after missed sessions -- reduces days/week and sets."),
    }),
  }
);
