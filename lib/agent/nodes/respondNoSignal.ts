import { getLatestPlan } from "@/lib/supabase/queries";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { formatCheckinLoggedReply } from "../replies";

/**
 * Templated response for the common case: a check-in with no signal.
 * Deliberately NOT an LLM call -- this is the concrete mechanism behind
 * "only call the LLM when a real signal fires." Most check-ins hit this
 * node and cost $0 in model usage.
 */
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
