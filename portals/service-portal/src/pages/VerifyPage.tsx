import { type FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verifyToken, type VerificationResult } from "../api/misc";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";

export function VerifyPage() {
  const { token: pathToken } = useParams();
  const [token, setToken] = useState(pathToken || "");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pathToken) {
      setToken(pathToken);
      void run(pathToken);
    }
  }, [pathToken]);

  async function run(t: string) {
    setBusy(true);
    try {
      setResult(await verifyToken(t.trim()));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(token);
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Verify" }]} />
      <h1 className="page-h">Verify a certificate or mark</h1>
      <p className="page-lead">Public register. Enter a number or open a QR deep link.</p>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Certificate / mark number
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="e.g. ESW-2026-0042"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy || !token.trim()}>
          {busy ? "Checking…" : "Verify"}
        </button>
      </form>
      {result ? (
        <div className={`verify-result${result.valid ? " ok" : ""}`}>
          <b>{result.valid ? "Valid" : "Not found"}</b>
          <p>Token: {safeText(result.token)}</p>
          {result.subject ? <p>{safeText(result.subject)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
