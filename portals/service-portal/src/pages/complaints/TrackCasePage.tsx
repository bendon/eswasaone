import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CrmBanner,
  CrmNotConnected,
  CrmNotConnectedError,
  lookupCase,
  useCrm,
} from "@eswasaone/shared-ui/crm";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { CasePublicView } from "./CasePublicView";

const proofKey = (ref: string) => `crm.track.${ref.toUpperCase()}`;

function readProof(ref: string): string | null {
  try {
    return sessionStorage.getItem(proofKey(ref));
  } catch {
    return null;
  }
}

function saveProof(ref: string, proof: string) {
  try {
    sessionStorage.setItem(proofKey(ref), proof);
  } catch {
    /* ignore */
  }
}

/**
 * Track a case without an account: reference + (tracking code | email | phone).
 * Email / phone go through a one-time code step. TODO: wire real — POST /cases/lookup sends the OTP.
 */
export function TrackCasePage() {
  const { ref: pathRef } = useParams();
  return pathRef ? <TrackedCase refId={pathRef.toUpperCase()} /> : <TrackLookup />;
}

function TrackLookup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [ref, setRef] = useState(params.get("ref") ?? "");
  const [proof, setProof] = useState("");
  const [stage, setStage] = useState<"lookup" | "otp">("lookup");
  const [otp, setOtp] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  async function find(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = ref.trim().toUpperCase();
      const c = await lookupCase(r, proof);
      if (!c) {
        setErr("We couldn't find a case with that reference and those details. Check both and try again.");
        return;
      }
      if (proof.trim().toUpperCase().startsWith("TRK")) {
        saveProof(r, proof.trim());
        navigate(`/complaints/track/${r}`);
        return;
      }
      // Contact details match: confirm with a one-time code.
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setSentCode(code);
      setStage("otp");
    } catch (e2) {
      if (e2 instanceof CrmNotConnectedError) setNotConnected(true);
      else setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  function verify(e: FormEvent) {
    e.preventDefault();
    if (otp.trim() !== sentCode) {
      setErr("That code doesn't match. Check the latest message we sent.");
      return;
    }
    const r = ref.trim().toUpperCase();
    saveProof(r, proof.trim());
    navigate(`/complaints/track/${r}`);
  }

  return (
    <div className="page crm-pub" style={{ maxWidth: 640 }}>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Complaints & enquiries", to: "/complaints" }, { label: "Track a case" }]} />
      <h1 className="page-h">Track a case</h1>
      <p className="page-lead">No account needed. Use the reference from your confirmation.</p>
      {notConnected ? <CrmNotConnected what="Case tracking" audience="public" /> : null}
      {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
      {stage === "lookup" ? (
        <form className="crm-card crm-form" onSubmit={find}>
          <label className="crm-field">
            Case reference
            <input className="crm-input crm-mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="CS-26-0141" autoFocus={!ref} />
          </label>
          <label className="crm-field">
            Tracking code, email or phone
            <span className="hint">Anonymous? Use the tracking code (starts with TRK) from your confirmation.</span>
            <input className="crm-input" value={proof} onChange={(e) => setProof(e.target.value)} autoFocus={Boolean(ref)} />
          </label>
          <button type="submit" className="crm-btn crm-btn--pri crm-btn--lg" disabled={busy || !ref.trim() || !proof.trim()}>
            {busy ? "Checking…" : "Find my case"}
          </button>
        </form>
      ) : (
        <form className="crm-card crm-form" onSubmit={verify}>
          <CrmBanner tone="info">
            We've sent a 6-digit code to {proof.trim()}. <b>Demo:</b> the code is <span className="crm-mono">{sentCode}</span>.
          </CrmBanner>
          <label className="crm-field">
            One-time code
            <input className="crm-input crm-mono" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} autoFocus />
          </label>
          <div className="crm-row">
            <button type="button" className="crm-btn" onClick={() => setStage("lookup")}>
              Back
            </button>
            <button type="submit" className="crm-btn crm-btn--pri" disabled={otp.trim().length !== 6}>
              Open my case
            </button>
          </div>
        </form>
      )}
      <p className="crm-small" style={{ marginTop: 14 }}>
        Have an account? <Link to="/account/cases">See all your cases</Link>.
      </p>
    </div>
  );
}

function TrackedCase({ refId }: { refId: string }) {
  const proof = readProof(refId);
  // useCrm re-runs on store changes, so staff replies show up without a reload.
  const res = useCrm(() => (proof ? lookupCase(refId, proof) : Promise.resolve(null)), [refId, proof]);

  const crumbs = [
    { label: "Home", to: "/" },
    { label: "Complaints & enquiries", to: "/complaints" },
    { label: refId },
  ];

  return (
    <div className="page crm-pub" style={{ maxWidth: 860 }}>
      <Breadcrumbs items={crumbs} />
      {res.notConnected ? (
        <CrmNotConnected what="Case tracking" audience="public" />
      ) : res.loading && res.data === undefined ? (
        <p className="crm-muted">Loading…</p>
      ) : !res.data ? (
        <CrmBanner>
          Confirm it's you to open {refId}. <Link to={`/complaints/track?ref=${refId}`}>Enter your tracking code or contact details</Link>.
        </CrmBanner>
      ) : (
        <CasePublicView c={res.data} onChange={() => res.reload()} />
      )}
    </div>
  );
}
