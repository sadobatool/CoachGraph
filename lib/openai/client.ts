import { ChatOpenAI } from "@langchain/openai";

/** gpt-4o-mini = extract/route; gpt-4o = specialist reasoning. */
export function createGpt4oMini(): ChatOpenAI {
  return new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 });
}

export function createGpt4o(): ChatOpenAI {
  return new ChatOpenAI({ model: "gpt-4o", temperature: 0.4 });
}
