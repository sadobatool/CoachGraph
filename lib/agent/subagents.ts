import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { createGpt4o } from "@/lib/openai/client";
import { calculateNutritionTargetsTool } from "./tools/calculateNutritionTargets";
import { generateWorkoutPlanTool } from "./tools/generateWorkoutPlan";
import type { NutritionTargets, WorkoutPlanDraft } from "@/types";

/** ReAct specialist subagents with isolated tools. */

const NUTRITION_PROMPT = [
  "You are the nutrition specialist subagent on the AdaptCoach deep agent harness.",
  "You ONLY handle calorie and macro targets -- exercise selection is another subagent's job.",
  "",
  "Always call calculate_nutrition_targets to get the numbers -- never estimate calories or macros yourself.",
  "If the context gives you an exact calorieAdjustmentPct to use, pass that value exactly.",
  "If adjusting for a plateau without an exact value, pass an appropriate calorieAdjustmentPct",
  "(e.g. -0.10 for stalled fat_loss, +0.05 for stalled muscle_gain).",
  "",
  "After the tool returns, write a short (2-3 sentence) friendly explanation for the client.",
].join("\n");

const TRAINING_PROMPT = [
  "You are the training specialist subagent on the AdaptCoach deep agent harness.",
  "You ONLY handle exercise selection and workout structure -- nutrition is another subagent's job.",
  "",
  "Always call generate_workout_plan -- never invent exercises yourself.",
  "Pass the client's real equipment and injuries exactly as given.",
  "If missedSessionsAdjustment is requested, pass missedSessionsAdjustment=true.",
  "If the tool result includes warnings, you MUST mention them clearly in your explanation.",
  "",
  "After the tool returns, write a short (2-3 sentence) friendly explanation for the client.",
].join("\n");

let nutritionSubagent: ReturnType<typeof createReactAgent> | null = null;
let trainingSubagent: ReturnType<typeof createReactAgent> | null = null;

function getNutritionSubagent() {
  if (!nutritionSubagent) {
    nutritionSubagent = createReactAgent({
      llm: createGpt4o(),
      tools: [calculateNutritionTargetsTool],
      prompt: NUTRITION_PROMPT,
      name: "nutrition-subagent",
    });
  }
  return nutritionSubagent;
}

function getTrainingSubagent() {
  if (!trainingSubagent) {
    trainingSubagent = createReactAgent({
      llm: createGpt4o(),
      tools: [generateWorkoutPlanTool],
      prompt: TRAINING_PROMPT,
      name: "training-subagent",
    });
  }
  return trainingSubagent;
}

function isToolMessage(message: BaseMessage): boolean {
  return message instanceof ToolMessage || message._getType() === "tool";
}

function isAiMessage(message: BaseMessage): boolean {
  return message instanceof AIMessage || message._getType() === "ai";
}

function lastToolJson(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!isToolMessage(message)) continue;
    return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
  }
  return null;
}

function lastAiText(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!isAiMessage(message)) continue;
    if (typeof message.content === "string" && message.content.trim()) return message.content.trim();
  }
  return null;
}

export async function runNutritionSubagent(task: string): Promise<NutritionTargets | null> {
  const result = await getNutritionSubagent().invoke({
    messages: [new HumanMessage(task)],
  });

  const toolJson = lastToolJson(result.messages as BaseMessage[]);
  if (!toolJson) return null;

  const targets = JSON.parse(toolJson) as NutritionTargets;
  const rationale = lastAiText(result.messages as BaseMessage[]);
  return rationale ? { ...targets, rationale } : targets;
}

export async function runTrainingSubagent(task: string): Promise<WorkoutPlanDraft | null> {
  const result = await getTrainingSubagent().invoke({
    messages: [new HumanMessage(task)],
  });

  const toolJson = lastToolJson(result.messages as BaseMessage[]);
  if (!toolJson) return null;

  const draft = JSON.parse(toolJson) as WorkoutPlanDraft;
  const rationale = lastAiText(result.messages as BaseMessage[]);
  return rationale ? { ...draft, rationale } : draft;
}
