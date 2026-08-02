import type { AgentStateType, AgentStateUpdate } from "../state";
import { buildTaskPlan } from "../taskPlanSteps";
import { getClientProfile } from "../tools/getClientProfile";

/**
 * Entry point / "planning node". Whether this is a new vs. returning
 * client is fully deterministic (onboarding_status, loaded fresh from
 * Supabase every turn) -- there's no ambiguity for an LLM to resolve here,
 * so no model call happens in this node. gpt-4o-mini earns its keep one
 * level down, inside intake/checkin, extracting structured fields from
 * free text -- that's the actual classification work in this harness.
 */
export async function routerNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const clientProfile = state.clientEmail ? await getClientProfile(state.clientEmail) : null;
  const flow = clientProfile?.onboardingStatus === "active" ? "checkin" : "intake";

  return {
    clientProfile,
    clientId: clientProfile?.id ?? null,
    flow,
    taskPlan: buildTaskPlan(flow),
  };
}
