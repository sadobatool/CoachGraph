import type { TaskStep } from "@/types";
import type { AgentFlow } from "./state";

/**
 * Seed task lists for the two flows the router can pick directly. This is
 * what makes the frontend's AgentPlanTracker a real reflection of graph
 * state: the router node picks one of these lists, and every downstream
 * node flips its own step to "done" as it finishes.
 */
const FLOW_STEPS: Record<"intake" | "checkin", TaskStep[]> = {
  intake: [
    { id: "extract-fields", label: "Reading your answers", status: "pending" },
    { id: "save-profile", label: "Saving your profile", status: "pending" },
  ],
  checkin: [
    { id: "load-history", label: "Loading your history", status: "pending" },
    { id: "record-checkin", label: "Recording your check-in", status: "pending" },
    { id: "detect-signals", label: "Detecting patterns", status: "pending" },
  ],
};

export function buildTaskPlan(flow: "intake" | "checkin"): TaskStep[] {
  return FLOW_STEPS[flow].map((step) => ({ ...step }));
}

/**
 * Appended dynamically once we know which specialist(s) a run actually
 * needs -- either because intake just completed (always both) or because
 * log_checkin's deterministic detection fired specific signals (maybe just
 * one). This is why the task list can't be a static map for this part: the
 * steps genuinely aren't knowable until that decision is made.
 */
export function buildGenerationSteps(specialists: Array<"nutrition" | "training">): TaskStep[] {
  const steps: TaskStep[] = [];
  if (specialists.includes("nutrition")) {
    steps.push({ id: "calc-nutrition", label: "Calculating nutrition targets", status: "pending" });
  }
  if (specialists.includes("training")) {
    steps.push({ id: "build-workout", label: "Assembling your workout plan", status: "pending" });
  }
  steps.push({ id: "save-plan", label: "Saving your plan", status: "pending" });
  return steps;
}

export function withStepStatus(
  taskPlan: TaskStep[],
  stepId: string,
  status: TaskStep["status"]
): TaskStep[] {
  return taskPlan.map((step) => (step.id === stepId ? { ...step, status } : step));
}

export function appendSteps(taskPlan: TaskStep[], steps: TaskStep[]): TaskStep[] {
  const existingIds = new Set(taskPlan.map((s) => s.id));
  const toAdd = steps.filter((s) => !existingIds.has(s.id));
  return [...taskPlan, ...toAdd];
}

export function mergeTaskPlans(a: TaskStep[], b: TaskStep[]): TaskStep[] {
  // Used when two parallel sub-agent branches (nutrition + training) each
  // return their own taskPlan update in the same superstep -- keep the
  // furthest-along status per step id rather than letting one branch clobber
  // the other's progress.
  const rank: Record<TaskStep["status"], number> = { pending: 0, in_progress: 1, skipped: 1, done: 2 };
  const byId = new Map<string, TaskStep>();
  for (const step of [...a, ...b]) {
    const existing = byId.get(step.id);
    if (!existing || rank[step.status] >= rank[existing.status]) {
      byId.set(step.id, step);
    }
  }
  return Array.from(byId.values());
}
