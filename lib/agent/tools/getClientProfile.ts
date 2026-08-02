import { getClientByEmail } from "@/lib/supabase/queries";
import type { ClientProfile } from "@/types";

/**
 * Deterministic Supabase lookup -- called directly by the router node
 * (never exposed to an LLM's tool-calling loop). Loading the client's
 * onboarding_status is what decides intake vs. check-in routing, so this
 * has to be plain code, not a model guess.
 */
export async function getClientProfile(email: string): Promise<ClientProfile | null> {
  return getClientByEmail(email);
}
