// Controlled vocabulary the intake extraction prompt normalizes free text
// into. Must stay in sync with supabase/seed.sql's equipment_needed /
// injury_contraindications values -- this is what makes the equipment +
// injury guardrail in generate_workout_plan actually match real rows
// instead of silently filtering nothing because of a spelling mismatch.

export const EQUIPMENT_OPTIONS = [
  "bodyweight",
  "dumbbells",
  "barbell",
  "squat_rack",
  "bench",
  "pull_up_bar",
  "dip_bar",
  "cable_machine",
  "leg_press_machine",
  "leg_curl_machine",
  "leg_extension_machine",
  "rowing_machine",
  "jump_rope",
] as const;

export const INJURY_OPTIONS = ["knee", "lower_back", "shoulder", "wrist", "ankle"] as const;
