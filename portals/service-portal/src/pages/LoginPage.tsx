import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  BrandLogo,
  isLoginChallenge,
  login,
  redirectStaffAfterLogin,
  requestPasswordReset,
} from "@eswasaone/shared-ui";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";

export function LoginPage() {
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"login" | "forgot">("login");
  const [resetSent, setResetSent] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const { refresh, openAuth } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const result = await login({ email, password });
      if (isLoginChallenge(result)) {
        // Full OTP UI lives in AuthModal — hand off (modal resets; user re-enters password once).
        openAuth({ next, title: "Complete sign-in", reason: result.message });
        setErr("A one-time code was sent. Continue in the sign-in dialog.");
        return;
      }
      const u = await refresh();
      if (u && redirectStaffAfterLogin(u.roles)) return;
      navigate(next);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await requestPasswordReset(email);
      setResetSent(true);
      setResetMsg(r.message ?? null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not send reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Sign in" }]} />
      <div className="auth-brand" style={{ marginBottom: 20 }}>
        <BrandLogo variant="lockup" className="auth-brand__lockup" />
        <p className="auth-brand__by">Operated by Eswatini Standards Authority</p>
      </div>
      {view === "login" ? (
        <>
          <h1 className="page-h">Sign in</h1>
          <p className="page-lead">
            Prefer the modal?{" "}
            <button type="button" className="linkish" onClick={() => openAuth({ next })}>
              Open sign-in
            </button>
          </p>
          <form className="form" onSubmit={onSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {err ? <p className="page-note">{err}</p> : null}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="page-note">
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setView("forgot");
                setErr(null);
                setResetSent(false);
                setResetMsg(null);
              }}
            >
              Forgot password?
            </button>
          </p>
        </>
      ) : (
        <>
          <h1 className="page-h">Reset password</h1>
          <p className="page-lead">
            Enter your account email and we'll send a link to set a new password.
          </p>
          {resetSent && resetMsg ? (
            <p className="page-note" style={{ background: "var(--gold-l)", padding: 12, borderRadius: 10 }}>
              {resetMsg}
            </p>
          ) : null}
          <form className="form" onSubmit={onReset}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {err ? <p className="page-note">{err}</p> : null}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Sending…" : resetSent ? "Resend reset link" : "Send reset link"}
            </button>
          </form>
          <p className="page-note">
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setView("login");
                setErr(null);
                setResetSent(false);
                setResetMsg(null);
              }}
            >
              ← Back to sign in
            </button>
          </p>
        </>
      )}
      <p className="page-note">
        <Link to="/">Back to Home</Link>
      </p>
    </div>
  );
}
