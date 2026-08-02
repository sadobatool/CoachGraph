
const baseUrl = process.argv[2] ?? "http://localhost:3002";
const email = process.argv[3];
if (!email) {
  console.error("Usage: tsx scripts/checkin-detail-test.mts <baseUrl> <email>");
  process.exit(2);
}

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];
function assert(name: string, condition: boolean, detail = "") {
  results.push({ name, pass: condition, detail });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log(`\n=== Profile lookup for ${email} ===`);
{
  const res = await fetch(`${baseUrl}/api/agent/profile?email=${encodeURIComponent(email)}`);
  const body = await res.json();
  assert("profile exists", res.status === 200 && body.exists === true, JSON.stringify(body).slice(0, 300));
  assert("onboarding active", body.onboardingStatus === "active", `status=${body.onboardingStatus}`);
  assert("planSummary present", typeof body.planSummary === "string" && body.planSummary.length > 0, `len=${body.planSummary?.length ?? 0}`);
}

console.log("\n=== Check-in turn (should stay no-signal or adjust) ===");
{
  const res = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientEmail: email,
      messages: [
        {
          role: "user",
          content:
            "Weekly check-in: weight 85.5 kg, completed 3 of 3 sessions, soreness 3/10, energy pretty good.",
        },
      ],
    }),
  });
  assert("checkin stream ok", res.ok, `status=${res.status}`);
  const text = await res.text();
  const events = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const last = events[events.length - 1] ?? {};
  assert("no error", !last.error, last.error ?? "ok");
  assert("flow=checkin", last.flow === "checkin", `flow=${last.flow}`);
  assert("assistantReply present", typeof last.assistantReply === "string" && last.assistantReply.length > 0, `len=${last.assistantReply?.length ?? 0}`);
  console.log("\n--- Check-in final event snapshot ---");
  console.log(
    JSON.stringify(
      {
        flow: last.flow,
        onboardingStatus: last.onboardingStatus,
        clientName: last.clientName,
        taskPlan: last.taskPlan,
        assistantReplyPreview:
          typeof last.assistantReply === "string" ? last.assistantReply.slice(0, 320) : null,
        error: last.error ?? null,
        eventCount: events.length,
      },
      null,
      2
    )
  );
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`\n=== SUMMARY ===\nTotal: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
if (failed) process.exit(1);
