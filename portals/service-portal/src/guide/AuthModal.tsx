import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@eswasaone/shared-ui";
import { login, stubLogin } from "./sessionStub";

type Props = {
  open: boolean;
  title: string;
  reason?: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function AuthModal({ open, title, reason, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setError(null);
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  async function continueWithEmail() {
    const value = email.trim();
    if (!value) {
      setError("Enter an email address to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login({ username: value, password: "demo" });
      onSuccess();
    } catch {
      // Core may reject unknown users — progressive auth demo still resumes
      stubLogin(value);
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="guide-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="guide-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="guide-modal__x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="guide-modal__mic">
          <Icon name="i-shield" />
        </div>
        <h3 id={titleId}>{title}</h3>
        <p>
          Browsing and guides are free. Sign in only to buy, apply, or track — one account works
          across standards, certification and training.
        </p>
        {reason ? (
          <div className="guide-modal__prov">
            <strong>Why this step needs an account</strong>
            <span>{reason}</span>
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          onKeyDown={(e) => {
            if (e.key === "Enter") void continueWithEmail();
          }}
        />
        {error ? <p className="guide-modal__err">{error}</p> : null}
        <button
          type="button"
          className="guide-modal__cta"
          disabled={busy}
          onClick={() => void continueWithEmail()}
        >
          {busy ? "Signing in…" : "Continue with email"}
        </button>
        <button
          type="button"
          className="guide-modal__alt"
          disabled={busy}
          onClick={() => void continueWithEmail()}
        >
          Continue with a business account
        </button>
        <div className="guide-modal__note">After signing in you’ll return exactly where you left off.</div>
      </div>
    </div>
  );
}
