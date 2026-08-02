import { ChatOpenAI } from "@langchain/openai";

/**
 * Two model tiers, matching the cost/quality tradeoff in the spec:
 *   - gpt4oMini: routing, classification, field extraction (cheap, fast,
 *     doesn't need deep reasoning)
 *   - gpt4o: plan generation and plan adjustment reasoning (the two places
 *     the LLM is actually allowed to run, per the harness design)
 */
export function createGpt4oMini(): ChatOpenAI {
  return new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 });
}

export function createGpt4o(): ChatOpenAI {
  return new ChatOpenAI({ model: "gpt-4o", temperature: 0.4 });
}
