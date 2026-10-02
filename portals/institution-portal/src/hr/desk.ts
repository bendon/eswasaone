/**
 * Deep-link helpers for Frappe HR Desk (deep-config only).
 *
 * Public site does **not** expose Desk (see docs/PORTS.md — `/desk` later).
 * Opening http://127.0.0.1:8020 from the browser on aiceafrica.com always fails
 * for remote users. Only open Desk when explicitly configured or on localhost.
 */

function configuredDeskBase(): string | null {
  const fromEnv =
    (import.meta.env.VITE_FRAPPE_URL as string | undefined)?.replace(/\/$/, "") ||
    (import.meta.env.VITE_DESK_URL as string | undefined)?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:8020";
  }
  return null;
}

/** True when Desk can be opened from this browser context. */
export function deskAvailable(): boolean {
  return configuredDeskBase() != null;
}

/** Build a Desk URL for a doctype list or form path (e.g. `job-opening`, `payroll-entry/new`). */
export function deskUrl(path: string): string | null {
  const base = configuredDeskBase();
  if (!base) return null;
  const clean = path.replace(/^\//, "");
  return `${base}/app/${clean}`;
}

/**
 * Open Desk in a new tab when available.
 * Returns false if Desk is not reachable from this host (caller should toast).
 */
export function openDesk(path: string): boolean {
  const url = deskUrl(path);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** Open Desk or show a short message when Desk is not public. */
export function openDeskOrExplain(path: string, onUnavailable?: (msg: string) => void): void {
  if (openDesk(path)) return;
  const msg =
    "Frappe Desk is not public on this host. Use an SSH tunnel to :8020 or set VITE_DESK_URL for admins.";
  if (onUnavailable) onUnavailable(msg);
  else window.alert(msg);
}
