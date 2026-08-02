import type { TaskStep } from "@/types";
import type { AgentFlow } from "./state";

/** Seed steps for intake / checkin flows. */
const FLOW_STEPS: Record<"intake" | "checkin", TaskStep[]> = {
  intake: [
    { id: "plan", label: "Planning workflow", status: "pending" },
    { id: "extract-fields", label: "Reading your answers", status: "pending" },
    { id: "save-profile", label: "Saving your profile", status: "pending" },
  ],
  checkin: [
    { id: "plan", label: "Planning workflow", status: "pending" },
    { id: "load-history", label: "Loading your history", status: "pending" },
    { id: "record-checkin", label: "Recording your check-in", status: "pending" },
    { id: "detect-signals", label: "Detecting patterns", status: "pending" },
  ],
};

export function buildTaskPlan(flow: "intake" | "checkin"): TaskStep[] {
  return FLOW_STEPS[flow].map((step) => ({ ...step }));
}

/** Specialist steps appended once we know who must run. */
export function buildGenerationSteps(specialists: Array<"nutrition" | "training">): TaskStep[] {
  const steps: TaskStep[] = [];
  if (specialists.includes("nutrition")) {
    steps.push({ id: "calc-nutrition", label: "Nutrition subagent", status: "pending" });
  }
  if (specialists.includes("training")) {
    steps.push({ id: "build-workout", label: "Training subagent", status: "pending" });
  }
  steps.push({ id: "save-plan", label: "Merging & saving plan", status: "pending" });
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
  // Keep furthest status when parallel branches update the same plan
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
