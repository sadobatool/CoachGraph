import { getClientByEmail } from "@/lib/supabase/queries";
import type { ClientProfile } from "@/types";

/** Load client profile by email (router use). */
export async function getClientProfile(email: string): Promise<ClientProfile | null> {
  return getClientByEmail(email);
}
