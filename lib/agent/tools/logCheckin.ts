import { getRecentCheckins, insertCheckin } from "@/lib/supabase/queries";
import type { CheckinInput, CheckinRecord, PrimaryGoal, SignalType } from "@/types";

const SEVERE_ADHERENCE_THRESHOLD = 50;
const SUSTAINED_ADHERENCE_THRESHOLD = 70;
const PLATEAU_WINDOW = 3;
const PLATEAU_THRESHOLD_PCT = 0.005;

/** Deterministic missed-sessions signal. */
export function detectMissedSessions(currentAdherencePct: number | null, previousAdherencePct: number | null): boolean {
  if (currentAdherencePct === null) return false;
  if (currentAdherencePct < SEVERE_ADHERENCE_THRESHOLD) return true;
  return (
    currentAdherencePct < SUSTAINED_ADHERENCE_THRESHOLD &&
    previousAdherencePct !== null &&
    previousAdherencePct < SUSTAINED_ADHERENCE_THRESHOLD
  );
}

/** Deterministic plateau signal. `weights` oldest → newest. */
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

/** Log check-in and set needsLlmAdjustment only when a signal fires. */
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
