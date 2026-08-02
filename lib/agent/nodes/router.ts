import type { AgentStateType, AgentStateUpdate } from "../state";
import { buildTaskPlan, withStepStatus } from "../taskPlanSteps";
import { getClientProfile } from "../tools/getClientProfile";

/** Routes intake vs checkin from onboarding_status; seeds task plan. */
export async function routerNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const clientProfile = state.clientEmail ? await getClientProfile(state.clientEmail) : null;
  const flow = clientProfile?.onboardingStatus === "active" ? "checkin" : "intake";

  const taskPlan = withStepStatus(buildTaskPlan(flow), "plan", "done");

  return {
    clientProfile,
    clientId: clientProfile?.id ?? null,
    flow,
    taskPlan,
  };
}
