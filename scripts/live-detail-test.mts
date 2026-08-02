
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(name: string, condition: boolean, detail = "") {
  results.push({ name, pass: condition, detail });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

loadEnvLocal();

section("Environment");
const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const openai = process.env.OPENAI_API_KEY ?? "";
assert("SUPABASE_URL set", Boolean(url) && url.startsWith("https://"), url ? `host=${new URL(url).host}` : "missing");
assert("SUPABASE_SERVICE_ROLE_KEY set", Boolean(key) && key.length > 20, key ? `len=${key.length}` : "missing");
assert("OPENAI_API_KEY set", Boolean(openai) && openai.startsWith("sk-"), openai ? `len=${openai.length}` : "missing");

section("Supabase tables");
if (!url || !key) {
  assert("supabase client", false, "missing credentials");
} else {
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const exercises = await sb.from("exercise_library").select("id,name,category").limit(5);
  assert(
    "exercise_library readable",
    !exercises.error && (exercises.data?.length ?? 0) > 0,
    exercises.error ? exercises.error.message : `sample=${exercises.data?.[0]?.name ?? "n/a"} rows=${exercises.data?.length}`
  );

  const countRes = await sb.from("exercise_library").select("id", { count: "exact", head: true });
  assert(
    "exercise_library seed volume (>=30)",
    !countRes.error && (countRes.count ?? 0) >= 30,
    countRes.error ? countRes.error.message : `count=${countRes.count}`
  );

  const clients = await sb.from("clients").select("id,email,onboarding_status").limit(3);
  assert("clients readable", !clients.error, clients.error ? clients.error.message : `rows=${clients.data?.length ?? 0}`);

  const plans = await sb.from("plans").select("id,version,status").limit(3);
  assert("plans readable", !plans.error, plans.error ? plans.error.message : `rows=${plans.data?.length ?? 0}`);

  const checkins = await sb.from("checkins").select("id").limit(1);
  assert("checkins readable", !checkins.error, checkins.error ? checkins.error.message : `rows=${checkins.data?.length ?? 0}`);

  const testEmail = `detail-test-${Date.now()}@example.com`;
  const upsert = await sb
    .from("clients")
    .upsert({ email: testEmail, name: "Detail Test", onboarding_status: "intake_in_progress" }, { onConflict: "email" })
    .select("id,email")
    .single();
  assert(
    "client upsert works",
    !upsert.error && upsert.data?.email === testEmail,
    upsert.error ? upsert.error.message : `created id present=${Boolean(upsert.data?.id)}`
  );

  if (upsert.data?.id) {
    const del = await sb.from("clients").delete().eq("id", upsert.data.id);
    assert("client cleanup delete works", !del.error, del.error ? del.error.message : "deleted");
  }
}

section("SUMMARY");
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  for (const r of results.filter((x) => !x.pass)) console.log(` - ${r.name}: ${r.detail}`);
  process.exit(1);
}
console.log("All live checks passed.");
