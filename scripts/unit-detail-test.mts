
import { detectMissedSessions, detectPlateau } from "../lib/agent/tools/logCheckin";
import { calculateNutritionTargets } from "../lib/agent/tools/calculateNutritionTargets";
import { generateWorkoutPlan } from "../lib/agent/tools/generateWorkoutPlan";
import type { ExerciseLibraryItem } from "../types";

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function assert(name: string, condition: boolean, detail = "") {
  results.push({ name, pass: condition, detail });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

section("detectMissedSessions");
assert("severe adherence (<50%) fires", detectMissedSessions(40, 100) === true);
assert("exactly 50% does not fire on severity", detectMissedSessions(50, 100) === false);
assert("sustained both <70% fires", detectMissedSessions(65, 60) === true);
assert("current low prior healthy does not fire", detectMissedSessions(65, 90) === false);
assert("null current => false", detectMissedSessions(null, 40) === false);
assert("null prior with 60% => false", detectMissedSessions(60, null) === false);
assert("good adherence => false", detectMissedSessions(100, 100) === false);

section("detectPlateau");
assert("fat_loss stable => plateau", detectPlateau("fat_loss", [80, 80.1, 80.2]) === true);
assert("fat_loss meaningful drop => no", detectPlateau("fat_loss", [80, 79.5, 79]) === false);
assert("muscle_gain stable => plateau", detectPlateau("muscle_gain", [70, 70.1, 70.2]) === true);
assert("muscle_gain meaningful up => no", detectPlateau("muscle_gain", [70, 70.5, 71]) === false);
assert("maintenance never", detectPlateau("maintenance", [80, 80, 80]) === false);
assert("general_fitness never", detectPlateau("general_fitness", [80, 80, 80]) === false);
assert("window <3 => false", detectPlateau("fat_loss", [80, 80]) === false);
assert("tiny fat loss still plateau", detectPlateau("fat_loss", [80, 79.9, 79.7]) === true);

section("calculateNutritionTargets");
const male = calculateNutritionTargets({
  sexAtBirth: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate",
  primaryGoal: "fat_loss",
});
assert("male TDEE 2759", male.tdee === 2759, `got ${male.tdee}`);
assert("male fat_loss cal 2207", male.targetCalories === 2207, `got ${male.targetCalories}`);
assert("male protein 160", male.proteinG === 160, `got ${male.proteinG}`);

const female = calculateNutritionTargets({
  sexAtBirth: "female",
  age: 28,
  heightCm: 165,
  weightKg: 60,
  activityLevel: "sedentary",
  primaryGoal: "muscle_gain",
});
assert("female TDEE 1596", female.tdee === 1596, `got ${female.tdee}`);
assert("female muscle_gain cal 1756", female.targetCalories === 1756, `got ${female.targetCalories}`);
assert("female protein 120", female.proteinG === 120, `got ${female.proteinG}`);

const floored = calculateNutritionTargets({
  sexAtBirth: "female",
  age: 55,
  heightCm: 150,
  weightKg: 45,
  activityLevel: "sedentary",
  primaryGoal: "fat_loss",
  calorieAdjustmentPct: -0.2,
});
assert("female safety floor 1200", floored.targetCalories === 1200, `got ${floored.targetCalories}`);

const maleFloor = calculateNutritionTargets({
  sexAtBirth: "male",
  age: 60,
  heightCm: 160,
  weightKg: 50,
  activityLevel: "sedentary",
  primaryGoal: "fat_loss",
  calorieAdjustmentPct: -0.3,
});
assert("male safety floor 1500", maleFloor.targetCalories === 1500, `got ${maleFloor.targetCalories}`);

const macroCal = male.proteinG * 4 + male.carbsG * 4 + male.fatG * 9;
assert("macros ~ calories (±15)", Math.abs(macroCal - male.targetCalories) <= 15, `macroCal=${macroCal}`);

section("generateWorkoutPlan");
function ex(
  partial: Partial<ExerciseLibraryItem> &
    Pick<
      ExerciseLibraryItem,
      | "id"
      | "name"
      | "category"
      | "equipmentNeeded"
      | "injuryContraindications"
      | "difficultyLevel"
    >
): ExerciseLibraryItem {
  return {
    targetMuscles: ["test"],
    defaultSets: 3,
    defaultRepsRange: "8-12",
    cues: null,
    ...partial,
  };
}

const library: ExerciseLibraryItem[] = [
  ex({
    id: "1",
    name: "Push-Up",
    category: "push",
    equipmentNeeded: ["bodyweight"],
    injuryContraindications: ["wrist"],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "2",
    name: "DB Press",
    category: "push",
    equipmentNeeded: ["dumbbells"],
    injuryContraindications: ["shoulder"],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "3",
    name: "Pull-Up",
    category: "pull",
    equipmentNeeded: ["pull_up_bar"],
    injuryContraindications: ["shoulder"],
    difficultyLevel: "advanced",
  }),
  ex({
    id: "4",
    name: "DB Row",
    category: "pull",
    equipmentNeeded: ["dumbbells"],
    injuryContraindications: [],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "5",
    name: "Cable Row",
    category: "pull",
    equipmentNeeded: ["cable_machine"],
    injuryContraindications: [],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "6",
    name: "BW Squat",
    category: "legs",
    equipmentNeeded: ["bodyweight"],
    injuryContraindications: ["knee"],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "7",
    name: "Goblet Squat",
    category: "legs",
    equipmentNeeded: ["dumbbells"],
    injuryContraindications: ["knee"],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "8",
    name: "Glute Bridge",
    category: "legs",
    equipmentNeeded: ["bodyweight"],
    injuryContraindications: [],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "9",
    name: "Plank",
    category: "core",
    equipmentNeeded: ["bodyweight"],
    injuryContraindications: ["wrist"],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "10",
    name: "Dead Bug",
    category: "core",
    equipmentNeeded: ["bodyweight"],
    injuryContraindications: [],
    difficultyLevel: "beginner",
  }),
  ex({
    id: "11",
    name: "Bench Press",
    category: "push",
    equipmentNeeded: ["barbell", "bench"],
    injuryContraindications: ["shoulder"],
    difficultyLevel: "intermediate",
  }),
  ex({
    id: "12",
    name: "DB Curl",
    category: "pull",
    equipmentNeeded: ["dumbbells"],
    injuryContraindications: [],
    difficultyLevel: "beginner",
  }),
];

const beginner = generateWorkoutPlan({
  equipment: ["dumbbells"],
  injuries: [],
  experienceLevel: "beginner",
  exerciseLibrary: library,
});
assert("beginner => 3 days", beginner.daysPerWeek === 3, `got ${beginner.daysPerWeek}`);
assert("beginner day count 3", beginner.days.length === 3);
assert(
  "advanced Pull-Up excluded",
  !beginner.days.some((d) => d.exercises.some((e) => e.name === "Pull-Up"))
);

const knee = generateWorkoutPlan({
  equipment: ["dumbbells"],
  injuries: ["knee"],
  experienceLevel: "beginner",
  exerciseLibrary: library,
});
assert(
  "knee injury excludes squats",
  !knee.days.some((d) => d.exercises.some((e) => e.name.includes("Squat")))
);
assert(
  "knee injury warns on legs",
  knee.warnings.some((w) => w.toLowerCase().includes("legs")),
  JSON.stringify(knee.warnings)
);

const missed = generateWorkoutPlan({
  equipment: ["dumbbells"],
  injuries: [],
  experienceLevel: "beginner",
  exerciseLibrary: library,
  missedSessionsAdjustment: true,
});
assert("missed sessions => 2 days", missed.daysPerWeek === 2, `got ${missed.daysPerWeek}`);
assert(
  "missed sessions sets reduced to 2",
  missed.days.every((d) => d.exercises.every((e) => e.sets === 2))
);

const intermediate = generateWorkoutPlan({
  equipment: ["dumbbells", "barbell", "bench"],
  injuries: [],
  experienceLevel: "intermediate",
  exerciseLibrary: library,
});
assert("intermediate => 4 days", intermediate.daysPerWeek === 4, `got ${intermediate.daysPerWeek}`);

section("SUMMARY");
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  for (const r of results.filter((x) => !x.pass)) console.log(` - ${r.name}: ${r.detail}`);
  process.exit(1);
}
console.log("All unit checks passed.");
