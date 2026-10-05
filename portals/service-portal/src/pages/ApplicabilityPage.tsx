import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { checkApplicability, type ApplicabilityResult } from "../api/misc";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";

export function ApplicabilityPage() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplicabilityResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResult(await checkApplicability(query.trim()));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Applicability checker" }]} />
      <h1 className="page-h">Applicability checker</h1>
      <p className="page-lead">Free tool to check which standards and notifications may apply.</p>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Product or goal
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. bottled water for local sale"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy || !query.trim()}>
          {busy ? "Checking…" : "Check"}
        </button>
      </form>
      {result ? (
        <div className="prose">
          <p>{safeText(result.summary)}</p>
          <ol>
            {(result.steps || []).map((s) => (
              <li key={s.order}>
                <b>{safeText(s.title)}</b>: {safeText(s.detail)}
              </li>
            ))}
          </ol>
          <Link
            className="btn-primary"
            to={`/guide?q=${encodeURIComponent(query || "Find the standard for my product")}`}
          >
            Build full guide
          </Link>
        </div>
      ) : null}
    </div>
  );
}
