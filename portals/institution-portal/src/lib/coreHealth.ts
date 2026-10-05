import { apiBase } from "@eswasaone/shared-ui";

export type CoreHealthState = "up" | "down" | "unknown";

/**
 * Probe Core through the public `/api` path nginx terminates.
 * Root `/health` is not proxied (hits Service Portal HTML).
 * Any non-5xx response from `/auth/me` means Core is reachable.
 */
export function probeCoreHealth(): Promise<Exclude<CoreHealthState, "unknown">> {
  // Layout footer + dashboard (×2 under StrictMode) probe together on load —
  // share one request instead of queueing several behind the API calls.
  const now = Date.now();
  if (inflight && now - inflightAt < PROBE_REUSE_MS) return inflight;
  inflightAt = now;
  inflight = runProbe();
  return inflight;
}

const PROBE_REUSE_MS = 5_000;
let inflight: Promise<Exclude<CoreHealthState, "unknown">> | null = null;
let inflightAt = 0;

async function runProbe(): Promise<Exclude<CoreHealthState, "unknown">> {
  const base = apiBase().replace(/\/$/, "") || "http://127.0.0.1:8015/api";
  const r = await fetch(`${base}/auth/me`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (r.status >= 500) throw new Error(`core health ${r.status}`);
  return "up";
}
