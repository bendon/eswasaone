import { apiBase } from "@eswasaone/shared-ui";

export type CoreHealthState = "up" | "down" | "unknown";

/**
 * Probe Core through the public `/api` path nginx terminates.
 * Root `/health` is not proxied (hits Service Portal HTML).
 * Any non-5xx response from `/auth/me` means Core is reachable.
 */
export async function probeCoreHealth(): Promise<Exclude<CoreHealthState, "unknown">> {
  const base = apiBase().replace(/\/$/, "") || "http://127.0.0.1:8015/api";
  const r = await fetch(`${base}/auth/me`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (r.status >= 500) throw new Error(`core health ${r.status}`);
  return "up";
}
