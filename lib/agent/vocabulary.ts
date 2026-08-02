// Keep in sync with supabase/seed.sql equipment / injury values

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
