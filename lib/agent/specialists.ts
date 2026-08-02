import type { SignalType } from "@/types";

export type Specialist = "nutrition" | "training";

/** Map signals → specialists (plateau→nutrition, missed_sessions→training). */
export function specialistsForSignals(signals: SignalType[]): Specialist[] {
  const specialists = new Set<Specialist>();
  if (signals.includes("plateau")) specialists.add("nutrition");
  if (signals.includes("missed_sessions")) specialists.add("training");
  return specialists.size > 0 ? Array.from(specialists) : ["nutrition", "training"];
}

export function specialistToNodeName(specialist: Specialist): "nutritionAgent" | "trainingAgent" {
  return specialist === "nutrition" ? "nutritionAgent" : "trainingAgent";
}
