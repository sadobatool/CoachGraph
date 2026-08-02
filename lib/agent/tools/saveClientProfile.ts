import { upsertClientProfile } from "@/lib/supabase/queries";
import type { ClientProfile, ClientProfileDraft } from "@/types";

/** Persist intake draft to Supabase. */
export async function saveClientProfile(
  email: string,
  draft: ClientProfileDraft & { onboardingStatus?: ClientProfile["onboardingStatus"] }
): Promise<ClientProfile> {
  return upsertClientProfile(email, draft);
}
