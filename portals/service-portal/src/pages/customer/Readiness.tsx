/**
 * Readiness self-assessment (05 P3): a guided gap analysis before applying. The answers become a score,
 * a gap list with what to do next, and pre-filled application data (scheme, scope, existing certificates).
 * Stays on this device until the customer starts the application.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { getListedSchemes, schemeById } from "../../api/certification";
import { saveDraft } from "../../certification/demoStore";
import type { CertFlow } from "../../certification/flows";
import { emptyWizard } from "../../certification/wizard";
import { PublicPage } from "./ui";

type Answer = "yes" | "partly" | "no";
type Q = { id: string; text: string; why: string; fix: string; critical?: boolean };

const COMMON: Q[] = [
  { id: "registered", text: "Is the business registered and trading legally in Eswatini?", why: "Certificates are issued to a legal entity.", fix: "Keep your registration certificate and trading licence ready to upload.", critical: true },
  { id: "scope", text: "Can you describe exactly which products, sites or activities you want certified?", why: "The scope decides the audit time and what appears on the certificate.", fix: "Write one or two sentences naming the products/services and the sites." },
  { id: "owner", text: "Is one named person responsible for certification and available for the audit?", why: "Auditors need a contact who can show records and answer questions.", fix: "Nominate a management representative and a deputy." },
];

const BY_FLOW: Record<CertFlow, Q[]> = {
  ms: [
    { id: "policy", text: "Do you have a written quality (or food safety) policy and objectives?", why: "Clause 5 of the ISO management system standards.", fix: "Draft a one-page policy and 3–5 measurable objectives, signed by top management.", critical: true },
    { id: "procedures", text: "Are your key processes documented and followed?", why: "Auditors check that what is written is what happens.", fix: "Map your main processes and write short procedures for each." },
    { id: "records", text: "Do you keep records for at least the last 3 months?", why: "The Stage 2 audit samples records to prove the system runs.", fix: "Start keeping records now; most bodies want 3 months of evidence." },
    { id: "internal_audit", text: "Have you done a full internal audit?", why: "Required before the certification audit.", fix: "Train an internal auditor (ESWASA runs courses) and audit every clause once.", critical: true },
    { id: "review", text: "Has top management held a management review?", why: "Required before the certification audit.", fix: "Hold and minute a management review covering the standard's required inputs.", critical: true },
  ],
  product: [
    { id: "standard", text: "Do you know which SZNS or other standard your product must meet?", why: "Testing is against a named standard.", fix: "Use 'Check which standards apply' or ask the standards desk.", critical: true },
    { id: "tested", text: "Has the product been tested against that standard (in-house or by a lab)?", why: "Failing samples are the most common reason for delay.", fix: "Test a sample first; ESWASA's lab can do pre-certification tests." },
    { id: "factory", text: "Do you have documented factory production control (inspection, calibration, non-conforming product)?", why: "The factory inspection checks consistency, not just one sample.", fix: "Write inspection and test plans; calibrate measuring equipment." },
    { id: "labels", text: "Do labels show the required information (name, batch, standard reference)?", why: "Labelling is checked at inspection and on market samples.", fix: "Check the labelling clause of the standard and update artwork." },
  ],
  ingelo: [
    { id: "local", text: "Is the business majority-owned by Emaswati and the product made in Eswatini?", why: "Ingelo eligibility rule.", fix: "Ingelo is reserved for local MSMEs; ask us about product certification instead.", critical: true },
    { id: "hygiene", text: "Is production clean, safe and consistent from batch to batch?", why: "The Ingelo assessment checks basic good manufacturing practice.", fix: "Use a simple checklist each production day and keep it." },
    { id: "labels", text: "Does your packaging carry your name, contents and a batch or date?", why: "Needed for traceability and the Ingelo mark.", fix: "Add a batch or production date to each pack." },
    { id: "scale", text: "Are you ready to grow supply if buyers ask?", why: "Ingelo supports producers who want to scale.", fix: "Note your capacity today and what you'd need to double it." },
  ],
  combined: [
    { id: "policy", text: "Do you have a written quality policy and objectives?", why: "Management system part of the combined scheme.", fix: "Draft and sign a one-page policy and objectives.", critical: true },
    { id: "internal_audit", text: "Have you done a full internal audit and management review?", why: "Required before the certification audit.", fix: "Audit every clause once and hold a minuted management review.", critical: true },
    { id: "tested", text: "Has each product been tested against its standard?", why: "Product part of the combined scheme.", fix: "Test a sample first; ESWASA's lab can do pre-certification tests." },
    { id: "factory", text: "Do you have documented factory production control?", why: "The factory inspection checks consistency.", fix: "Write inspection and test plans; calibrate measuring equipment." },
  ],
};

const PTS: Record<Answer, number> = { yes: 2, partly: 1, no: 0 };

export function ReadinessPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const schemes = getListedSchemes();
  const [schemeId, setSchemeId] = useState(schemeById(params.get("scheme") ?? "")?.id ?? schemes[0]?.id ?? "iso9001");
  const scheme = schemeById(schemeId);
  const flow: CertFlow = scheme?.flow ?? "ms";
  const questions = useMemo(() => [...COMMON, ...BY_FLOW[flow]], [flow]);
  const [ans, setAns] = useState<Record<string, Answer>>({});
  const [scope, setScope] = useState("");
  const [existing, setExisting] = useState("");

  const answered = questions.filter((q) => ans[q.id]).length;
  const score = Math.round((questions.reduce((n, q) => n + (ans[q.id] ? PTS[ans[q.id]] : 0), 0) / (questions.length * 2)) * 100);
  const gaps = questions.filter((q) => ans[q.id] && ans[q.id] !== "yes");
  const blockers = gaps.filter((q) => q.critical && ans[q.id] === "no");
  const complete = answered === questions.length;
  const verdict = !complete ? null : blockers.length ? "not_yet" : score >= 80 ? "ready" : "nearly";

  const start = () => {
    const w = emptyWizard(schemeId);
    w.scope = scope.trim();
    w.existing_certs = existing.trim();
    if (verdict !== "ready") w.wantsConsultation = "yes";
    saveDraft(`apply.${schemeId}`, w);
    nav(`/certification/apply?scheme=${encodeURIComponent(schemeId)}`);
  };

  return (
    <PublicPage
      crumbs={[{ label: "Home", to: "/" }, { label: "Certification", to: "/certification" }, { label: "Am I ready?" }]}
      title="Are you ready for certification?"
      lead="Ten minutes, no sign-in. Answer honestly — you get a readiness score, the gaps to close first, and an application that's already started for you."
    >
      <div className="cf-card crm-stack">
        <label className="crm-field">
          Which certification?
          <select className="crm-select" value={schemeId} onChange={(e) => (setSchemeId(e.target.value), setAns({}))}>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        {questions.map((q, i) => (
          <div key={q.id} className="crm-row" style={{ justifyContent: "space-between", alignItems: "flex-start", borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
            <div style={{ flex: "1 1 320px" }}>
              <b>
                {i + 1}. {q.text}
              </b>
              <span className="crm-small" style={{ display: "block" }}>
                {q.why}
                {q.critical ? " Must-have." : ""}
              </span>
            </div>
            <div className="crm-seg" role="radiogroup" aria-label={q.text}>
              {(["yes", "partly", "no"] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={ans[q.id] === a} className={ans[q.id] === a ? "on" : ""} onClick={() => setAns({ ...ans, [q.id]: a })}>
                  {a === "yes" ? "Yes" : a === "partly" ? "Partly" : "No"}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="crm-form crm-form--2">
          <label className="crm-field">
            What do you want certified? (optional — goes into your application)
            <textarea className="crm-textarea" rows={2} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. Manufacture of packaged honey at the Manzini plant" />
          </label>
          <label className="crm-field">
            Certificates you already hold (optional)
            <textarea className="crm-textarea" rows={2} value={existing} onChange={(e) => setExisting(e.target.value)} placeholder="e.g. HACCP (2024, SGS)" />
          </label>
        </div>
      </div>

      <div className="cf-card" style={{ marginTop: 16 }} aria-live="polite">
        <div className="crm-row" style={{ alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Readiness {answered ? `${score}%` : "—"}</h2>
          <span className="crm-small">
            {answered} of {questions.length} answered
          </span>
        </div>
        {verdict === "ready" ? <p>You look ready to apply. Start your application below — we've filled in what you told us.</p> : null}
        {verdict === "nearly" ? <p>Nearly there. Close the gaps below while you apply; our free consultation can help.</p> : null}
        {verdict === "not_yet" ? <p>Not yet. Close the must-haves first, or apply and ask for the free consultation and gap analysis.</p> : null}
        {gaps.length ? (
          <ol>
            {[...blockers, ...gaps.filter((g) => !blockers.includes(g))].map((g) => (
              <li key={g.id} style={{ marginBottom: 6 }}>
                <b>{g.text.replace(/\?$/, "")}</b> — {ans[g.id] === "no" ? "not in place" : "partly in place"}
                {g.critical && ans[g.id] === "no" ? <span className="crm-pill crm-pill--red" style={{ marginLeft: 6 }}>Must-have</span> : null}
                <span className="crm-small" style={{ display: "block" }}>{g.fix}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="crm-row" style={{ marginTop: 10 }}>
          <button type="button" className="cf-btn cf-btn--pri" disabled={!complete} onClick={start}>
            Start my application <Icon name="i-cright" />
          </button>
          <Link className="cf-btn cf-btn--ghost" to="/certification/quote">
            Request a quote first
          </Link>
          <button type="button" className="cf-btn cf-btn--ghost" disabled={!answered} onClick={() => window.print()}>
            Print my gap list
          </button>
        </div>
      </div>
    </PublicPage>
  );
}
