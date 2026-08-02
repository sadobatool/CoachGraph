import { getRecentCheckins, insertCheckin } from "@/lib/supabase/queries";
import type { CheckinInput, CheckinRecord, PrimaryGoal, SignalType } from "@/types";

// Below this adherence percentage on a single check-in, flag immediately.
const SEVERE_ADHERENCE_THRESHOLD = 50;
// Below this percentage on two check-ins in a row, flag as a sustained pattern.
const SUSTAINED_ADHERENCE_THRESHOLD = 70;
// Need this many check-ins (including the new one) before a weight trend is meaningful.
const PLATEAU_WINDOW = 3;
// Less than this % bodyweight change across the window counts as "no real movement".
const PLATEAU_THRESHOLD_PCT = 0.005;

/**
 * Plain code -- no LLM. Given the current check-in and the client's most
 * recent adherence figure, decides whether "missed sessions" fires.
 */
export function detectMissedSessions(currentAdherencePct: number | null, previousAdherencePct: number | null): boolean {
  if (currentAdherencePct === null) return false;
  if (currentAdherencePct < SEVERE_ADHERENCE_THRESHOLD) return true;
  return (
    currentAdherencePct < SUSTAINED_ADHERENCE_THRESHOLD &&
    previousAdherencePct !== null &&
    previousAdherencePct < SUSTAINED_ADHERENCE_THRESHOLD
  );
}

/**
 * Plain code -- no LLM. `weights` must be ordered oldest -> newest and
 * include the new check-in's weight as the last element. Plateau only
 * applies to goals where weight is meant to move in a direction; a
 * maintenance/general_fitness client isn't "plateaued" by a stable weight.
 */
export function detectPlateau(primaryGoal: PrimaryGoal, weights: number[]): boolean {
  if (weights.length < PLATEAU_WINDOW) return false;
  if (primaryGoal !== "fat_loss" && primaryGoal !== "muscle_gain") return false;

  const first = weights[0];
  const last = weights[weights.length - 1];
  const pctChange = (last - first) / first;

  if (primaryGoal === "fat_loss") return pctChange > -PLATEAU_THRESHOLD_PCT;
  return pctChange < PLATEAU_THRESHOLD_PCT;
}

export interface LogCheckinParams {
  clientId: string;
  primaryGoal: PrimaryGoal;
  input: CheckinInput;
}

export interface LogCheckinResult {
  checkin: CheckinRecord;
  signalsDetected: SignalType[];
  needsLlmAdjustment: boolean;
}

/**
 * The core deterministic gate described in the spec: runs plateau/adherence
 * detection in plain code and only sets needsLlmAdjustment when a real
 * signal fires. The graph's conditional edge reads that boolean straight
 * off the returned checkin row -- it never asks an LLM to decide this.
 */
export async function logCheckin(params: LogCheckinParams): Promise<LogCheckinResult> {
  const { clientId, primaryGoal, input } = params;

  const recentCheckins = await getRecentCheckins(clientId, PLATEAU_WINDOW - 1);
  const previousAdherence = recentCheckins[0]?.adherencePct ?? null;

  const adherencePct = input.sessionsPlanned > 0 ? (input.sessionsCompleted / input.sessionsPlanned) * 100 : null;

  const weightHistory = [...recentCheckins]
    .reverse()
    .map((checkin) => checkin.weightKg)
    .concat(input.weightKg);

  const signalsDetected: SignalType[] = [];
  if (detectPlateau(primaryGoal, weightHistory)) signalsDetected.push("plateau");
  if (detectMissedSessions(adherencePct, previousAdherence)) signalsDetected.push("missed_sessions");

  const needsLlmAdjustment = signalsDetected.length > 0;

  const checkin = await insertCheckin(clientId, input, { adherencePct, signalsDetected, needsLlmAdjustment });

  return { checkin, signalsDetected, needsLlmAdjustment };
}
