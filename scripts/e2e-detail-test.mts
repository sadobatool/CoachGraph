
const baseUrl = process.argv[2] ?? "http://localhost:3002";
const email = `e2e-${Date.now()}@example.com`;

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function assert(name: string, condition: boolean, detail = "") {
  results.push({ name, pass: condition, detail });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function postAgent(content: string) {
  const res = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientEmail: email,
      messages: [{ role: "user", content }],
    }),
  });
  const text = await res.text();
  const events = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { res, events, last: events[events.length - 1] ?? {} };
}

console.log(`Base: ${baseUrl}`);
console.log(`Email: ${email}`);

console.log("\n=== 1) Intake ===");
{
  const { res, events, last } = await postAgent(
    "Hi I am Alex. Goal fat loss. 29 male, 175 cm, 82 kg, light activity, beginner, dumbbells and bodyweight, no injuries."
  );
  assert("intake HTTP 200", res.ok, `status=${res.status}`);
  assert("intake flow", last.flow === "intake", `flow=${String(last.flow)}`);
  assert("intake no error", !last.error, String(last.error ?? "ok"));
  assert("intake became active", last.onboardingStatus === "active", `status=${String(last.onboardingStatus)}`);
  assert(
    "intake reply has plan",
    typeof last.assistantReply === "string" && /plan|calories|protein/i.test(last.assistantReply as string),
    `replyLen=${typeof last.assistantReply === "string" ? (last.assistantReply as string).length : 0}`
  );
  console.log(
    "snapshot:",
    JSON.stringify(
      {
        eventCount: events.length,
        clientName: last.clientName,
        taskPlan: last.taskPlan,
        replyPreview:
          typeof last.assistantReply === "string" ? (last.assistantReply as string).slice(0, 220) : null,
      },
      null,
      2
    )
  );
}

console.log("\n=== 2) Profile ===");
{
  const res = await fetch(`${baseUrl}/api/agent/profile?email=${encodeURIComponent(email)}`);
  const body = (await res.json()) as Record<string, unknown>;
  assert("profile exists", res.status === 200 && body.exists === true, JSON.stringify(body).slice(0, 250));
  assert("profile active", body.onboardingStatus === "active", `status=${String(body.onboardingStatus)}`);
  assert(
    "planSummary returned",
    typeof body.planSummary === "string" && (body.planSummary as string).length > 0,
    `len=${typeof body.planSummary === "string" ? (body.planSummary as string).length : 0}`
  );
}

console.log("\n=== 3) Check-in (good adherence, likely no signal) ===");
{
  const { res, events, last } = await postAgent(
    "Weekly check-in: weight 81.4 kg, completed 3 of 3 sessions, soreness 2/10, energy good."
  );
  assert("checkin HTTP 200", res.ok, `status=${res.status}`);
  assert("checkin flow", last.flow === "checkin", `flow=${String(last.flow)}`);
  assert("checkin no error", !last.error, String(last.error ?? "ok"));
  assert(
    "checkin reply present",
    typeof last.assistantReply === "string" && (last.assistantReply as string).length > 0,
    `len=${typeof last.assistantReply === "string" ? (last.assistantReply as string).length : 0}`
  );
  console.log(
    "snapshot:",
    JSON.stringify(
      {
        eventCount: events.length,
        clientName: last.clientName,
        taskPlan: last.taskPlan,
        replyPreview:
          typeof last.assistantReply === "string" ? (last.assistantReply as string).slice(0, 280) : null,
      },
      null,
      2
    )
  );
}

console.log("\n=== SUMMARY ===");
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  for (const r of results.filter((x) => !x.pass)) console.log(` - ${r.name}: ${r.detail}`);
  process.exit(1);
}
console.log("All e2e checks passed.");
