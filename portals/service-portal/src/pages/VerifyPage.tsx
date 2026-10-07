import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { verifyToken, type VerificationResult } from "../api/misc";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";

export function VerifyPage() {
  const { token: pathToken } = useParams();
  const [token, setToken] = useState(pathToken || "");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (pathToken) {
      setToken(pathToken);
      void run(pathToken);
    }
  }, [pathToken]);

  async function run(t: string) {
    setBusy(true);
    setFailed(false);
    try {
      setResult(await verifyToken(t.trim()));
    } catch {
      setResult(null);
      setFailed(true);
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
      <p className="page-note">
        Looking for suspended, withdrawn or reduced-scope certifications? See the{" "}
        <Link to="/certification/status">public status register</Link>.
      </p>
      {failed ? (
        <div className="verify-result">
          <b>Couldn’t check right now</b>
          <p>
            The register didn’t respond, so no result is shown. Try again, or ask the Marketing &amp; Sales
            Officer on (+268) 2518 4633.
          </p>
        </div>
      ) : null}
      {result ? (
        <div className={`verify-result${result.valid ? " ok" : ""}`}>
          <b>{result.valid ? "Valid" : "Not found"}</b>
          <p>Token: {safeText(result.token)}</p>
          {result.subject ? <p>{safeText(result.subject)}</p> : null}
          <p style={{ marginTop: 10 }}>
            {result.valid ? (
              <>
                Product doesn't live up to its certificate?{" "}
                <Link to={`/complaints/new/product_report?cert=${encodeURIComponent(result.token)}`}>Report this product</Link>.
              </>
            ) : (
              <>
                Seen this number or a mark on a product?{" "}
                <Link to={`/complaints/new/mark_misuse?cert=${encodeURIComponent(result.token)}`}>Report a possible fake</Link> — you can stay anonymous.
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
