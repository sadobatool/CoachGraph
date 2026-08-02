import type { SignalType } from "@/types";

export type Specialist = "nutrition" | "training";

/**
 * Deterministic mapping from detected signals to which specialist(s)
 * need to re-run. Plain code, not an LLM decision:
 *   - plateau            -> nutrition (re-run targets with adjusted deficit/surplus)
 *   - missed_sessions    -> training (reduce volume/frequency to match real adherence)
 *   - both               -> both specialists run in parallel branches
 */
export function specialistsForSignals(signals: SignalType[]): Specialist[] {
  const specialists = new Set<Specialist>();
  if (signals.includes("plateau")) specialists.add("nutrition");
  if (signals.includes("missed_sessions")) specialists.add("training");
  return specialists.size > 0 ? Array.from(specialists) : ["nutrition", "training"];
}

export function specialistToNodeName(specialist: Specialist): "nutritionAgent" | "trainingAgent" {
  return specialist === "nutrition" ? "nutritionAgent" : "trainingAgent";
}
