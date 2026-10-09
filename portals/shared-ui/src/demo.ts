/**
 * Demo data switch for every portal.
 *
 * Default ON: local seed stores. Set VITE_DEMO_MODE=false to use Core/Frappe where
 * wired (certification applications, CRM deals, metrology jobs, …). Screens without
 * a live endpoint show empty lists or a not-connected state.
 */
export function demoDataEnabled(): boolean {
  try {
    return String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() !== "false";
  } catch {
    return true;
  }
}
