/**
 * HR write helpers. Screens show the server's sentence inline (Frappe guard text reaches Core through
 * frappe_errors.py), so writes are `quiet` and skip the global message modal. Nothing here invents data.
 */
import { ApiError, AuthError, apiBase, apiErrorFromResponse, apiFetch, getCsrfToken, getStoredToken } from "@eswasaone/shared-ui";

export const UNREACHABLE = "The HR system can't be reached right now. Nothing was saved.";

/** One plain sentence for a failed HR call. */
export function errorText(err: unknown, fallback = "That didn't work. Nothing was saved."): string {
  if (err instanceof AuthError) return err.authRequired ? "Your session ended. Sign in again, then retry." : err.message || fallback;
  if (err instanceof ApiError) {
    if (err.status === 502 || err.status === 503 || err.status === 504) return UNREACHABLE;
    return err.message || fallback;
  }
  if (err instanceof TypeError) return UNREACHABLE; // fetch failed: network down
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** JSON write (POST by default) with `confirm: true`, errors left to the caller. */
export function hrSend<T>(path: string, body: Record<string, unknown> = {}, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  return apiFetch<T>(path, { method, body: JSON.stringify({ ...body, confirm: true }), quiet: true });
}

/** Multipart write (documents, evidence, import files). Adds `confirm=true`; the browser sets the boundary. */
export async function hrUpload<T>(path: string, fields: Record<string, string | Blob | null | undefined>): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined && v !== "") form.append(k, v);
  form.append("confirm", "true");
  const headers: Record<string, string> = { Accept: "application/json" };
  const bearer = getStoredToken();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const res = await fetch(`${apiBase()}${path}`, { method: "POST", body: form, headers, credentials: "include" });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!res.ok) {
    if (res.status === 401) throw new AuthError(401, (data || {}) as { detail?: string });
    throw apiErrorFromResponse(res.status, data, path);
  }
  return data as T;
}

/** Absolute link for a file Core streams after Frappe allows it (cookies carry the session). */
export function fileUrl(path: string): string {
  return `${apiBase()}${path}`;
}

/** Read a picked file as base64 (no data: prefix), for routes that take `{file_name, content}`. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(new Error(`Couldn't read ${file.name}.`));
    r.readAsDataURL(file);
  });
}

/** POST JSON (with `confirm: true`) to a route that answers with a file, and have the browser save it.
 *  Used by report exports (plan 07): a POST keeps filters and the reason out of URLs. Returns the file name. */
export async function hrSaveFile(path: string, body: Record<string, unknown>, fallbackName = "download"): Promise<string> {
  const headers: Record<string, string> = { Accept: "*/*", "Content-Type": "application/json" };
  const bearer = getStoredToken();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const res = await fetch(`${apiBase()}${path}`, { method: "POST", body: JSON.stringify({ ...body, confirm: true }), headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    let data: unknown = { detail: text };
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* plain text detail */
    }
    if (res.status === 401) throw new AuthError(401, (data || {}) as { detail?: string });
    throw apiErrorFromResponse(res.status, data, path);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(/filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
  return name;
}
