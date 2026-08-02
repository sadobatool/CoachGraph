import { StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { AgentState, type AgentStateType } from "./state";
import { routerNode } from "./nodes/router";
import { intakeNode } from "./nodes/intake";
import { checkinNode } from "./nodes/checkin";
import { respondNoSignalNode } from "./nodes/respondNoSignal";
import { nutritionAgentNode } from "./nodes/nutritionAgent";
import { trainingAgentNode } from "./nodes/trainingAgent";
import { mergePlanNode } from "./nodes/mergePlan";
import { specialistToNodeName } from "./specialists";

const NODE_NAMES = ["nutritionAgent", "trainingAgent"] as const;

const graph = new StateGraph(AgentState)
  .addNode("router", routerNode)
  .addNode("intake", intakeNode)
  .addNode("checkin", checkinNode)
  .addNode("respondNoSignal", respondNoSignalNode)
  .addNode("nutritionAgent", nutritionAgentNode)
  .addNode("trainingAgent", trainingAgentNode)
  .addNode("mergePlan", mergePlanNode)

  .addEdge(START, "router")

  .addConditionalEdges("router", (state: AgentStateType) => (state.flow === "checkin" ? "checkin" : "intake"), [
    "intake",
    "checkin",
  ])

  // intake -> fan out to whichever specialists are needed once complete, else END (wait for next turn)
  .addConditionalEdges(
    "intake",
    (state: AgentStateType) => (state.intakeComplete ? state.specialistsNeeded.map(specialistToNodeName) : END),
    [...NODE_NAMES, END]
  )

  // checkin -> fan out only if log_checkin's deterministic code set needsLlmAdjustment.
  // No checkinResult at all means checkinNode declined to log anything this
  // turn (the message didn't actually contain real check-in data) -- go
  // straight to END so its own deterministic "I still need X" reply stands,
  // rather than letting respondNoSignal overwrite it with a generic
  // "logged!" message for a check-in that was never recorded.
  .addConditionalEdges(
    "checkin",
    (state: AgentStateType) => {
      if (!state.checkinResult) return END;
      return state.checkinResult.needsLlmAdjustment ? state.specialistsNeeded.map(specialistToNodeName) : "respondNoSignal";
    },
    [...NODE_NAMES, "respondNoSignal", END]
  )

  .addEdge("nutritionAgent", "mergePlan")
  .addEdge("trainingAgent", "mergePlan")
  .addEdge("respondNoSignal", END)
  .addEdge("mergePlan", END);

export const compiledGraph = graph.compile();

export interface RunAgentInput {
  clientEmail: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Single entry point the API route calls. Decoupled from the web layer on
 * purpose -- the route just consumes this async generator and forwards
 * each state snapshot to the frontend as an SSE event. No checkpointer:
 * the full message history comes in on `input.messages` every call, and
 * profile/plan state is reloaded fresh from Supabase each run (via tools
 * added in the next step), so a plain stateless request/response cycle is
 * enough even across cold starts on Vercel.
 */
export async function* runAgent(input: RunAgentInput): AsyncGenerator<AgentStateType, void, unknown> {
  const messages = input.messages.map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)));

  const initialState: Partial<AgentStateType> = {
    messages,
    clientEmail: input.clientEmail,
  };

  const stream = await compiledGraph.stream(initialState, { streamMode: "values" });

  for await (const state of stream) {
    yield state as AgentStateType;
  }
}
