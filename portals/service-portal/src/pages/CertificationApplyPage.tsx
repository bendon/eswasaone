import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createApplication, SCHEMES } from "../api/certification";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";

export function CertificationApplyPage() {
  const [params] = useSearchParams();
  const [scheme, setScheme] = useState(params.get("scheme") || SCHEMES[0].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { requireAuth } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !requireAuth({
        title: "Sign in to apply",
        reason: "Applying creates a tracked case under your account.",
        next: `/certification/apply?scheme=${encodeURIComponent(scheme)}`,
      })
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const app = await createApplication(scheme);
      navigate(`/certification/${app.id}`);
    } catch {
      setErr("Could not create application. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Certification", to: "/certification" },
          { label: "Apply" },
        ]}
      />
      <h1 className="page-h">Apply for certification</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Scheme
          <select value={scheme} onChange={(e) => setScheme(e.target.value)}>
            {SCHEMES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        {err ? <p className="page-note">{err}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </div>
  );
}
