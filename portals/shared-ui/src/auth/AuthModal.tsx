import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  AuthError,
  isLoginChallenge,
  login,
  register,
  requestOtp,
  requestPasswordReset,
  type SessionUser,
} from "./session";
import { BrandLogo } from "../brand/BrandLogo";
import { focusFirst, onEscape, setBodyScrollLocked, trapFocus } from "../system/a11y";

export type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (user: SessionUser) => void;
  title?: string;
  reason?: string;
};

type Mode = "login" | "register" | "forgot";
type AuthStep = "credentials" | "otp";

export function AuthModal({
  open,
  onClose,
  onSuccess,
  title = "Sign in to continue",
  reason,
}: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<AuthStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Reset the whole state machine whenever the modal opens, so a prior
  // half-finished login/signup (e.g. stale OTP challenge) can't bleed into a
  // new open. Challenge_id has a ~10-min TTL.
  useEffect(() => {
    if (!open) return;
    setMode("login");
    setStep("credentials");
    setEmail("");
    setPassword("");
    setName("");
    setOtp("");
    setChallengeId(null);
    setError(null);
    setHint(null);
    setEmailHint(null);
    setResetSent(false);
    setBodyScrollLocked(true);
    const root = rootRef.current;
    const t = window.setTimeout(() => focusFirst(root), 40);
    const releaseTrap = root ? trapFocus(root) : () => {};
    const releaseEsc = onEscape(onClose);
    return () => {
      window.clearTimeout(t);
      releaseTrap();
      releaseEsc();
      setBodyScrollLocked(false);
    };
  }, [open, onClose]);

  if (!open) return null;

  function enterOtpChallenge(result: {
    challenge_id: string;
    message?: string | null;
    email_hint?: string | null;
  }) {
    setChallengeId(result.challenge_id);
    setStep("otp");
    setOtp("");
    setEmailHint(result.email_hint ?? null);
    setHint(
      result.message ??
        (mode === "register"
          ? "Enter the one-time code sent to your email to finish signing up."
          : "Enter the one-time code sent to your email."),
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      if (mode === "forgot") {
        const r = await requestPasswordReset(email);
        setResetSent(true);
        setHint(r.message ?? null);
        return;
      }

      // OTP step — shared by sign-in and sign-up (complete via /auth/login).
      if (step === "otp") {
        const session = await login({
          email,
          otp,
          challenge_id: challengeId ?? undefined,
        });
        if (isLoginChallenge(session)) {
          resetToCredentials();
          setError("Sign-in expired. Enter your details again.");
          return;
        }
        onSuccess?.(session.user);
        onClose();
        return;
      }

      if (mode === "register") {
        const result = await register({
          email,
          name: name || email.split("@")[0],
          password: password || undefined,
        });
        if (isLoginChallenge(result)) {
          enterOtpChallenge(result);
          return;
        }
        // Legacy: full session without OTP (should not happen after contract change).
        onSuccess?.(result.user);
        onClose();
        return;
      }

      const result = await login({ email, password });
      if (isLoginChallenge(result)) {
        enterOtpChallenge(result);
        return;
      }
      onSuccess?.(result.user);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      if (step === "otp") {
        // Only restart from credentials when the backend explicitly says the
        // challenge is gone (reason="challenge_required"). A wrong code should
        // let the user retry the OTP in place.
        if (err instanceof AuthError && err.reason === "challenge_required") {
          resetToCredentials();
        }
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function resetToCredentials() {
    setStep("credentials");
    setChallengeId(null);
    setOtp("");
    setEmailHint(null);
    setHint(null);
  }

  async function handleResend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const r = await requestOtp(email);
      setHint(r.message ?? "Code sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setBusy(false);
    }
  }

  const showPassword =
    mode === "forgot"
      ? false
      : step === "credentials" && (mode === "login" || mode === "register");
  const showName = mode === "register" && step === "credentials";
  const showOtp = (mode === "login" || mode === "register") && step === "otp";
  const showTabs = mode !== "forgot" && step === "credentials";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="overlay show"
      style={{ display: "grid", placeItems: "center" }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        style={{
          width: "min(420px, 100%)",
          background: "var(--card)",
          color: "var(--ink)",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 24px 48px rgba(16,24,40,0.18)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div className="auth-brand">
          <BrandLogo variant="lockup" className="auth-brand__lockup" />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, width: "100%" }}>
            <h2 id="auth-modal-title" style={{ margin: 0, fontSize: 20 }}>
              {mode === "forgot"
                ? "Reset password"
                : step === "otp" && mode === "register"
                  ? "Verify your email"
                  : title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" style={btnGhost}>
              ×
            </button>
          </div>
          <p className="auth-brand__by">Operated by Eswatini Standards Authority</p>
        </div>
        {mode === "forgot" ? (
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            Enter your account email and we'll send a link to set a new password.
          </p>
        ) : step === "otp" ? (
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            {mode === "register"
              ? "We sent a one-time code to confirm your email. Enter it below to finish creating your account."
              : "Enter the one-time code we sent to finish signing in."}
          </p>
        ) : (
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            Browsing and guides stay free. Sign in to buy, apply, or track.
          </p>
        )}
        {reason && step === "credentials" ? (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "var(--gold-l)",
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            <strong>Why this needs an account</strong>
            <div style={{ marginTop: 4 }}>{reason}</div>
          </div>
        ) : null}

        {showTabs ? (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setHint(null);
                  setStep("credentials");
                  setChallengeId(null);
                  setOtp("");
                }}
                style={{
                  ...btnGhost,
                  fontWeight: mode === m ? 700 : 500,
                  borderBottom: mode === m ? "2px solid var(--navy)" : "2px solid transparent",
                  borderRadius: 0,
                }}
              >
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>
        ) : null}

        <label style={labelStyle}>
          Email
          <input
            type="email"
            required
            value={email}
            disabled={step === "otp"}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
        </label>

        {showName ? (
          <label style={labelStyle}>
            Full name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoComplete="name"
            />
          </label>
        ) : null}

        {showPassword ? (
          <label style={labelStyle}>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>
        ) : null}

        {mode === "login" && step === "credentials" ? (
          <button
            type="button"
            disabled={busy}
            style={{
              ...btnGhost,
              marginTop: 4,
              padding: 0,
              fontSize: 13,
              textDecoration: "underline",
              color: "var(--muted)",
            }}
            onClick={() => {
              setMode("forgot");
              setError(null);
              setHint(null);
              setResetSent(false);
            }}
          >
            Forgot password?
          </button>
        ) : null}

        {showOtp ? (
          <label style={labelStyle}>
            One-time code
            <input
              type="text"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              style={inputStyle}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
        ) : null}

        {showOtp && emailHint ? (
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
            Code sent to <strong>{emailHint}</strong>
          </p>
        ) : null}
        {hint && !error ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>{hint}</p>
        ) : null}
        {error ? (
          <p style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{error}</p>
        ) : null}

        <button type="submit" disabled={busy} style={btnPrimary}>
          {busy
            ? "Please wait…"
            : mode === "forgot"
              ? resetSent
                ? "Resend reset link"
                : "Send reset link"
              : step === "otp"
                ? mode === "register"
                  ? "Verify & create account"
                  : "Verify & sign in"
                : mode === "register"
                  ? "Continue"
                  : "Continue"}
        </button>

        {mode === "forgot" ? (
          <button
            type="button"
            disabled={busy}
            style={{ ...btnGhost, marginTop: 10, textDecoration: "underline" }}
            onClick={() => {
              setMode("login");
              setStep("credentials");
              setError(null);
              setHint(null);
              setResetSent(false);
              setOtp("");
              setChallengeId(null);
              setEmailHint(null);
            }}
          >
            ← Back to sign in
          </button>
        ) : null}

        {showOtp ? (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
            <button
              type="button"
              disabled={busy}
              style={{ ...btnGhost, textDecoration: "underline" }}
              onClick={resetToCredentials}
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={busy}
              style={{ ...btnGhost, textDecoration: "underline" }}
              onClick={() => void handleResend()}
            >
              Resend code
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  marginTop: 14,
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  font: "inherit",
  boxSizing: "border-box",
};

const btnPrimary: CSSProperties = {
  width: "100%",
  marginTop: 18,
  padding: "12px 14px",
  border: 0,
  borderRadius: 10,
  background: "var(--gold)",
  color: "var(--gold-ink)",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  font: "inherit",
  padding: "6px 4px",
  color: "inherit",
};
