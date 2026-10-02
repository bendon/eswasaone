import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AuthError,
  me,
  onAuthSessionEvent,
  touchSession,
  unlockSession,
} from "./session";

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const TOUCH_EVERY_MS = 60_000;

export type IdleLockProps = {
  enabled: boolean;
  /** Idle timeout in ms (default 30 minutes). */
  idleMs?: number;
  identityHint?: string;
  onRequireFullLogin?: () => void;
  children?: ReactNode;
};

/** Hard expiry only — never treat generic "Authentication required" as gone. */
function isSessionGone(err: unknown): boolean {
  if (!(err instanceof AuthError)) return false;
  if (err.reason === "otp_expired" || err.reason === "session_expired") return true;
  const detail = (err.message || "").toLowerCase();
  return (
    detail.includes("session expired") ||
    detail.includes("otp trust window expired") ||
    /otp.*expired/.test(detail)
  );
}

function isSessionLocked(err: unknown): boolean {
  if (!(err instanceof AuthError)) return false;
  if (err.reason === "session_locked") return true;
  return /session locked/i.test(err.message || "");
}

/**
 * Soft-locks the UI after idleMs of inactivity. Unlock is password-only
 * while the 6h OTP trust window is valid; otherwise calls onRequireFullLogin.
 *
 * Also reacts to API 401 `session_locked` (e.g. already locked before mount)
 * and escalates hard expiry to full sign-in.
 */
export function IdleLockGate({
  enabled,
  idleMs = DEFAULT_IDLE_MS,
  identityHint,
  onRequireFullLogin,
  children,
}: IdleLockProps) {
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());
  const identity = useRef(identityHint ?? "");
  const fullLogin = useRef(onRequireFullLogin);
  const locking = useRef(false);

  useEffect(() => {
    identity.current = identityHint ?? "";
  }, [identityHint]);

  useEffect(() => {
    fullLogin.current = onRequireFullLogin;
  }, [onRequireFullLogin]);

  const bump = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const escalateToFullLogin = useCallback(() => {
    setLocked(false);
    setPassword("");
    setError(null);
    fullLogin.current?.();
  }, []);

  const showLock = useCallback(() => {
    setLocked(true);
    setError(null);
    setPassword("");
  }, []);

  const engageLock = useCallback(async () => {
    if (locking.current || locked) return;
    locking.current = true;
    try {
      // Soft-lock only if the server session is still alive.
      // /auth/me returns 200 even when soft-locked — use that for identity.
      const user = await me();
      if (!user) {
        escalateToFullLogin();
        return;
      }
      // Confirm lock state via touch (401 session_locked when already locked).
      try {
        await touchSession();
      } catch (err) {
        if (isSessionLocked(err)) {
          showLock();
          return;
        }
        if (isSessionGone(err)) {
          escalateToFullLogin();
          return;
        }
        // Generic 401 / network — leave unlock path; do not force logout.
      }
      showLock();
    } catch (err) {
      if (isSessionLocked(err)) {
        showLock();
        return;
      }
      if (isSessionGone(err)) {
        escalateToFullLogin();
        return;
      }
      // Unknown failure while engaging lock — keep UI usable.
    } finally {
      locking.current = false;
    }
  }, [escalateToFullLogin, locked, showLock]);

  // Global API 401s — unlock overlay vs full re-login
  useEffect(() => {
    if (!enabled) return;
    return onAuthSessionEvent((event) => {
      if (event.type === "session_locked") {
        showLock();
        return;
      }
      if (event.type === "session_expired" || event.type === "auth_required") {
        escalateToFullLogin();
      }
    });
  }, [enabled, showLock, escalateToFullLogin]);

  // Already locked when landing (me is 200; touch returns session_locked)
  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    let cancelled = false;
    void touchSession().catch((err: unknown) => {
      if (cancelled) return;
      if (isSessionLocked(err)) {
        showLock();
      } else if (isSessionGone(err)) {
        escalateToFullLogin();
      }
      // Abort / network / generic auth — ignore (quiet touch).
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, showLock, escalateToFullLogin]);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    const onActivity = () => {
      if (!locked) bump();
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });

    const idleTimer = window.setInterval(() => {
      if (!locked && Date.now() - lastActivity.current >= idleMs) {
        void engageLock();
      }
    }, 5_000);

    const touchTimer = window.setInterval(() => {
      if (!locked) {
        void touchSession().catch((err: unknown) => {
          if (isSessionLocked(err)) {
            showLock();
          } else if (isSessionGone(err)) {
            escalateToFullLogin();
          }
        });
      }
    }, TOUCH_EVERY_MS);

    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity);
      window.clearInterval(idleTimer);
      window.clearInterval(touchTimer);
    };
  }, [enabled, idleMs, locked, bump, engageLock, escalateToFullLogin, showLock]);

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const hint = identity.current.trim();
      await unlockSession({
        email: hint.includes("@") ? hint : undefined,
        username: hint && !hint.includes("@") ? hint : undefined,
        password,
      });
      setLocked(false);
      setPassword("");
      bump();
    } catch (err) {
      if (err instanceof AuthError && err.reason === "invalid_credentials") {
        setError("Incorrect password. Try again.");
        return;
      }
      if (isSessionGone(err)) {
        // Soft-lock form cannot work without a live session — full sign-in.
        escalateToFullLogin();
        return;
      }
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {children}
      {locked ? (
        <div
          className="overlay show"
          style={{ display: "grid", placeItems: "center", zIndex: 10000 }}
          role="dialog"
          aria-modal="true"
          aria-label="Session locked"
        >
          <form
            onSubmit={(e) => void handleUnlock(e)}
            style={{
              width: "min(400px, 92vw)",
              background: "var(--card)",
              borderRadius: 16,
              padding: 28,
              border: "1px solid var(--line)",
              boxShadow: "0 18px 48px rgba(16,24,40,0.12)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20 }}>Session locked</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 8 }}>
              Inactive for 30 minutes. Enter your password to continue (OTP not required until
              the 6-hour sign-in window ends).
            </p>
            {identity.current ? (
              <p style={{ color: "var(--muted-2)", fontSize: 12.5, marginTop: 8 }}>
                Signed in as <strong style={{ color: "var(--ink)" }}>{identity.current}</strong>
              </p>
            ) : null}
            <label style={{ display: "grid", gap: 6, marginTop: 16, fontWeight: 600, fontSize: 13 }}>
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  minHeight: 44,
                  borderRadius: 11,
                  border: "1px solid var(--line)",
                  padding: "0 14px",
                }}
              />
            </label>
            {error ? (
              <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{error}</p>
            ) : null}
            <button type="submit" className="btn-primary" disabled={busy} style={{ marginTop: 16, width: "100%" }}>
              {busy ? "Unlocking…" : "Unlock"}
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 10, width: "100%" }}
              onClick={() => escalateToFullLogin()}
            >
              Sign in again
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
