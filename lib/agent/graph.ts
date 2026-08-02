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
import { DEEP_AGENT_HARNESS } from "./harness";

/** Outer LangGraph harness — see {@link DEEP_AGENT_HARNESS}. */
void DEEP_AGENT_HARNESS;

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

  // intake → specialists if complete, else END
  .addConditionalEdges(
    "intake",
    (state: AgentStateType) => (state.intakeComplete ? state.specialistsNeeded.map(specialistToNodeName) : END),
    [...NODE_NAMES, END]
  )

  // checkin → specialists only when needsLlmAdjustment
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

/** Stateless graph entry — history in `messages`, profile from Supabase. */
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
