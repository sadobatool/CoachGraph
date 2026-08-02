"use client";

import { CheckCircle2, Circle, Loader2, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStep } from "@/types";

interface AgentPlanTrackerProps {
  taskPlan: TaskStep[];
  /** While true, the first non-terminal step is rendered as "in progress"
   * (spinner). This is a real reflection of stream cadence, not a fake
   * animation: LangGraph only emits a state snapshot once a node finishes,
   * so the step immediately after the last "done" one IS the one the graph
   * is currently executing between this snapshot and the next. */
  isStreaming: boolean;
}

export function AgentPlanTracker({ taskPlan, isStreaming }: AgentPlanTrackerProps) {
  if (taskPlan.length === 0) {
    if (!isStreaming) return null;
    return (
      <div className="flex gap-3 sm:gap-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          AC
        </div>
        <div className="flex items-center gap-2 pt-1.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Thinking...
        </div>
      </div>
    );
  }

  const activeIndex = isStreaming ? taskPlan.findIndex((step) => step.status === "pending") : -1;

  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
        AC
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Working on it</p>
        <ul className="space-y-1.5">
          {taskPlan.map((step, index) => {
            const isActive = index === activeIndex;
            const isDone = step.status === "done";
            const isSkipped = step.status === "skipped";

            return (
              <li key={step.id} className="flex items-center gap-2 text-sm">
                {isDone && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
                {isSkipped && <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                {!isDone && !isSkipped && isActive && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                )}
                {!isDone && !isSkipped && !isActive && (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                )}
                <span
                  className={cn(
                    isDone && "text-foreground",
                    isActive && "font-medium text-foreground",
                    !isDone && !isActive && "text-muted-foreground",
                    isSkipped && "line-through opacity-60"
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
