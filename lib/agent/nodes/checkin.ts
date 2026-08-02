import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { withStepStatus, buildGenerationSteps, appendSteps } from "../taskPlanSteps";
import { logCheckin } from "../tools/logCheckin";
import { specialistsForSignals } from "../specialists";
import { createGpt4oMini } from "@/lib/openai/client";
import { getLatestPlan } from "@/lib/supabase/queries";
import { formatCheckinMissingReply, joinSections } from "../replies";
import type { CheckinInput } from "@/types";

// Signal fields stay nullable — inventing numbers would false-fire detectors
const CheckinExtractionSchema = z.object({
  weightKg: z.number().min(30).max(300).nullable(),
  sessionsCompleted: z.number().int().min(0).nullable(),
  sessionsPlanned: z.number().int().min(0).nullable(),
  sorenessLevel: z.number().int().min(1).max(5).nullable(),
  energyLevel: z.number().int().min(1).max(5).nullable(),
  notes: z.string().nullable(),
});

type ExtractedCheckin = z.infer<typeof CheckinExtractionSchema>;

const SYSTEM_PROMPT = [
  "You are extracting check-in data for a fitness coaching app from the client's recent message(s).",
  "They may answer across multiple short messages — merge everything they stated.",
  "If two messages disagree, prefer the newest one.",
  "Extract: current weight in kg (convert from lb if needed, 1 lb = 0.453592 kg), sessions completed this week,",
  "sessions planned this week, soreness (1-5 scale), energy (1-5 scale), and any free-text notes.",
  "Only extract a value if the client actually stated it (directly or via clear context).",
  "If a field truly was not mentioned, return null for it -- never invent a number.",
  "",
  'Zero workouts: phrases like "i missed workout(s)", "haven\'t done anything", "did nothing",',
  '"didn\'t work out", "no workouts", "skipped all" mean sessionsCompleted = 0.',
  "",
  'All workouts: "hit all 3", "did all my workouts" means sessionsCompleted and sessionsPlanned are that count.',
].join("\n");

const DEFAULT_SORENESS = 3;

const COMPLETED_ALL_SESSIONS_PATTERN = /\b(did|hit|made|completed|finished|nailed)\s+(all|every)\b/i;
const NEGATION_OR_PARTIAL_PATTERN = /\b(not|n't|never|missed?|skip(ped)?|only|except|besides|but|however|partially)\b/i;

const ZERO_WORKOUTS_PATTERN =
  /\b(missed?\s+(my\s+)?workouts?|haven'?t\s+done\s+anything|have\s+not\s+done\s+anything|did\s+nothing|didn'?t\s+do\s+anything|didn'?t\s+work\s*out|no\s+workouts?|skipped\s+(all|every)|zero\s+workouts?)\b/i;

function messageText(message: BaseMessage): string {
  return typeof message.content === "string" ? message.content : "";
}

function isHumanMessage(message: BaseMessage): boolean {
  return message instanceof HumanMessage || message._getType() === "human";
}

function isAiMessage(message: BaseMessage): boolean {
  return message instanceof AIMessage || message._getType() === "ai";
}

function isCompletedCheckinOrPlanReply(text: string): boolean {
  return (
    /check-in saved/i.test(text) ||
    /updated plan \(v\d+\)/i.test(text) ||
    /starter plan \(v\d+\)/i.test(text) ||
    /your plan is ready/i.test(text) ||
    /you're on track/i.test(text)
  );
}

/** Recent user texts for multi-turn check-ins; stop at prior plan/check-in reply. */
function recentUserTextsForCheckin(messages: BaseMessage[]): string[] {
  const texts: string[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const text = messageText(message);

    if (isHumanMessage(message)) {
      if (text.trim()) texts.unshift(text.trim());
      if (texts.length >= 5) break;
      continue;
    }

    if (isAiMessage(message) && isCompletedCheckinOrPlanReply(text)) {
      break;
    }
  }

  return texts.length > 0 ? texts : [messageText(messages[messages.length - 1])].filter(Boolean);
}

function inferSessionsCompletedFromZeroWording(rawText: string, sessionsCompleted: number | null): number | null {
  if (sessionsCompleted !== null) return sessionsCompleted;
  return ZERO_WORKOUTS_PATTERN.test(rawText) ? 0 : sessionsCompleted;
}

function inferSessionsPlannedFromAllWording(
  rawText: string,
  sessionsCompleted: number | null,
  sessionsPlanned: number | null
): number | null {
  if (sessionsPlanned !== null || sessionsCompleted === null) return sessionsPlanned;
  if (NEGATION_OR_PARTIAL_PATTERN.test(rawText)) return sessionsPlanned;
  return COMPLETED_ALL_SESSIONS_PATTERN.test(rawText) ? sessionsCompleted : sessionsPlanned;
}

/** Default sessionsPlanned from active plan days/week when unstated. */
async function resolveSessionsPlanned(
  clientId: string,
  sessionsPlanned: number | null
): Promise<number | null> {
  if (sessionsPlanned !== null) return sessionsPlanned;
  const plan = await getLatestPlan(clientId);
  const daysPerWeek = plan?.workoutPlan?.daysPerWeek;
  return typeof daysPerWeek === "number" && daysPerWeek > 0 ? daysPerWeek : null;
}

function missingCoreFields(extracted: {
  weightKg: number | null;
  sessionsCompleted: number | null;
  sessionsPlanned: number | null;
}): string[] {
  const missing: string[] = [];
  if (extracted.weightKg === null) missing.push("Your current weight");
  if (extracted.sessionsCompleted === null) missing.push("How many workouts you completed this week");
  if (extracted.sessionsPlanned === null) missing.push("How many workouts were planned this week");
  return missing;
}

/** Extract check-in fields; signal gating stays in logCheckin. */
export async function checkinNode(state: AgentStateType): Promise<AgentStateUpdate> {
  let taskPlan = withStepStatus(state.taskPlan, "load-history", "done");

  if (!state.clientId || !state.clientProfile) {
    return {
      taskPlan: withStepStatus(taskPlan, "record-checkin", "skipped"),
      assistantReply: joinSections(
        "I couldn't find your profile.",
        "Can you confirm the email you signed up with?"
      ),
    };
  }

  const userTexts = recentUserTextsForCheckin(state.messages);
  const combinedText = userTexts.join("\n");

  const model = createGpt4oMini().withStructuredOutput(CheckinExtractionSchema, { name: "checkin_extraction" });
  const rawExtracted: ExtractedCheckin = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        userTexts.length === 1
          ? userTexts[0]
          : `Client messages (oldest → newest):\n${userTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    },
  ]);

  const sessionsCompleted = inferSessionsCompletedFromZeroWording(combinedText, rawExtracted.sessionsCompleted);
  const fromAllWording = inferSessionsPlannedFromAllWording(
    combinedText,
    sessionsCompleted,
    rawExtracted.sessionsPlanned
  );
  const sessionsPlanned = await resolveSessionsPlanned(state.clientId, fromAllWording);

  const extracted = {
    ...rawExtracted,
    sessionsCompleted,
    sessionsPlanned,
  };

  const missing = missingCoreFields(extracted);
  if (missing.length > 0) {
    taskPlan = withStepStatus(taskPlan, "record-checkin", "skipped");
    taskPlan = withStepStatus(taskPlan, "detect-signals", "skipped");
    return {
      taskPlan,
      assistantReply: formatCheckinMissingReply(missing, {
        knownCompleted: extracted.sessionsCompleted,
      }),
    };
  }

  const input: CheckinInput = {
    weightKg: extracted.weightKg as number,
    sessionsCompleted: extracted.sessionsCompleted as number,
    sessionsPlanned: extracted.sessionsPlanned as number,
    sorenessLevel: extracted.sorenessLevel ?? DEFAULT_SORENESS,
    energyLevel: extracted.energyLevel ?? undefined,
    notes: extracted.notes ?? undefined,
  };

  const { checkin, signalsDetected, needsLlmAdjustment } = await logCheckin({
    clientId: state.clientId,
    primaryGoal: state.clientProfile.primaryGoal,
    input,
  });

  taskPlan = withStepStatus(taskPlan, "record-checkin", "done");
  taskPlan = withStepStatus(taskPlan, "detect-signals", "done");

  if (needsLlmAdjustment) {
    const specialists = specialistsForSignals(signalsDetected);
    taskPlan = appendSteps(taskPlan, buildGenerationSteps(specialists));
    return {
      taskPlan,
      checkinResult: { checkin, signalsDetected, needsLlmAdjustment },
      specialistsNeeded: specialists,
    };
  }

  return {
    taskPlan,
    checkinResult: { checkin, signalsDetected, needsLlmAdjustment },
    specialistsNeeded: [],
  };
}
