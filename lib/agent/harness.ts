/** LangGraph control plane + ReAct specialist subagents. */
export const DEEP_AGENT_HARNESS = {
  name: "AdaptCoach Deep Agent Harness",
  pattern: "LangGraph control plane + ReAct specialist subagents",
  planner: "nodes/router.ts",
  subagents: ["nutrition-subagent", "training-subagent"],
  domainTools: [
    "get_client_profile / save_client_profile",
    "calculate_nutrition_targets",
    "generate_workout_plan",
    "log_checkin (deterministic signal gate)",
  ],
  safetyGates: [
    "onboarding_status routes intake vs check-in",
    "needsLlmAdjustment only true when plateau or missed_sessions fires in code",
    "subagents cannot invent exercises or calorie math -- tools are required",
  ],
} as const;
