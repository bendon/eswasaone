/** Core API client — all portal traffic goes through VITE_API_BASE. No direct Frappe. */

const DEFAULT_API = "http://127.0.0.1:8015/api";
const DEFAULT_WS = "ws://127.0.0.1:8015/ws";

export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || DEFAULT_API;
}

export function wsBase(): string {
  return (import.meta.env.VITE_WS_BASE as string | undefined)?.replace(/\/$/, "") || DEFAULT_WS;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

import type { AgentAskRequest, AgentAskResponse } from "../index";

export async function askAgent(body: AgentAskRequest): Promise<AgentAskResponse> {
  // TODO: wire real — Core /agent/ask (MSW until Core is live)
  return apiFetch<AgentAskResponse>("/agent/ask", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
