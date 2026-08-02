
const baseUrl = process.argv[2] ?? "http://localhost:3002";

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function assert(name: string, condition: boolean, detail = "") {
  results.push({ name, pass: condition, detail });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function readNdjson(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

section(`Pages @ ${baseUrl}`);

{
  const res = await fetch(`${baseUrl}/`);
  const html = await res.text();
  assert("GET / => 200", res.status === 200, `status=${res.status}`);
  assert(
    "GET / contains brand/CTA signal",
    /AdaptCoach|Start coaching|coaching/i.test(html),
    `len=${html.length}`
  );
}

{
  const res = await fetch(`${baseUrl}/chat`);
  const html = await res.text();
  assert("GET /chat => 200", res.status === 200, `status=${res.status}`);
  assert("GET /chat renders chat shell", /chat|message|email/i.test(html), `len=${html.length}`);
}

section("API validation");

{
  const res = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  const body = await res.json().catch(() => ({}));
  assert("POST /api/agent invalid JSON => 400", res.status === 400, `status=${res.status} body=${JSON.stringify(body)}`);
}

{
  const res = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientEmail: null, messages: [] }),
  });
  const body = await res.json().catch(() => ({}));
  assert(
    "POST /api/agent empty messages => 400",
    res.status === 400,
    `status=${res.status} body=${JSON.stringify(body)}`
  );
}

section("API agent intake turn (live OpenAI + Supabase)");

{
  const testEmail = `api-test-${Date.now()}@example.com`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${baseUrl}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        clientEmail: testEmail,
        messages: [
          {
            role: "user",
            content:
              "Hi, I'm Sam. I want to lose fat. I'm 32, male, 178 cm, 86 kg, moderately active, beginner, dumbbells only, no injuries.",
          },
        ],
      }),
    });

    assert("agent stream response ok", res.ok, `status=${res.status} type=${res.headers.get("content-type")}`);

    const events = await readNdjson(res);
    assert("agent emitted >=1 NDJSON event", events.length >= 1, `events=${events.length}`);

    const last = events[events.length - 1] as Record<string, unknown>;
    const hasError = typeof last.error === "string" && last.error.length > 0;
    assert("final event has no error", !hasError, hasError ? String(last.error) : "ok");
    assert(
      "assistantReply present",
      typeof last.assistantReply === "string" && (last.assistantReply as string).length > 0,
      `replyLen=${typeof last.assistantReply === "string" ? (last.assistantReply as string).length : 0}`
    );
    assert(
      "taskPlan is array",
      Array.isArray(last.taskPlan),
      `taskPlanLen=${Array.isArray(last.taskPlan) ? last.taskPlan.length : "n/a"}`
    );
    assert(
      "flow is known",
      last.flow === "intake" || last.flow === "checkin" || last.flow === "unknown",
      `flow=${String(last.flow)}`
    );

    console.log("\n--- Agent final event snapshot ---");
    console.log(
      JSON.stringify(
        {
          flow: last.flow,
          onboardingStatus: last.onboardingStatus,
          clientName: last.clientName,
          taskPlan: last.taskPlan,
          assistantReplyPreview:
            typeof last.assistantReply === "string"
              ? (last.assistantReply as string).slice(0, 280)
              : null,
          error: last.error ?? null,
          eventCount: events.length,
        },
        null,
        2
      )
    );
  } catch (err) {
    assert("agent request completed", false, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}

section("API profile route");

{
  // Probe expected shape / status without assuming auth.
  const res = await fetch(`${baseUrl}/api/agent/profile?email=missing@example.com`);
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 120);
  }
  assert(
    "GET /api/agent/profile responds",
    res.status === 200 || res.status === 404 || res.status === 400 || res.status === 405,
    `status=${res.status} body=${JSON.stringify(parsed).slice(0, 200)}`
  );
}

section("SUMMARY");
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  for (const r of results.filter((x) => !x.pass)) console.log(` - ${r.name}: ${r.detail}`);
  process.exit(1);
}
console.log("All API checks passed.");
