import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  createApplication,
  listQuotes,
  respondToQuote,
  schemeById,
  SCHEMES,
  schemeTitle,
  type ApplicationDetail,
  type Quote,
} from "../api/certification";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { CERT_EMAIL, clearDraft, demoMode, loadDraft, mailtoCert, saveDraft } from "../certification/demoStore";
import {
  BusinessStep,
  ConsultStep,
  ContactsStep,
  DeclareStep,
  DocumentsStep,
  EligibilityStep,
  FactoryStep,
  OrganisationStep,
  ProductsStep,
  RequirementsStep,
  SchemeStep,
  ScopeStep,
  SystemStep,
} from "../certification/applySteps";
import {
  det,
  detList,
  detProducts,
  emptyWizard,
  SOFT_STEPS,
  STEP_LABEL,
  stepsFor,
  validateStep,
  type StepKey,
  type WizardState,
} from "../certification/wizard";
import { CHARTER, FLOW_LABEL, FLOW_STAGES, fmtDate } from "../certification/flows";
import { NotSentNotice, Sheet } from "../certification/ui";

const STEP_LEAD: Partial<Record<StepKey, string>> = {
  scheme: "Confirm the scheme and link your quote if you already have one.",
  eligibility: "Four quick questions from the Ingelo Certification Scheme.",
  consult: "Optional, but recommended for first-time applicants.",
  organisation: "As registered. This appears on your certificate.",
  contacts: "Who ESWASA should talk to about this application.",
  scope: "What the certificate will cover, and where.",
  system: "Helps ESWASA plan Stage 1 and Stage 2 audit time.",
  products: "The products that should carry the SZNS mark.",
  factory: "Where the initial assessment and sampling happen.",
  business: "Section 2 of form CER_FO_002_IPC.",
  requirements: "Section 3 of form CER_FO_002_IPC.",
  documents: "Upload now or later. Nothing is lost.",
  declare: "Read and accept before you submit.",
  review: "Check everything, then send it to ESWASA.",
};

function draftKey(scheme: string) {
  return `apply.${scheme}`;
}

export function CertificationApplyPage() {
  const [params] = useSearchParams();
  const requested = params.get("scheme");
  const initialScheme = schemeById(requested || "")?.id ?? SCHEMES[0].id;
  const { user, requireAuth } = useAuth();

  const [s, setS] = useState<WizardState>(() => {
    const draft = loadDraft<WizardState>(draftKey(initialScheme));
    const base = draft ?? emptyWizard(initialScheme);
    const q = params.get("quote");
    if (q && !draft) base.quote_ref = q;
    return base;
  });
  const steps = useMemo(() => stepsFor(s.flow), [s.flow]);
  const [idx, setIdx] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [done, setDone] = useState<ApplicationDetail | null>(null);

  const step = steps[Math.min(idx, steps.length - 1)];

  useEffect(() => {
    void listQuotes().then(setQuotes);
  }, []);

  useEffect(() => {
    if (!user) return;
    setS((prev) => {
      if (prev.contact.name || prev.contact.email) return prev;
      const next = structuredClone(prev);
      next.contact.name = user.full_name || "";
      next.contact.email = user.email || "";
      next.signature.name = next.signature.name || user.full_name || "";
      return next;
    });
  }, [user]);

  useEffect(() => {
    if (!done) saveDraft(draftKey(s.scheme), s);
  }, [s, done]);

  const set = (fn: (d: WizardState) => void) =>
    setS((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  function go(to: number) {
    setErrors({});
    setIdx(to);
    setReached((r) => Math.max(r, to));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    const e = validateStep(step, s);
    if (Object.keys(e).length && !SOFT_STEPS.includes(step)) {
      setErrors(e);
      requestAnimationFrame(() =>
        document.querySelector(".cf-field.is-invalid, .cf-field .err, .cf-note--err")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
      return;
    }
    go(idx + 1);
  }

  function firstInvalidStep(): number {
    for (let i = 0; i < steps.length - 1; i += 1) {
      if (SOFT_STEPS.includes(steps[i])) continue;
      if (Object.keys(validateStep(steps[i], s)).length) return i;
    }
    return -1;
  }

  function startSubmit() {
    const bad = firstInvalidStep();
    if (bad >= 0) {
      go(bad);
      setErrors(validateStep(steps[bad], s));
      return;
    }
    if (
      !requireAuth({
        title: "Sign in to submit",
        reason: "Submitting creates a tracked certification case under your account. Your answers are saved.",
        next: `/certification/apply?scheme=${encodeURIComponent(s.scheme)}`,
      })
    ) {
      return;
    }
    setSubmitErr(null);
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    setSubmitErr(null);
    try {
      const q = quotes.find((x) => x.id === s.quote_ref);
      if (q?.status === "issued") await respondToQuote(q.id, true);
      const { eligibility: _e, wantsConsultation: _w, confirmCommit: _c, ...payload } = s;
      if (s.flow === "ingelo") payload.details = { ...payload.details, eligibility: "passed" };
      const created = await createApplication(payload);
      clearDraft(draftKey(s.scheme));
      setConfirming(false);
      setDone(created);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitErr("ESWASA's system didn't accept the application, so nothing was sent. Your answers are saved on this device. Try again, or email the application instead.");
    } finally {
      setBusy(false);
    }
  }

  const crumbs = (
    <Breadcrumbs
      items={[
        { label: "Home", to: "/" },
        { label: "Certification", to: "/certification" },
        { label: s.flow === "ingelo" ? "Ingelo application" : "Apply" },
      ]}
    />
  );

  if (done) {
    const firstStages = FLOW_STAGES[done.flow];
    return (
      <div className="page">
        {crumbs}
        <div className="cf-wrap cf-wrap--single">
          <section className="cf-card cf-receipt" aria-live="polite">
            <span className="big">
              <Icon name="i-check" />
            </span>
            <h2>Application submitted</h2>
            <div className="ref">{done.id}</div>
            <ul>
              <li>
                <Icon name="i-mail" />
                <span>
                  ESWASA confirms receipt within {CHARTER.receiptDays} working days and schedules the{" "}
                  {done.flow === "product" ? "assessment" : "audit"} within {CHARTER.auditScheduleDays} working
                  days of a complete application.
                </span>
              </li>
              {done.consultation ? (
                <li>
                  <Icon name="i-cal" />
                  <span>
                    Free consultation requested for {fmtDate(done.consultation.date)} ({done.consultation.mode}).
                  </span>
                </li>
              ) : null}
              {!demoMode() ? (
                <li>
                  <Icon name="i-file" />
                  <span>
                    ESWASA's system has your reference, scheme and contact details. Online upload of documents and the
                    full form isn't connected yet, so{" "}
                    <a href={mailtoCert(`Application ${done.id}: full details & documents`, applicationSummary(s, done.id))}>
                      email the full application
                    </a>{" "}
                    and your documents to {CERT_EMAIL}, quoting <b>{done.id}</b>.
                  </span>
                </li>
              ) : (
                <li>
                  <Icon name="i-file" />
                  <span>Demo mode: this application and its files exist only on this device.</span>
                </li>
              )}
              <li>
                <Icon name="i-steps" />
                <span>Next stage: {firstStages[1]?.title ?? "Review"}.</span>
              </li>
            </ul>
            <div className="cf-nav">
              <Link className="cf-btn cf-btn--pri" to={`/certification/${encodeURIComponent(done.id)}`}>
                <Icon name="i-trend" /> Open tracker
              </Link>
              <Link className="cf-btn cf-btn--ghost" to="/account/applications">
                My applications
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const stepProps = { s, set, errors };
  let body: ReactNode = null;
  switch (step) {
    case "scheme":
      body = <SchemeStep {...stepProps} quotes={quotes} />;
      break;
    case "eligibility":
      body = <EligibilityStep {...stepProps} />;
      break;
    case "consult":
      body = <ConsultStep {...stepProps} />;
      break;
    case "organisation":
      body = <OrganisationStep {...stepProps} />;
      break;
    case "contacts":
      body = <ContactsStep {...stepProps} />;
      break;
    case "scope":
      body = <ScopeStep {...stepProps} />;
      break;
    case "system":
      body = <SystemStep {...stepProps} />;
      break;
    case "products":
      body = <ProductsStep {...stepProps} />;
      break;
    case "factory":
      body = <FactoryStep {...stepProps} />;
      break;
    case "business":
      body = <BusinessStep {...stepProps} />;
      break;
    case "requirements":
      body = <RequirementsStep {...stepProps} />;
      break;
    case "documents":
      body = <DocumentsStep {...stepProps} />;
      break;
    case "declare":
      body = <DeclareStep {...stepProps} />;
      break;
    case "review":
      body = <Review s={s} steps={steps} onEdit={(k) => go(steps.indexOf(k))} quotes={quotes} />;
      break;
  }

  const isLast = idx === steps.length - 1;
  const ineligible = step === "eligibility" && errors.eligibility === "Not eligible for Ingelo.";

  return (
    <div className="page">
      {crumbs}
      <header className="cf-head">
        <div>
          <span className="cf-head__kicker">
            {FLOW_LABEL[s.flow]} · {s.flow === "ingelo" ? "Form CER_FO_002_IPC" : schemeTitle(s.scheme)}
          </span>
          <h1>{s.flow === "ingelo" ? "Apply for Ingelo certification" : "Apply for certification"}</h1>
          <p>
            Step {idx + 1} of {steps.length}. Your answers save on this device as you go. Sign in is only
            needed to submit.
          </p>
        </div>
        {s.flow === "ingelo" ? (
          <span className="cf-chip cf-chip--green">
            <Icon name="i-star" /> Free consultation &amp; gap analysis
          </span>
        ) : null}
      </header>

      <div className="cf-wrap">
        <nav className="cf-rail" aria-label="Application steps">
          <ol>
            {steps.map((k, i) => (
              <li key={k} className={i === idx ? "is-cur" : i < idx ? "is-done" : ""}>
                <button type="button" disabled={i > reached} onClick={() => go(i)} aria-current={i === idx ? "step" : undefined}>
                  <span className="n">{i < idx ? <Icon name="i-check" width={12} height={12} /> : i + 1}</span>
                  <span className="l">{STEP_LABEL[k]}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="cf-rail__foot">
            Need help? Call (+268) 2518 4633 or email{" "}
            <a href="mailto:certification@eswasa.co.sz">certification@eswasa.co.sz</a>.
          </div>
        </nav>

        <div>
          <section className="cf-card">
            <div className="cf-card__h">
              <div>
                <h2>{STEP_LABEL[step]}</h2>
                {STEP_LEAD[step] ? <p>{STEP_LEAD[step]}</p> : null}
              </div>
            </div>
            {body}
          </section>

          <div className="cf-nav">
            {idx > 0 ? (
              <button type="button" className="cf-btn cf-btn--ghost" onClick={() => go(idx - 1)}>
                <Icon name="i-cleft" /> Back
              </button>
            ) : (
              <Link className="cf-btn cf-btn--ghost" to="/certification">
                Cancel
              </Link>
            )}
            <span className="grow" />
            <span className="cf-nav__saved">Saved on this device</span>
            {isLast ? (
              <button type="button" className="cf-btn cf-btn--gold" onClick={startSubmit}>
                <Icon name="i-send" /> Submit application
              </button>
            ) : (
              <button type="button" className="cf-btn cf-btn--pri" onClick={next} disabled={ineligible}>
                Continue <Icon name="i-cright" />
              </button>
            )}
          </div>
        </div>
      </div>

      {confirming ? (
        <Sheet
          title="Submit your application to ESWASA?"
          lead="This creates a tracked certification case. You can still upload documents and answer questions afterwards."
          onClose={() => (busy ? undefined : setConfirming(false))}
        >
          <dl className="cf-kv" style={{ marginTop: 14 }}>
            <dt>Scheme</dt>
            <dd>{schemeTitle(s.scheme)}</dd>
            <dt>Organisation</dt>
            <dd>{s.org.name}</dd>
            <dt>Contact</dt>
            <dd>
              {s.contact.name} · {s.contact.email}
            </dd>
            {s.quote_ref ? (
              <>
                <dt>Quote</dt>
                <dd>{s.quote_ref} (accepted on submit)</dd>
              </>
            ) : null}
            <dt>Documents</dt>
            <dd>{s.documents.length} attached</dd>
          </dl>
          {submitErr ? (
            <NotSentNotice
              title="Not submitted."
              detail={submitErr}
              mailto={mailtoCert(`Certification application: ${s.org.name || schemeTitle(s.scheme)}`, applicationSummary(s))}
            />
          ) : null}
          <div className="cf-nav">
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Go back
            </button>
            <span className="grow" />
            <button type="button" className="cf-btn cf-btn--gold" onClick={() => void submit()} disabled={busy}>
              <Icon name="i-send" /> {busy ? "Submitting…" : "Confirm & submit"}
            </button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

/* ---------------- Review ---------------- */

function yn(v: string) {
  return v === "yes" ? "Yes" : v === "no" ? "No" : "—";
}

function Review({
  s,
  steps,
  onEdit,
  quotes,
}: {
  s: WizardState;
  steps: StepKey[];
  onEdit: (k: StepKey) => void;
  quotes: Quote[];
}) {
  const block = (k: StepKey, rows: [string, ReactNode][]) =>
    steps.includes(k) ? (
      <div key={k} style={{ borderTop: "1px solid var(--line-2)", paddingTop: 14, marginTop: 14 }}>
        <div className="cf-card__h" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 15 }}>{STEP_LABEL[k]}</h2>
          <button type="button" className="cf-btn cf-btn--ghost cf-btn--sm" onClick={() => onEdit(k)}>
            Edit
          </button>
        </div>
        <dl className="cf-kv">
          {rows.map(([a, b]) => (
            <FragmentRow key={a} a={a} b={b} />
          ))}
        </dl>
      </div>
    ) : null;

  const quote = quotes.find((q) => q.id === s.quote_ref);
  const products = detProducts(s);
  const missingReq = steps
    .filter((k) => !SOFT_STEPS.includes(k) && k !== "review")
    .filter((k) => Object.keys(validateStep(k, s)).length);

  return (
    <>
      {missingReq.length ? (
        <div className="cf-note cf-note--warn">
          <Icon name="i-warn" />
          <span>
            Still to complete: {missingReq.map((k) => STEP_LABEL[k]).join(", ")}.
          </span>
        </div>
      ) : (
        <div className="cf-note cf-note--ok">
          <Icon name="i-check-c" />
          <span>Everything required is complete.</span>
        </div>
      )}
      {block("scheme", [
        ["Scheme", schemeTitle(s.scheme)],
        ["Standards", s.standards.join(", ") || "—"],
        ["Quote", quote ? `${quote.id} · SZL ${quote.total?.toLocaleString() ?? "—"}` : "Quote after review"],
      ])}
      {block("eligibility", [
        ["Emaswati-owned", yn(s.eligibility.citizen === null ? "" : s.eligibility.citizen ? "yes" : "no")],
        ["Local MSME", yn(s.eligibility.local_msme === null ? "" : s.eligibility.local_msme ? "yes" : "no")],
        ["Produced in Eswatini", yn(s.eligibility.made_here === null ? "" : s.eligibility.made_here ? "yes" : "no")],
        ["Willing to scale", yn(s.eligibility.willing_to_scale === null ? "" : s.eligibility.willing_to_scale ? "yes" : "no")],
      ])}
      {block("consult", [
        ["Consultation", s.wantsConsultation === "yes" ? `${fmtDate(s.consultation?.date)} · ${s.consultation?.mode}` : "Not requested"],
      ])}
      {block("organisation", [
        ["Organisation", s.org.name || "—"],
        [s.flow === "ingelo" ? "Year of first registration" : "Registration no.", (s.flow === "ingelo" ? s.org.year_registered : s.org.registration_no) || "—"],
        ["Trading licence", s.org.trading_licence || "—"],
        ["Address", [s.org.address, s.org.town, s.org.inkhundla, s.org.region].filter(Boolean).join(", ") || "—"],
        ["Personnel", s.org.employees || "—"],
      ])}
      {block("contacts", [
        ["Contact", [s.contact.name, s.contact.position].filter(Boolean).join(", ") || "—"],
        ["Email / phone", [s.contact.email, s.contact.phone].filter(Boolean).join(" · ") || "—"],
        ...(s.flow === "ingelo" ? ([["National ID", det(s, "national_id") || "—"]] as [string, ReactNode][]) : []),
        ["Alternative contact", s.alt_contact.name ? `${s.alt_contact.name} · ${s.alt_contact.phone || s.alt_contact.email}` : "—"],
      ])}
      {block("scope", [
        ["Scope", s.scope || "—"],
        ["Sites", s.sites.map((x) => `${x.name || "Site"}: ${x.address || "—"}`).join("; ")],
      ])}
      {block("system", [
        ["Sector", det(s, "iaf") ? `IAF ${det(s, "iaf")}` : "—"],
        ["Internal audit done", yn(det(s, "internal_audit_done"))],
        ["Management review done", yn(det(s, "mgmt_review_done"))],
        ["Preferred audit window", det(s, "preferred_window") || "—"],
      ])}
      {block("products", [["Products", products.map((p) => `${p.name} (${p.standard})`).join("; ") || "—"]])}
      {block("factory", [
        ["Factory", det(s, "factory_address") || "—"],
        ["In-house QC", yn(det(s, "in_house_qc"))],
        ["Samples ready", yn(det(s, "samples_ready"))],
        ["Testing", detList(s, "lab_fields").join(", ") || "—"],
      ])}
      {block("business", [
        ["Product / service", det(s, "product_or_service") || "—"],
        ["Cottage operation", yn(det(s, "cottage"))],
        ["Potable water", `${yn(det(s, "potable_water"))}${det(s, "water_source") ? ` (${det(s, "water_source")})` : ""}`],
        ["Product use", detList(s, "product_use").join(", ") || "—"],
        ["Distribution", detList(s, "distribution").join(", ") || "—"],
        ["Volumes", det(s, "volumes") ? `${det(s, "volumes")} ${det(s, "volume_period").toLowerCase()}` : "—"],
      ])}
      {block("requirements", [
        ["Production started", yn(det(s, "production_started"))],
        ["Certification type", det(s, "cert_kind") || "—"],
        ["Standards implemented", yn(det(s, "standards_implemented"))],
        ["Consultant", s.consultant || "None"],
        ["Other support", yn(det(s, "other_support"))],
      ])}
      {block("documents", [["Attached", s.documents.map((d) => d.name).join(", ") || "None yet"]])}
      {block("declare", [
        ["Declarations", Object.values(s.declarations).every(Boolean) ? "All accepted" : "Incomplete"],
        ["Signed", s.signature.name ? `${s.signature.name}, ${fmtDate(s.signature.date)}` : "—"],
      ])}
    </>
  );
}

function FragmentRow({ a, b }: { a: string; b: ReactNode }) {
  return (
    <>
      <dt>{a}</dt>
      <dd>{b}</dd>
    </>
  );
}

/** Plain-text copy of the wizard, for the email fallback. */
function applicationSummary(s: WizardState, ref?: string): string {
  const lines: string[] = [];
  if (ref) lines.push(`Reference: ${ref}`);
  lines.push(`Scheme: ${schemeTitle(s.scheme)}`, `Standards: ${s.standards.join(", ")}`);
  if (s.quote_ref) lines.push(`Quote: ${s.quote_ref}`);
  lines.push(
    "",
    `Organisation: ${s.org.name}`,
    `Registration no.: ${s.org.registration_no}`,
    `Trading licence: ${s.org.trading_licence}`,
    `Year of first registration: ${s.org.year_registered}`,
    `Address: ${[s.org.address, s.org.town, s.org.inkhundla, s.org.region].filter(Boolean).join(", ")}`,
    `Personnel: ${s.org.employees}`,
    "",
    `Contact: ${s.contact.name}, ${s.contact.position}, ${s.contact.phone}, ${s.contact.email}`,
    `Alternative contact: ${s.alt_contact.name} ${s.alt_contact.phone} ${s.alt_contact.email}`.trim(),
  );
  if (s.scope) lines.push("", `Scope: ${s.scope}`);
  if (s.sites.length) lines.push(`Sites: ${s.sites.map((x) => `${x.name} (${x.address})`).join("; ")}`);
  const products = detProducts(s);
  if (products.length && products[0].name) lines.push(`Products: ${products.map((p) => `${p.name} [${p.standard}]`).join("; ")}`);
  const skip = new Set(["products"]);
  const extra = Object.entries(s.details)
    .filter(([k, v]) => !skip.has(k) && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  if (extra.length) lines.push("", ...extra);
  if (s.consultant) lines.push(`Consultant: ${s.consultant}`);
  if (s.consultation) lines.push(`Consultation requested: ${s.consultation.date}, ${s.consultation.mode}`);
  lines.push("", `Signed: ${s.signature.name}, ${s.signature.date}`);
  return lines.join("\n");
}
