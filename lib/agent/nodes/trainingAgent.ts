import type { AgentStateType, AgentStateUpdate } from "../state";
import { withStepStatus } from "../taskPlanSteps";
import { runTrainingSubagent } from "../subagents";

/** Delegates to the training subagent. */
export async function trainingAgentNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const profile = state.clientProfile;
  if (!profile) {
    return { taskPlan: withStepStatus(state.taskPlan, "build-workout", "skipped") };
  }

  const missedSessions = state.checkinResult?.signalsDetected.includes("missed_sessions") ?? false;

  const task = [
    `Client equipment: ${JSON.stringify(profile.equipment ?? [])}.`,
    `Injuries: ${JSON.stringify(profile.injuries ?? [])}.`,
    `Experience: ${profile.experienceLevel}.`,
    missedSessions
      ? "A missed-sessions pattern was detected. Call generate_workout_plan with missedSessionsAdjustment=true " +
        "(shortens the week and lowers sets). Explain that the plan was simplified for consistency."
      : "This is their initial plan -- build it now with missedSessionsAdjustment=false or omit that flag.",
  ].join(" ");

  const workoutPlanDraft = await runTrainingSubagent(task);

  return {
    taskPlan: withStepStatus(state.taskPlan, "build-workout", "done"),
    workoutPlanDraft,
    guardrailWarnings: workoutPlanDraft?.warnings ?? [],
  };
}
