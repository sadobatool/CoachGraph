import { getClientProfile } from "@/lib/agent/tools/getClientProfile";
import { getLatestPlan } from "@/lib/supabase/queries";
import { formatPlanSummary } from "@/lib/agent/planSummary";

export const runtime = "nodejs";

/**
 * Deliberately separate from the main agent route: this is a plain profile
 * lookup used only to render the frontend's initial greeting (new vs.
 * returning client) WITHOUT running the graph. Routing a synthetic "Hi"
 * through the full agent on page load would hit the checkin flow for a
 * returning client, and the extraction prompt's "estimate if not stated"
 * instruction would log a fabricated check-in row -- corrupting the exact
 * plateau/adherence history the harness depends on. So this endpoint exists
 * to let the frontend greet the user without ever touching that logic.
 */
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email");
  if (!email) {
    return new Response(JSON.stringify({ error: "email query param is required" }), { status: 400 });
  }

  const profile = await getClientProfile(email);

  // A returning, active client should always see their current plan on
  // load -- not just once, at the exact moment it happened to be
  // generated. Without this, a plan created in a prior session (or one the
  // user scrolled past) becomes effectively invisible.
  let planSummary: string | null = null;
  if (profile && profile.onboardingStatus === "active") {
    const plan = await getLatestPlan(profile.id);
    if (plan) {
      planSummary = `Your current plan (v${plan.version})\n\n${formatPlanSummary(plan)}`;
    }
  }

  return Response.json({
    exists: Boolean(profile),
    name: profile?.name ?? null,
    onboardingStatus: profile?.onboardingStatus ?? null,
    planSummary,
  });
}
