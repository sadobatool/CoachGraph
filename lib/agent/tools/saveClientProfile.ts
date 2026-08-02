import { upsertClientProfile } from "@/lib/supabase/queries";
import type { ClientProfile, ClientProfileDraft } from "@/types";

/**
 * Deterministic Supabase write -- called directly by the intake node after
 * gpt-4o-mini extracts whatever fields are present in the latest message.
 * Persists progress immediately so intake survives across turns/devices
 * without needing a LangGraph checkpointer (see graph.ts).
 */
export async function saveClientProfile(
  email: string,
  draft: ClientProfileDraft & { onboardingStatus?: ClientProfile["onboardingStatus"] }
): Promise<ClientProfile> {
  return upsertClientProfile(email, draft);
}
