import { runAgent } from "@/lib/agent/graph";
import type { AgentStreamEvent } from "@/types";

export const runtime = "nodejs"; // Node required for LangGraph / SDKs

interface AgentRequestBody {
  clientEmail: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/** NDJSON stream of runAgent() state snapshots. */
export async function POST(req: Request) {
  let body: AgentRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages must be a non-empty array" }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        for await (const state of runAgent({ clientEmail: body.clientEmail, messages: body.messages })) {
          send({
            flow: state.flow,
            taskPlan: state.taskPlan,
            assistantReply: state.assistantReply,
            clientName: state.clientProfile?.name ?? null,
            onboardingStatus: state.clientProfile?.onboardingStatus ?? null,
          });
        }
      } catch (err) {
        send({
          flow: "unknown",
          taskPlan: [],
          assistantReply: null,
          clientName: null,
          onboardingStatus: null,
          error: err instanceof Error ? err.message : "Unknown agent error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
