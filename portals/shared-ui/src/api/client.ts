/** Core API client — all portal traffic goes through VITE_API_BASE. No direct Frappe. */

import type { components } from "../types";
import { sessionFetch, type SessionFetchInit } from "../auth/session";
import { apiBase, wsBase } from "./base";

export { apiBase, wsBase };

type AgentAskRequest = components["schemas"]["AgentAskRequest"];
type AgentAskResponse = components["schemas"]["AgentAskResponse"];

/**
 * Authenticated JSON fetch (cookies + bearer). Surfaces 4xx/5xx via the global
 * MessageAlert modal (DialogHost). Prefer this over raw fetch.
 */
export async function apiFetch<T>(path: string, init?: SessionFetchInit): Promise<T> {
  return sessionFetch<T>(path, init);
}

export async function askAgent(body: AgentAskRequest): Promise<AgentAskResponse> {
  // TODO: wire real — Core /agent/ask (MSW until Core is live)
  return apiFetch<AgentAskResponse>("/agent/ask", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
