import { getClientProfile } from "@/lib/agent/tools/getClientProfile";
import { getLatestPlan } from "@/lib/supabase/queries";
import { formatPlanSummary } from "@/lib/agent/planSummary";

export const runtime = "nodejs";

/** Profile lookup for greeting — does not run the agent graph. */
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email");
  if (!email) {
    return new Response(JSON.stringify({ error: "email query param is required" }), { status: 400 });
  }

  const profile = await getClientProfile(email);

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
