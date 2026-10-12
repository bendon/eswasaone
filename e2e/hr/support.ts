/**
 * HR acceptance suite (plan 10, brief §14 items 1–11). Staging only; see docs/HR_STAGING_RUNBOOK.md.
 *
 * Env:
 *   ESWASAONE_BASE_URL   portal + Core (/api), default staging
 *   HR_E2E_DESK_URL      the Frappe site (Desk REST), e.g. https://desk.staging.example
 *   HR_E2E_SEED          path to hr_e2e_seed.json written by `bench execute eswasa_hr.e2e_seed.run`
 *   HR_E2E_TOKENS        path to a JSON file {persona: bearer token}, written by `node hr/get-token.mjs`
 *   HR_E2E_TOKEN_<PERSONA>  a single token instead (e.g. HR_E2E_TOKEN_HR_MANAGER)
 *
 * Sign-in needs an emailed code, so the suite never logs in itself: each persona's Core token is taken once
 * with get-token.mjs. Desk calls use the API key the seed gave each persona. A spec whose persona, token or
 * seed block is missing skips and says why; it never passes silently.
 */
import { readFileSync } from "node:fs";
import { expect, request, test, type APIRequestContext, type APIResponse, type Browser, type Page } from "@playwright/test";

export type Persona =
  | "hr_manager"
  | "hr_manager_2"
  | "hr_user"
  | "ed"
  | "line_manager"
  | "employee"
  | "auditor_expiring"
  | "auditor_undeclared"
  | "expiring"
  | "leaver"
  | "cert_officer";

type PersonaSeed = { user: string; employee: string; api_key: string; api_secret: string; missing_roles: string[] };
export type Seed = {
  site: string;
  seeded_on: string;
  company?: string;
  department?: string;
  designation?: string;
  personas?: Record<Persona, PersonaSeed>;
  leave?: { leave_type: string; period: string };
  competence?: { skill: string; scheme: string; visit_date: string; alert_valid_to: string; expiring: string; undeclared: string; alerting: string };
  leaver?: { employee: string; user: string; todo: string; separation: string; manager_user: string };
  establishment?: { plan: string; offered: string; beyond_plan: string };
  skipped: Record<string, string>;
};

export const BASE_URL = process.env.ESWASAONE_BASE_URL ?? "https://eswasaone.aiceafrica.com";
export const DESK_URL = process.env.HR_E2E_DESK_URL;
export const api = (path: string) => `/api${path}`;

function readJson<T>(path: string | undefined): T | null {
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export const seed: Seed | null = readJson<Seed>(process.env.HR_E2E_SEED);
const tokens: Record<string, string> = readJson<Record<string, string>>(process.env.HR_E2E_TOKENS) ?? {};

export function tokenFor(p: Persona): string | undefined {
  return process.env[`HR_E2E_TOKEN_${p.toUpperCase()}`] ?? tokens[p];
}

/** Skip this test unless the seed has `block` (and say why if the seed recorded a reason). */
export function needSeed<K extends keyof Seed>(block: K): NonNullable<Seed[K]> {
  test.skip(!seed, "HR_E2E_SEED not set: run the staging seed (runbook step 8)");
  const value = seed?.[block];
  test.skip(value == null, `seed block "${String(block)}" missing: ${seed?.skipped?.[String(block)] ?? "not seeded"}`);
  return value as NonNullable<Seed[K]>;
}

export function persona(p: Persona): PersonaSeed {
  const people = needSeed("personas");
  const row = people[p];
  test.skip(!row, `persona ${p} not seeded`);
  return row;
}

/** Core as a persona (Bearer; no CSRF needed). */
export async function core(p: Persona): Promise<APIRequestContext> {
  const token = tokenFor(p);
  test.skip(!token, `no Core token for ${p}: run "node hr/get-token.mjs ${p}"`);
  return request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

/** Frappe Desk REST as a persona (API key from the seed). */
export async function desk(p: Persona): Promise<APIRequestContext> {
  test.skip(!DESK_URL, "HR_E2E_DESK_URL not set");
  const row = persona(p);
  return request.newContext({
    baseURL: DESK_URL,
    extraHTTPHeaders: { Authorization: `token ${row.api_key}:${row.api_secret}`, Accept: "application/json" },
  });
}

/** A signed-in portal page: the persona's token goes on every request the app makes to Core. */
export async function portal(browser: Browser, p: Persona): Promise<Page> {
  const token = tokenFor(p);
  test.skip(!token, `no Core token for ${p}: run "node hr/get-token.mjs ${p}"`);
  const ctx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  return ctx.newPage();
}

/** Readable error text from Core (detail) or Frappe (exception / _server_messages). */
export async function errorText(res: APIResponse): Promise<string> {
  const raw = await res.text();
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const parts: string[] = [];
    const detail = body.detail;
    if (typeof detail === "string") parts.push(detail);
    else if (detail) parts.push(JSON.stringify(detail));
    if (typeof body.exception === "string") parts.push(body.exception);
    if (typeof body._server_messages === "string") {
      for (const m of JSON.parse(body._server_messages) as string[]) {
        try {
          parts.push(String((JSON.parse(m) as { message?: string }).message ?? m));
        } catch {
          parts.push(m);
        }
      }
    }
    return parts.join(" | ") || raw;
  } catch {
    return raw;
  }
}

/** Assert a refusal: a 4xx (never a 5xx or a success) whose text matches. */
export async function expectRefused(res: APIResponse, pattern?: RegExp): Promise<string> {
  const text = await errorText(res);
  expect(res.status(), text).toBeGreaterThanOrEqual(400);
  expect(res.status(), text).toBeLessThan(500);
  if (pattern) expect(text).toMatch(pattern);
  return text;
}

export async function ok<T = unknown>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()}: ${await errorText(res)}`).toBeTruthy();
  return (await res.json()) as T;
}

export type Approval = { id: string; doctype: string; name: string; title: string; module: string; status: string };

export async function approvals(ctx: APIRequestContext): Promise<Approval[]> {
  return (await ok<{ items: Approval[] }>(await ctx.get(api("/approvals?limit=200")))).items;
}

export function act(ctx: APIRequestContext, a: { doctype: string; name: string }, action: string, comment?: string) {
  return ctx.post(api(`/approvals/${encodeURIComponent(a.doctype)}/${encodeURIComponent(a.name)}/act`), {
    data: { action, comment, confirm: true },
  });
}

/** Desk REST: list rows of a doctype the persona may read. */
export async function deskList<T = Record<string, unknown>>(
  ctx: APIRequestContext,
  doctype: string,
  filters: unknown[],
  fields: string[] = ["name"],
): Promise<T[]> {
  const res = await ctx.get(`/api/resource/${encodeURIComponent(doctype)}`, {
    params: { filters: JSON.stringify(filters), fields: JSON.stringify(fields), limit_page_length: "500" },
  });
  return (await ok<{ data: T[] }>(res)).data;
}

export const isoDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
export const stamp = () => `E2E-${Date.now().toString(36)}`;

/** The HR tabs of the portal (router.tsx `hr` children) plus the self-service pages. */
export const HR_PAGES = [
  "/hr",
  "/hr/directory",
  "/hr/time-off",
  "/hr/competence",
  "/hr/structure",
  "/hr/recruitment",
  "/hr/onboarding",
  "/hr/performance",
  "/hr/cases",
  "/hr/access",
  "/me",
  "/team",
];
