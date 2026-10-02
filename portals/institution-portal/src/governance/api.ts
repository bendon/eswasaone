import { apiBase, AuthError } from "@eswasaone/shared-ui";

/**
 * Governance write helper — parses error bodies (e.g. 409 pack issue).
 * TODO: wire real — graduate into shared apiFetch once Core error envelope is standard.
 */
export async function govPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    let parsed: { detail?: string; message?: string; error?: string; reason?: string; auth_required?: boolean } =
      {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      /* keep */
    }
    if (res.status === 401 || res.status === 403 || parsed.auth_required) {
      throw new AuthError(res.status, {
        detail: parsed.detail || parsed.message || parsed.error,
        reason: parsed.reason,
        auth_required: true,
      });
    }
    const detail =
      parsed.detail || parsed.message || parsed.error || `API ${res.status}: ${path}`;
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function govPatch<T>(path: string, body: unknown): Promise<T> {
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    let parsed: { detail?: string; message?: string; error?: string; reason?: string; auth_required?: boolean } =
      {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      /* keep */
    }
    if (res.status === 401 || res.status === 403 || parsed.auth_required) {
      throw new AuthError(res.status, {
        detail: parsed.detail || parsed.message || parsed.error,
        reason: parsed.reason,
        auth_required: true,
      });
    }
    throw new Error(parsed.detail || parsed.message || parsed.error || `API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export function errStatus(err: unknown): number | undefined {
  return err && typeof err === "object" && "status" in err
    ? Number((err as { status?: number }).status)
    : undefined;
}
