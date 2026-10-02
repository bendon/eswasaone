/** API base URLs — shared by client + session (no circular imports). */

/** Same-origin through nginx (or Vite proxy). Avoids hardcoded 127.0.0.1 in the browser. */
const DEFAULT_API = "/api";

export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || DEFAULT_API;
}

export function wsBase(): string {
  const fromEnv = (import.meta.env.VITE_WS_BASE as string | undefined)?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return "ws://127.0.0.1:8015/ws";
}
