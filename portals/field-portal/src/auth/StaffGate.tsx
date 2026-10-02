import { useEffect, useState, type FormEvent } from "react";
import {
  AuthError,
  BrandLogo,
  login,
  requestOtp,
  logout,
  isLoginChallenge,
  hasStaffRole,
  type SessionUser,
} from "@eswasaone/shared-ui";

type Props = {
  onStaffSession: (user: SessionUser) => void;
  deniedMessage?: string | null;
};

type Step = "credentials" | "otp";

/**
 * Full-page staff gate for Field — password → OTP.
 * Non-staff sessions are cleared with a Service Portal pointer.
 */
export function StaffGate({ onStaffSession, deniedMessage }: Props) {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(deniedMessage ?? null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    setError(deniedMessage ?? null);
  }, [deniedMessage]);

  function resetToPassword(message?: string) {
    setStep("credentials");
    setChallengeId(null);
    setOtp("");
    setHint(null);
    if (message) setError(message);
    else setError(null);
  }

  async function finishStaffSession(user: SessionUser) {
    if (!hasStaffRole(user.roles)) {
      await logout().catch(() => undefined);
      resetToPassword(
        "This account is for the Service Portal (citizen), not Field staff. Sign in there, or ask Desk to invite you as staff.",
      );
      return;
    }
    onStaffSession(user);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "credentials") {
        setHint(null);
        const result = await login({
          email: identity.includes("@") ? identity : undefined,
          username: identity.includes("@") ? undefined : identity,
          password,
        });
        if (isLoginChallenge(result)) {
          setChallengeId(result.challenge_id);
          setStep("otp");
          setOtp("");
          setHint(
            result.message ||
              (result.stubbed
                ? "Enter the one-time code from the Core server log (SMTP not configured yet)."
                : "Enter the one-time code sent to your email."),
          );
          return;
        }
        await finishStaffSession(result.user);
        return;
      }

      if (!challengeId) {
        resetToPassword("Sign-in expired — enter your password again.");
        return;
      }

      const session = await login({
        email: identity.includes("@") ? identity : undefined,
        username: identity.includes("@") ? undefined : identity,
        otp: otp.trim(),
        challenge_id: challengeId,
      });
      if (isLoginChallenge(session)) {
        resetToPassword("Sign-in expired — enter your password again.");
        return;
      }
      await finishStaffSession(session.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      if (step === "otp") {
        if (err instanceof AuthError && err.reason === "challenge_required") {
          resetToPassword(msg);
        } else {
          setError(msg);
          setOtp("");
        }
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(identity.trim());
      setHint(res.message ?? "A new code was issued.");
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staff-gate field-gate">
      <div className="staff-gate__card">
        <BrandLogo variant="lockup" className="staff-gate__brand" />
        <p className="staff-gate__eyebrow">FIELD APP</p>
        <h1 className="staff-gate__title">Staff sign-in</h1>
        <p className="staff-gate__lead">
          Mobile workspace for ESWASA employees — leave, pay, claims, and audits.
        </p>
        {error ? <div className="staff-gate__error">{error}</div> : null}
        {hint && !error ? (
          <p className="staff-gate__lead" style={{ color: "var(--muted)" }}>
            {hint}
          </p>
        ) : null}
        <form onSubmit={(e) => void handleSubmit(e)} className="staff-gate__form">
          <label>
            Email or username
            <input
              type="text"
              required
              autoComplete="username"
              value={identity}
              disabled={step === "otp"}
              onChange={(e) => setIdentity(e.target.value)}
            />
          </label>
          {step === "credentials" ? (
            <label>
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          ) : (
            <label>
              One-time code
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </label>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Please wait…" : step === "credentials" ? "Continue" : "Verify & sign in"}
          </button>
          {step === "otp" ? (
            <>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => void resendOtp()}
                style={{ marginTop: 8 }}
              >
                Resend code
              </button>
              <button
                type="button"
                className="linkish"
                disabled={busy}
                onClick={() => resetToPassword()}
                style={{ marginTop: 8, background: "none", border: 0, cursor: "pointer" }}
              >
                ← Back to password
              </button>
            </>
          ) : null}
        </form>
        <p className="staff-gate__foot">
          Public services: <a href="/">Service Portal</a>
          {" · "}
          Desk: <a href="/institution/">Institution</a>
        </p>
      </div>
    </div>
  );
}
