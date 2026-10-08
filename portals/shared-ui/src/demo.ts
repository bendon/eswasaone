/**
 * Demo data switch for every portal.
 *
 * The Core / Frappe backend is still mostly missing, so local demo stores are ON
 * by default: reads fall back to seed data and writes land in the local store.
 * Set VITE_DEMO_MODE=false to opt out (screens then show not-connected states).
 */
export function demoDataEnabled(): boolean {
  try {
    return String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() !== "false";
  } catch {
    return true;
  }
}
