/** Shared session client — cookie + Bearer dual-path. Owned by WS11 Gatekeeper Auth. */

import type { components } from "../types";
import { apiBase } from "../api/base";
import { apiErrorFromResponse } from "../api/errors";

export type Session = components["schemas"]["Session"];
export type SessionUser = components["schemas"]["SessionUser"];
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type AuthRequiredError = components["schemas"]["AuthRequiredError"];
export type LoginChallenge = components["schemas"]["LoginChallenge"];
export type InviteStaffRequest = components["schemas"]["InviteStaffRequest"];
export type InviteStaffResponse = components["schemas"]["InviteStaffResponse"];
export type PasswordResetRequest = components["schemas"]["PasswordResetRequest"];
export type PasswordResetResponse = components["schemas"]["PasswordResetResponse"];

/** Dual-path login body (email|username + password|otp + optional challenge_id). */
export type LoginRequest = {
  email?: string;
  username?: string;
  password?: string;
  otp?: string;
  challenge_id?: string;
};

export type LoginResult = Session | LoginChallenge;

export function isLoginChallenge(result: LoginResult): result is LoginChallenge {
  return (result as LoginChallenge).status === "otp_required";
}

const TOKEN_KEY = "eswasaone_access_token";
const CSRF_KEY = "eswasaone_csrf";

export class AuthError extends Error {
  status: number;
  authRequired: boolean;
  reason?: string;

  constructor(status: number, body: Partial<AuthRequiredError> & { detail?: string }) {
    super(body.detail || body.reason || `Auth error ${status}`);
    this.status = status;
    this.authRequired = body.auth_required === true || status === 401;
    this.reason = body.reason;
  }
}

/** Soft-lock vs hard expiry — portals listen and show unlock or full sign-in. */
export type AuthSessionEvent =
  | { type: "session_locked"; detail?: string }
  | { type: "session_expired"; detail?: string }
  | { type: "auth_required"; detail?: string };

type AuthSessionListener = (event: AuthSessionEvent) => void;

const authSessionListeners = new Set<AuthSessionListener>();

/** Subscribe to 401 session outcomes from sessionFetch (unlock / re-login). */
export function onAuthSessionEvent(listener: AuthSessionListener): () => void {
  authSessionListeners.add(listener);
  return () => {
    authSessionListeners.delete(listener);
  };
}

function emitAuthSessionEvent(event: AuthSessionEvent): void {
  for (const listener of authSessionListeners) {
    try {
      listener(event);
    } catch {
      /* listener errors must not break the fetch path */
    }
  }
}

function classifyAndEmitAuthError(err: AuthError): void {
  const detail = err.message || "";
  if (err.reason === "session_locked" || /session locked/i.test(detail)) {
    emitAuthSessionEvent({ type: "session_locked", detail });
    return;
  }
  if (
    err.reason === "session_expired" ||
    err.reason === "otp_expired" ||
    /session expired|otp.*expired/i.test(detail)
  ) {
    emitAuthSessionEvent({ type: "session_expired", detail });
    return;
  }
  if (err.authRequired) {
    emitAuthSessionEvent({ type: "auth_required", detail });
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getCsrfToken(): string | null {
  try {
    const fromStorage = localStorage.getItem(CSRF_KEY);
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)eswasaone_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCsrfToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(CSRF_KEY, token);
    else localStorage.removeItem(CSRF_KEY);
  } catch {
    /* ignore */
  }
}

function rememberSession(session: Session): void {
  if (session.access_token) setStoredToken(session.access_token);
  const csrf = getCsrfToken();
  if (csrf) setCsrfToken(csrf);
}

export type SessionFetchInit = RequestInit & {
  /**
   * When true, 401s still throw AuthError but do not broadcast
   * onAuthSessionEvent. Use for probes (touch heartbeat, me guest check)
   * so a soft failure cannot force a full logout race.
   */
  quiet?: boolean;
};

/**
 * Dual-path fetch: credentials:include (cookie) + Authorization Bearer when token present.
 * CSRF header attached for state-changing cookie sessions.
 */
export async function sessionFetch<T>(path: string, init?: SessionFetchInit): Promise<T> {
  const { quiet, ...reqInit } = init || {};
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const method = (reqInit.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(reqInit.body ? { "Content-Type": "application/json" } : {}),
    ...(reqInit.headers as Record<string, string> | undefined),
  };

  const bearer = getStoredToken();
  if (bearer && !headers.Authorization) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf && !headers["X-CSRF-Token"]) {
      headers["X-CSRF-Token"] = csrf;
    }
  }

  const res = await fetch(url, {
    ...reqInit,
    method,
    credentials: "include",
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  // 202 LoginChallenge is success for password step
  if (res.status === 202) {
    return data as T;
  }

  if (!res.ok) {
    const body = (data || {}) as Partial<AuthRequiredError> & { detail?: string };
    if (res.status === 401 || body.auth_required) {
      const err = new AuthError(res.status, body);
      if (!quiet) classifyAndEmitAuthError(err);
      throw err;
    }
    // 4xx/5xx → ApiError + global MessageAlert (unless quiet probe)
    throw apiErrorFromResponse(res.status, data, path, { notify: !quiet });
  }

  return data as T;
}

export async function login(body: LoginRequest): Promise<LoginResult> {
  const result = await sessionFetch<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!isLoginChallenge(result)) {
    rememberSession(result);
    const csrf = getCsrfToken();
    if (csrf) setCsrfToken(csrf);
  }
  return result;
}

export async function register(body: RegisterRequest): Promise<LoginResult> {
  const result = await sessionFetch<LoginResult>("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
  // 202 challenge — no session yet; complete via login({ otp, challenge_id }).
  if (!isLoginChallenge(result)) {
    rememberSession(result);
    const csrf = getCsrfToken();
    if (csrf) setCsrfToken(csrf);
  }
  return result;
}

export async function requestOtp(
  email: string,
): Promise<{ ok: boolean; message?: string; stubbed?: boolean }> {
  return sessionFetch("/auth/otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/**
 * Request a password-reset link (anti-enumeration: always 200 with the
 * same message whether or not the account exists). The link is emailed by
 * Frappe and points at the Frappe-hosted reset page where the new password
 * is set — no new password is sent to Core.
 */
export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetResponse> {
  return sessionFetch<PasswordResetResponse>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ email } satisfies PasswordResetRequest),
  });
}

export async function unlockSession(body: {
  email?: string;
  username?: string;
  password: string;
}): Promise<Session> {
  const session = await sessionFetch<Session>("/auth/unlock", {
    method: "POST",
    body: JSON.stringify(body),
  });
  rememberSession(session);
  return session;
}

export async function touchSession(): Promise<void> {
  // Quiet: heartbeat must not broadcast auth_required (IdleLockGate handles
  // session_locked / expiry itself; a generic 401 must not force logout).
  await sessionFetch<void>("/auth/touch", { method: "POST", quiet: true });
}

export async function inviteStaff(body: InviteStaffRequest): Promise<InviteStaffResponse> {
  return sessionFetch("/auth/invite-staff", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function logout(): Promise<void> {
  try {
    await sessionFetch<void>("/auth/logout", { method: "POST" });
  } finally {
    setStoredToken(null);
    setCsrfToken(null);
  }
}

/** Current user, or null when 401 auth_required (guest). */
export async function me(): Promise<SessionUser | null> {
  try {
    // Quiet: guest probe must not emit auth_required (would race IdleLockGate).
    return await sessionFetch<SessionUser>("/auth/me", { quiet: true });
  } catch (err) {
    if (err instanceof AuthError && err.authRequired) return null;
    throw err;
  }
}
