import { z } from "zod";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { withStepStatus, appendSteps, buildGenerationSteps } from "../taskPlanSteps";
import { saveClientProfile } from "../tools/saveClientProfile";
import { createGpt4oMini } from "@/lib/openai/client";
import { EQUIPMENT_OPTIONS, INJURY_OPTIONS } from "../vocabulary";
import { formatIntakeFollowUp, joinSections } from "../replies";
import type { ClientProfileDraft } from "@/types";

const REQUIRED_FIELDS = [
  "name",
  "sexAtBirth",
  "age",
  "heightCm",
  "startingWeightKg",
  "activityLevel",
  "primaryGoal",
  "experienceLevel",
  "equipment",
  "injuries",
] as const;

// Human-friendly phrasing for the deterministic follow-up question. Kept
// separate from the LLM's job on purpose -- see the comment on
// buildFollowUpReply below for why "what to ask next" must never be left to
// the model's own judgment.
const FIELD_LABELS: Record<(typeof REQUIRED_FIELDS)[number], string> = {
  name: "Your name",
  sexAtBirth: "Sex at birth (male or female) — used for calorie math",
  age: "Your age",
  heightCm: "Your height (cm or ft/in is fine)",
  startingWeightKg: "Your current weight (kg or lbs is fine)",
  activityLevel: "Activity level (sedentary, light, moderate, active, or very active)",
  primaryGoal: "Main goal (fat loss, muscle gain, maintenance, or general fitness)",
  experienceLevel: "Training experience (beginner, intermediate, or advanced)",
  equipment: "Equipment you have (or say bodyweight only)",
  injuries: "Any injuries to work around (or say none)",
};

function buildFollowUpReply(acknowledgment: string, missing: readonly string[]): string {
  const labels = missing.slice(0, 2).map((f) => FIELD_LABELS[f as (typeof REQUIRED_FIELDS)[number]]);
  return formatIntakeFollowUp(acknowledgment, labels);
}

// OpenAI's structured-output mode requires every property to be present in
// the schema (no .optional()) but allows .nullable() -- null is how the
// model tells us "not stated", which we filter out before merging so we
// never clobber a previously-saved field with null.
const ExtractionSchema = z.object({
  extracted: z.object({
    name: z.string().nullable(),
    sexAtBirth: z.enum(["male", "female"]).nullable(),
    age: z.number().int().min(13).max(100).nullable(),
    heightCm: z.number().min(100).max(250).nullable(),
    startingWeightKg: z.number().min(30).max(300).nullable(),
    activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).nullable(),
    primaryGoal: z.enum(["fat_loss", "muscle_gain", "maintenance", "general_fitness"]).nullable(),
    experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
    equipment: z.array(z.enum(EQUIPMENT_OPTIONS)).nullable(),
    injuries: z.array(z.enum(INJURY_OPTIONS)).nullable(),
    dietaryPreferences: z.array(z.string()).nullable(),
  }),
  // Deliberately NOT "assistantReply" -- the model only writes a short
  // acknowledgment of what it just learned. Whether intake is complete, and
  // what to ask for next, is decided and phrased entirely by backend code
  // in buildFollowUpReply below. See the bug this fixed: gpt-4o-mini would
  // sometimes decide on its own that it had "everything it needed" and tell
  // the user their plan was generating, even when a required field (e.g.
  // sexAtBirth, which it was reluctant to press on) was never actually
  // asked -- silently stalling the conversation forever with a false
  // "generating now" message. Completion is now a pure function of
  // `missingAfter`, never the model's opinion.
  acknowledgment: z.string(),
});

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

// Filters out both `null` (the model's explicit "not stated" signal) AND
// empty string (seen in practice: gpt-4o-mini sometimes returns "" for
// `name` instead of null when the client never gave one, despite the
// schema/prompt asking for null). Without this, an empty string gets
// merged into the profile as if it were a real answer, permanently
// bypassing isMissing()'s check and the field is never asked for again --
// this is exactly what caused the app to skip asking for a name entirely.
function dropNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== "")) as Partial<T>;
}

function buildSystemPrompt(missing: string[]): string {
  return [
    "You are the intake assistant for adaptcoach, a fitness coaching app.",
    "Extract any of the target fields the client has clearly stated anywhere in the conversation so far. Never guess or invent a value that wasn't stated.",
    `Normalize equipment strictly to this vocabulary: ${EQUIPMENT_OPTIONS.join(", ")}. If they say they have no equipment, use ["bodyweight"].`,
    `Normalize injuries strictly to this vocabulary: ${INJURY_OPTIONS.join(", ")}. If they explicitly say they have no injuries, return an empty array (this is different from not having discussed it at all -- only return [] if they were actually asked or volunteered that they have none).`,
    "IMPORTANT, equipment and injuries specifically: these two fields must be treated the same as any other unstated",
    "field -- return null for whichever of them the client hasn't actually brought up yet, even if other fields",
    "(like training experience, or general fitness talk) might tempt you to infer one. 'I'm a beginner' or 'I go to",
    "the gym a few times a week' is NOT a statement about equipment or injuries -- do not treat it as implying",
    "bodyweight-only or injury-free. Only fill these in from an explicit statement about gear owned/available or",
    "physical limitations/pain. When genuinely unmentioned, null is the correct and required answer, not a guess.",
    `For your own context only (never state this list to the client): fields not yet on file are ${missing.length > 0 ? missing.join(", ") : "none"}.`,
    "Also write `acknowledgment`: a short, warm, ONE-sentence acknowledgment of whatever the client just told you",
    "(or a friendly opener if this is their first message). Do NOT mention what's missing, what happens next, or",
    "whether their profile/plan is complete or ready -- that part is handled separately, after your response.",
  ].join("\n");
}

export async function intakeNode(state: AgentStateType): Promise<AgentStateUpdate> {
  // Email identity is established by the frontend before chat starts (a
  // dedicated "enter your email" step, not conversational extraction --
  // parsing emails out of free text is unnecessary risk for zero benefit).
  if (!state.clientEmail) {
    return {
      taskPlan: withStepStatus(state.taskPlan, "extract-fields", "skipped"),
      assistantReply: joinSections(
        "What's your email?",
        "I'll use it to save your profile and remember you next time."
      ),
    };
  }

  const knownBefore: Record<string, unknown> = { ...state.clientProfile };
  const missingBefore = REQUIRED_FIELDS.filter((field) => isMissing(knownBefore[field]));

  const model = createGpt4oMini().withStructuredOutput(ExtractionSchema, { name: "intake_extraction" });
  const result = await model.invoke([
    { role: "system", content: buildSystemPrompt(missingBefore) },
    ...state.messages,
  ]);

  const extracted = dropNulls(result.extracted) as ClientProfileDraft;

  // Always treat the row saveClientProfile hands back as ground truth --
  // it has the real id (needed by clientId for everything downstream) even
  // if this is the very first message for a brand-new client.
  let profile = await saveClientProfile(state.clientEmail, extracted);

  const knownAfter: Record<string, unknown> = { ...profile };
  const missingAfter = REQUIRED_FIELDS.filter((field) => isMissing(knownAfter[field]));
  const intakeComplete = missingAfter.length === 0;

  if (intakeComplete) {
    profile = await saveClientProfile(state.clientEmail, { onboardingStatus: "active" });
  }

  let taskPlan = withStepStatus(state.taskPlan, "extract-fields", "done");
  taskPlan = withStepStatus(taskPlan, "save-profile", "done");
  if (intakeComplete) {
    taskPlan = appendSteps(taskPlan, buildGenerationSteps(["nutrition", "training"]));
  }

  return {
    taskPlan,
    clientProfile: profile,
    clientId: profile.id,
    pendingProfileFields: extracted,
    missingProfileFields: missingAfter,
    intakeComplete,
    specialistsNeeded: intakeComplete ? ["nutrition", "training"] : [],
    // Transient if intakeComplete -- mergePlan overwrites this with the real
    // "your plan is ready" message before the request ends, so the user
    // never actually sees this one in that case.
    assistantReply: intakeComplete
      ? joinSections(result.acknowledgment, "That's everything I need — building your personalized plan now...")
      : buildFollowUpReply(result.acknowledgment, missingAfter),
  };
}
