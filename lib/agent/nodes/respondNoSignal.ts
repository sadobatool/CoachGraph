import { getLatestPlan } from "@/lib/supabase/queries";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { formatCheckinLoggedReply } from "../replies";

/** Templated no-signal check-in reply (no LLM). */
export async function respondNoSignalNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const checkin = state.checkinResult?.checkin;

  if (!checkin) {
    return {
      assistantReply: "Check-in saved ✓\n\nKeep going with your current plan.",
    };
  }

  const plan = state.clientId ? await getLatestPlan(state.clientId) : null;

  return {
    assistantReply: formatCheckinLoggedReply(checkin, plan?.nutritionPlan ?? null),
  };
}
