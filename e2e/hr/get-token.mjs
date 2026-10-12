#!/usr/bin/env node
/**
 * Take a Core sign-in token for one HR e2e persona and save it to HR_E2E_TOKENS (default hr/.tokens.json).
 *
 *   HR_E2E_SEED=./hr_e2e_seed.json HR_E2E_PASSWORD=… node hr/get-token.mjs hr_manager
 *
 * Signs in with the persona's seeded email and password, asks for the emailed code, and stores the
 * session's access token. Tokens expire with the Core session (7 h); take them again before a run.
 * The tokens file holds live credentials: it is git-ignored, never commit it.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const persona = process.argv[2];
const base = (process.env.ESWASAONE_BASE_URL ?? "https://eswasaone.aiceafrica.com").replace(/\/$/, "");
const seedPath = process.env.HR_E2E_SEED;
const out = process.env.HR_E2E_TOKENS ?? new URL("./.tokens.json", import.meta.url).pathname;
const password = process.env.HR_E2E_PASSWORD;

if (!persona || !seedPath || !password) {
  console.error("usage: HR_E2E_SEED=… HR_E2E_PASSWORD=… node hr/get-token.mjs <persona>");
  process.exit(2);
}
const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const email = seed.personas?.[persona]?.user;
if (!email) {
  console.error(`persona ${persona} is not in the seed (${Object.keys(seed.personas ?? {}).join(", ")})`);
  process.exit(2);
}

async function login(body) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const challenge = await login({ email, password });
let session = challenge;
if (challenge.status === "otp_required") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const otp = (await rl.question(`Code sent to ${challenge.email_hint ?? email}: `)).trim();
  rl.close();
  session = await login({ email, otp, challenge_id: challenge.challenge_id });
}
if (!session.access_token) throw new Error(`no access_token in the sign-in response: ${JSON.stringify(session)}`);
const tokens = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
tokens[persona] = session.access_token;
writeFileSync(out, JSON.stringify(tokens, null, 2), { mode: 0o600 });
console.log(`saved ${persona} → ${out}`);
