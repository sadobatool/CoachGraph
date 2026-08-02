
import { createClient } from "@supabase/supabase-js";
import { detectMissedSessions, detectPlateau } from "../lib/agent/tools/logCheckin";
import { calculateNutritionTargets } from "../lib/agent/tools/calculateNutritionTargets";
import { generateWorkoutPlan } from "../lib/agent/tools/generateWorkoutPlan";
import type { ExerciseLibraryItem } from "../types";

type Result = { name: string; pass: boolean; detail: string };

const results: Result[] = [];

function assert(name: string, condition: boolean, detail: string) {
  results.push({ name, pass: condition, detail });
  const mark = condition ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}`);
  if (!condition) console.log(`       ${detail}`);
  else if (detail) console.log(`       ${detail}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

// ---------- 1. Missed sessions ----------
section("detectMissedSessions");

assert(
  "severe adherence (<50%) fires immediately",
  detectMissedSessions(40, 100) === true,
  "40% with prior 100% => true"
);
assert(
  "exactly 50% does not fire on severity alone",
  detectMissedSessions(50, 100) === false,
  "50% is not < 50"
);
assert(
  "sustained low adherence (both <70%) fires",
  detectMissedSessions(65, 60) === true,
  "65% + prior 60% => true"
);
assert(
  "current low but prior healthy does not fire sustained",
  detectMissedSessions(65, 90) === false,
  "65% + prior 90% => false"
);
assert(
  "null current adherence => false",
  detectMissedSessions(null, 40) === false,
  "null current"
);
assert(
  "null prior with current 60% => false (needs two low)",
  detectMissedSessions(60, null) === false,
  "no previous check-in"
);
assert(
  "good adherence => false",
  detectMissedSessions(100, 100) === false,
  "100%/100%"
);

// ---------- 2. Plateau ----------
section("detectPlateau");

assert(
  "fat_loss stable weight (3 pts) => plateau",
  detectPlateau("fat_loss", [80, 80.1, 80.2]) === true,
  "pct change ~0.25% > -0.5%"
);
assert(
  "fat_loss meaningful drop => no plateau",
  detectPlateau("fat_loss", [80, 79.5, 79]) === false,
  "(79-80)/80 = -1.25% < -0.5%"
);
assert(
  "muscle_gain stable weight => plateau",
  detectPlateau("muscle_gain", [70, 70.1, 70.2]) === true,
  "tiny gain still < +0.5%"
);
assert(
  "muscle_gain meaningful gain => no plateau",
  detectPlateau("muscle_gain", [70, 70.5, 71]) === false,
  "(71-70)/70 = +1.43%"
);
assert(
  "maintenance goal never plateaus",
  detectPlateau("maintenance", [80, 80, 80]) === false,
  "goal gate"
);
assert(
  "general_fitness never plateaus",
  detectPlateau("general_fitness", [80, 80, 80]) === false,
  "goal gate"
);
assert(
  "fewer than 3 weights => false",
  detectPlateau("fat_loss", [80, 80]) === false,
  "window length"
);
assert(
  "fat_loss tiny loss within threshold still plateau",
  detectPlateau("fat_loss", [80, 79.9, 79.7]) === true,
  "(79.7-80)/80 = -0.375% which is > -0.5%"
);

// ---------- 3. Nutrition / Mifflin-St Jeor ----------
section("calculateNutritionTargets");

const male = calculateNutritionTargets({
  sexAtBirth: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate",
  primaryGoal: "fat_loss",
});
// BMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
// TDEE = 1780 * 1.55 = 2759
// target = 2759 * 0.8 = 2207.2
assert("male BMR/TDEE math", male.tdee === 2759, `tdee=${male.tdee} expected 2759`);
assert("male fat_loss calories (~-20%)", male.targetCalories === 2207, `cal=${male.targetCalories}`);
assert("male protein 2.0 g/kg", male.proteinG === 160, `protein=${male.proteinG}`);

const female = calculateNutritionTargets({
  sexAtBirth: "female",
  age: 28,
  heightCm: 165,
  weightKg: 60,
  activityLevel: "sedentary",
  primaryGoal: "muscle_gain",
});
// BMR = 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25
// TDEE = 1330.25 * 1.2 = 1596.3
// target = 1596.3 * 1.1 = 1755.93
assert("female TDEE math", female.tdee === 1596, `tdee=${female.tdee}`);
assert("female muscle_gain +10%", female.targetCalories === 1756, `cal=${female.targetCalories}`);
assert("female protein 2.0 g/kg", female.proteinG === 120, `protein=${female.proteinG}`);

const floored = calculateNutritionTargets({
  sexAtBirth: "female",
  age: 55,
  heightCm: 150,
  weightKg: 45,
  activityLevel: "sedentary",
  primaryGoal: "fat_loss",
  calorieAdjustmentPct: -0.2,
});
assert(
  "safety floor female 1200",
  floored.targetCalories === 1200,
  `cal=${floored.targetCalories}; rationale includes floor: ${floored.rationale.includes("1200")}`
);

const maleFloor = calculateNutritionTargets({
  sexAtBirth: "male",
  age: 60,
  heightCm: 160,
  weightKg: 50,
  activityLevel: "sedentary",
  primaryGoal: "fat_loss",
  calorieAdjustmentPct: -0.3,
});
assert(
  "safety floor male 1500",
  maleFloor.targetCalories === 1500,
  `cal=${maleFloor.targetCalories}`
);

const macrosSum =
  male.proteinG * 4 + male.carbsG * 4 + male.fatG * 9;
assert(
  "macros roughly match calories (±15 kcal)",
  Math.abs(macrosSum - male.targetCalories) <= 15,
  `macroCal=${macrosSum} target=${male.targetCalories}`
);

// ---------- 4. Workout plan generation ----------
section("generateWorkoutPlan");

function ex(
  partial: Partial<ExerciseLibraryItem> & Pick<ExerciseLibraryItem, "id" | "name" | "category" | "equipmentNeeded" | "injuryContraindications" | "difficultyLevel">
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
  ex({ id: "1", name: "Push-Up", category: "push", equipmentNeeded: ["bodyweight"], injuryContraindications: ["wrist"], difficultyLevel: "beginner" }),
  ex({ id: "2", name: "DB Press", category: "push", equipmentNeeded: ["dumbbells"], injuryContraindications: ["shoulder"], difficultyLevel: "beginner" }),
  ex({ id: "3", name: "Pull-Up", category: "pull", equipmentNeeded: ["pull_up_bar"], injuryContraindications: ["shoulder"], difficultyLevel: "advanced" }),
  ex({ id: "4", name: "DB Row", category: "pull", equipmentNeeded: ["dumbbells"], injuryContraindications: [], difficultyLevel: "beginner" }),
  ex({ id: "5", name: "Cable Row", category: "pull", equipmentNeeded: ["cable_machine"], injuryContraindications: [], difficultyLevel: "beginner" }),
  ex({ id: "6", name: "BW Squat", category: "legs", equipmentNeeded: ["bodyweight"], injuryContraindications: ["knee"], difficultyLevel: "beginner" }),
  ex({ id: "7", name: "Goblet Squat", category: "legs", equipmentNeeded: ["dumbbells"], injuryContraindications: ["knee"], difficultyLevel: "beginner" }),
  ex({ id: "8", name: "Glute Bridge", category: "legs", equipmentNeeded: ["bodyweight"], injuryContraindications: [], difficultyLevel: "beginner" }),
  ex({ id: "9", name: "Plank", category: "core", equipmentNeeded: ["bodyweight"], injuryContraindications: ["wrist"], difficultyLevel: "beginner" }),
  ex({ id: "10", name: "Dead Bug", category: "core", equipmentNeeded: ["bodyweight"], injuryContraindications: [], difficultyLevel: "beginner" }),
  ex({ id: "11", name: "Bench Press", category: "push", equipmentNeeded: ["barbell", "bench"], injuryContraindications: ["shoulder"], difficultyLevel: "intermediate" }),
  ex({ id: "12", name: "DB Curl", category: "pull", equipmentNeeded: ["dumbbells"], injuryContraindications: [], difficultyLevel: "beginner" }),
];

const beginnerPlan = generateWorkoutPlan({
  equipment: ["dumbbells"],
  injuries: [],
  experienceLevel: "beginner",
  exerciseLibrary: library,
});
assert("beginner => 3 days/week", beginnerPlan.daysPerWeek === 3, `days=${beginnerPlan.daysPerWeek}`);
assert("beginner has 3 day entries", beginnerPlan.days.length === 3, `len=${beginnerPlan.days.length}`);
assert(
  "bodyweight always allowed even if not listed",
  beginnerPlan.days.some((d) => d.exercises.some((e) => e.name === "Push-Up" || e.name === "Glute Bridge" || e.name === "Dead Bug")),
  `names=${beginnerPlan.days.flatMap((d) => d.exercises.map((e) => e.name)).join(", ")}`
);
assert(
  "advanced Pull-Up excluded for beginner",
  !beginnerPlan.days.some((d) => d.exercises.some((e) => e.name === "Pull-Up")),
  "difficulty filter"
);

const kneeInjury = generateWorkoutPlan({
  equipment: ["dumbbells"],
  injuries: ["knee"],
  experienceLevel: "beginner",
  exerciseLibrary: library,
});
assert(
  "knee injury excludes squats",
  !kneeInjury.days.some((d) => d.exercises.some((e) => e.name.includes("Squat"))),
  `exercises=${kneeInjury.days.flatMap((d) => d.exercises.map((e) => e.name)).join(", ")}`
);
assert(
  "knee injury may warn on limited legs",
  kneeInjury.warnings.some((w) => w.toLowerCase().includes("legs")),
  `warnings=${JSON.stringify(kneeInjury.warnings)}`
);

const missed = generateWorkoutPlan({
  equipment: ["dumbbells"],
  injuries: [],
  experienceLevel: "beginner",
  exerciseLibrary: library,
  missedSessionsAdjustment: true,
});
assert("missed sessions => drop to 2 days", missed.daysPerWeek === 2, `days=${missed.daysPerWeek}`);
assert(
  "missed sessions reduces sets by 1 (min 2)",
  missed.days.every((d) => d.exercises.every((e) => e.sets === 2)),
  `sets sample=${missed.days[0]?.exercises[0]?.sets}`
);

const intermediate = generateWorkoutPlan({
  equipment: ["dumbbells", "barbell", "bench"],
  injuries: [],
  experienceLevel: "intermediate",
  exerciseLibrary: library,
});
assert("intermediate => 4 days", intermediate.daysPerWeek === 4, `days=${intermediate.daysPerWeek}`);

// ---------- 5. Supabase live ----------
section("Supabase connectivity");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  assert("env loaded", false, "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
} else {
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const exercises = await sb.from("exercise_library").select("id,name,category").limit(5);
  assert(
    "exercise_library readable",
    !exercises.error && Array.isArray(exercises.data) && exercises.data.length > 0,
    exercises.error
      ? exercises.error.message
      : `rows=${exercises.data?.length}; sample=${exercises.data?.[0]?.name ?? "n/a"}`
  );

  const countRes = await sb.from("exercise_library").select("id", { count: "exact", head: true });
  assert(
    "exercise_library has seed volume",
    !countRes.error && (countRes.count ?? 0) >= 30,
    countRes.error ? countRes.error.message : `count=${countRes.count}`
  );

  const clients = await sb.from("clients").select("id,email,onboarding_status").limit(3);
  assert(
    "clients table readable",
    !clients.error,
    clients.error ? clients.error.message : `rows=${clients.data?.length ?? 0}`
  );

  const plans = await sb.from("plans").select("id,version,status").limit(3);
  assert(
    "plans table readable",
    !plans.error,
    plans.error ? plans.error.message : `rows=${plans.data?.length ?? 0}`
  );

  const checkins = await sb.from("checkins").select("id").limit(1);
  assert(
    "checkins table readable",
    !checkins.error,
    checkins.error ? checkins.error.message : `ok (rows=${checkins.data?.length ?? 0})`
  );

  // Round-trip: upsert test client then delete
  const testEmail = `detail-test-${Date.now()}@example.com`;
  const upsert = await sb
    .from("clients")
    .upsert(
      {
        email: testEmail,
        name: "Detail Test",
        onboarding_status: "intake_in_progress",
      },
      { onConflict: "email" }
    )
    .select("id,email")
    .single();

  assert(
    "client upsert works",
    !upsert.error && upsert.data?.email === testEmail,
    upsert.error ? upsert.error.message : `id=${upsert.data?.id}`
  );

  if (upsert.data?.id) {
    const del = await sb.from("clients").delete().eq("id", upsert.data.id);
    assert("client cleanup delete works", !del.error, del.error ? del.error.message : "deleted");
  }
}

// ---------- 6. OpenAI key presence (no spend) ----------
section("OpenAI config");
const openai = process.env.OPENAI_API_KEY;
assert(
  "OPENAI_API_KEY present",
  Boolean(openai && openai.startsWith("sk-")),
  openai ? `prefix=${openai.slice(0, 7)}... len=${openai.length}` : "missing"
);

// ---------- Summary ----------
section("SUMMARY");
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  console.log("\nFailed cases:");
  for (const r of results.filter((x) => !x.pass)) {
    console.log(` - ${r.name}: ${r.detail}`);
  }
  process.exit(1);
}
console.log("All detailed checks passed.");
