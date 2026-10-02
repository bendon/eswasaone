/**
 * Progressive auth session client — import-only from shared-ui when WS11 ships.
 * Stub matches OpenAPI Session / LoginRequest until then.
 */
import { apiFetch } from "@eswasaone/shared-ui";

// TODO: import { getSession, login, logout } from "@eswasaone/shared-ui/session";

export type SessionUser = {
  username: string;
  full_name: string;
  roles: string[];
  email?: string | null;
};

export type Session = {
  access_token: string;
  token_type: string;
  user: SessionUser;
};

export type LoginRequest = {
  username: string;
  password: string;
};

let cached: Session | null = null;

/** Returns current session or null when guest. */
export async function getSession(): Promise<Session | null> {
  // TODO: import shared session client from portals/shared-ui (WS11)
  if (cached) return cached;
  try {
    const user = await apiFetch<SessionUser>("/auth/me", {
      credentials: "include",
    });
    cached = {
      access_token: "",
      token_type: "bearer",
      user,
    };
    return cached;
  } catch {
    return null;
  }
}

export function peekSession(): Session | null {
  return cached;
}

export async function login(body: LoginRequest): Promise<Session> {
  // TODO: import shared session client from portals/shared-ui (WS11)
  const session = await apiFetch<Session>("/auth/login", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify(body),
  });
  cached = session;
  return session;
}

/** Demo login when Core auth is unavailable — local guest→citizen flip. */
export function stubLogin(email: string): Session {
  cached = {
    access_token: "stub",
    token_type: "bearer",
    user: {
      username: email.split("@")[0] || "citizen",
      full_name: email.split("@")[0] || "Citizen",
      roles: ["Citizen"],
      email,
    },
  };
  return cached;
}

export function logout(): void {
  cached = null;
  // TODO: import shared session client logout (WS11)
}
