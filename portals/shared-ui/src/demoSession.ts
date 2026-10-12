/**
 * Demo staff sign-in — when Core's /auth isn't reachable (or you want to try another role), staff can
 * continue as a demo persona. Session-only (sessionStorage); never sent to Core.
 * TODO: wire real — remove once every environment has Frappe staff accounts for demos.
 */
import { demoDataEnabled } from "./demo";
import { DEMO_STAFF } from "./tasks/staff";

export type DemoPersona = { username: string; full_name: string; email: string; roles: string[]; title: string };

const KEY = "eswasaone.demo.persona";

export const DEMO_PERSONAS: DemoPersona[] = [
  { username: "demo.admin", full_name: "Demo Administrator", email: "demo.admin@eswasa.co.sz", roles: ["System Manager", "Desk User"], title: "Sees every module" },
  ...DEMO_STAFF.map((s) => ({
    username: s.email.split("@")[0],
    full_name: s.name,
    email: s.email,
    roles: [...s.roles, "Desk User"],
    title: s.title,
  })),
];

export function getDemoPersona(): DemoPersona | null {
  if (!demoDataEnabled()) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoPersona) : null;
  } catch {
    return null;
  }
}

export function setDemoPersona(p: DemoPersona | null): void {
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
