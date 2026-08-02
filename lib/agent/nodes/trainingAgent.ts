import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { createGpt4o } from "@/lib/openai/client";
import { generateWorkoutPlanTool } from "../tools/generateWorkoutPlan";
import type { AgentStateType, AgentStateUpdate } from "../state";
import { withStepStatus } from "../taskPlanSteps";
import type { WorkoutPlanDraft } from "@/types";

const SYSTEM_PROMPT = [
  "You are the training specialist on a fitness coaching team. You only handle exercise selection and workout",
  "structure -- nutrition is a different specialist's job and you have no tool for it.",
  "",
  "Always call generate_workout_plan to get the actual exercise selection -- never invent exercises yourself.",
  'Pass the client\'s real equipment and injuries exactly as given. If the tool result includes "warnings", you',
  "MUST clearly mention them to the client in your explanation -- never omit or soften them away, since they",
  "describe a real safety limitation (e.g. an injury that rules out most exercises for a muscle group).",
  "",
  "After calling the tool, write a short (2-3 sentence) friendly explanation a non-expert can understand.",
  "Avoid jargon where possible. If this is an adjustment, say clearly what changed and why.",
  "This text is shown directly to the client.",
].join("\n");

/**
 * Training specialist sub-agent: its own system prompt, its own tool
 * (generate_workout_plan), and nothing else -- it cannot see or call
 * calculate_nutrition_targets.
 */
export async function trainingAgentNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const profile = state.clientProfile;
  if (!profile) {
    return { taskPlan: withStepStatus(state.taskPlan, "build-workout", "skipped") };
  }

  const missedSessions = state.checkinResult?.signalsDetected.includes("missed_sessions") ?? false;

  const contextMessage = new HumanMessage(
    `Client equipment: ${JSON.stringify(profile.equipment ?? [])}. Injuries: ${JSON.stringify(
      profile.injuries ?? []
    )}. Experience: ${profile.experienceLevel}. ${
      missedSessions
        ? "A missed-sessions pattern was detected. Call generate_workout_plan with missedSessionsAdjustment=true " +
          "(this shortens the week and lowers sets). In your explanation, say the plan was simplified so it's " +
          "easier to complete consistently -- frequency/consistency is the priority right now."
        : "This is their initial plan -- build it now with missedSessionsAdjustment=false or omit that flag."
    }`
  );

  const model = createGpt4o().bindTools([generateWorkoutPlanTool]);
  const messages: Array<SystemMessage | HumanMessage | ToolMessage | Awaited<ReturnType<typeof model.invoke>>> = [
    new SystemMessage(SYSTEM_PROMPT),
    contextMessage,
  ];

  let response = await model.invoke(messages);
  let workoutPlanDraft: WorkoutPlanDraft | null = null;

  for (let i = 0; i < 3 && response.tool_calls && response.tool_calls.length > 0; i++) {
    messages.push(response);
    for (const call of response.tool_calls) {
      const toolResult = (await generateWorkoutPlanTool.invoke(call.args as never)) as string;
      workoutPlanDraft = JSON.parse(toolResult) as WorkoutPlanDraft;
      messages.push(new ToolMessage({ content: toolResult, tool_call_id: call.id ?? "" }));
    }
    response = await model.invoke(messages);
  }

  // Mirrors nutritionAgentNode's handling of NutritionTargets.rationale --
  // without this, the model's explanation (including the required note
  // about missed-sessions adjustments) was silently discarded and never
  // shown to the client.
  if (workoutPlanDraft && typeof response.content === "string" && response.content.trim().length > 0) {
    workoutPlanDraft = { ...workoutPlanDraft, rationale: response.content };
  }

  return {
    taskPlan: withStepStatus(state.taskPlan, "build-workout", "done"),
    workoutPlanDraft,
    guardrailWarnings: workoutPlanDraft?.warnings ?? [],
  };
}
