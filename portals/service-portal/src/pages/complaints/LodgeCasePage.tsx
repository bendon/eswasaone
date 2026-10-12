import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Icon, Select, validateUpload } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmNotConnected,
  CrmNotConnectedError,
  addWorkingDays,
  crmDemoMode,
  lodgeCase,
  publicCrmConfig,
  searchCertifiedRegister,
  type Case,
  type CaseSubject,
  type CaseType,
  type ContactPreference,
} from "@eswasaone/shared-ui/crm";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { useAuth } from "../../auth/AuthProvider";
import { GOALS } from "../../goals/catalogue";

const STEPS = ["What happened", "What it's about", "Evidence", "Your details", "Review"] as const;

const SERVICE_OPTIONS = [
  "Certification",
  "Testing (laboratory)",
  "Calibration",
  "Training",
  "Buying a standard",
  "Export / import inspection",
  "Website or online services",
  "Other",
];

const PLACEHOLDER: Record<CaseType, string> = {
  enquiry: "e.g. What do I need to sell bottled water in supermarkets?",
  service_complaint: "e.g. My calibration certificate is three weeks late",
  product_report: "e.g. Certified maize meal bags are under-weight",
  mark_misuse: "e.g. Roof tiles with the SZNS mark but the QR code doesn't scan",
  billing_dispute: "e.g. I was invoiced twice for the same audit",
  appeal: "",
  feedback: "e.g. The HACCP course was excellent",
};

/** 5-step lodge wizard. Ends on a confirmation screen with the reference and a tracking code. */
export function LodgeCasePage() {
  const { type: rawType = "enquiry" } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const cfg = publicCrmConfig();
  const type = (rawType in cfg.case_types ? rawType : "enquiry") as CaseType;
  const typeCfg = cfg.case_types[type];

  const [step, setStep] = useState(0);
  const [subject, setSubject] = useState(params.get("ref") ? `Concern about ${params.get("ref")}` : "");
  const [description, setDescription] = useState("");
  const [incident, setIncident] = useState("");
  const [location, setLocation] = useState("");
  const [about, setAbout] = useState<CaseSubject | undefined>(
    params.get("cert") ? { kind: "certificate", label: `Certificate ${params.get("cert")}`, ref: params.get("cert") ?? undefined } : undefined,
  );
  const [service, setService] = useState("");
  const [serviceRef, setServiceRef] = useState(params.get("ref") ?? "");
  const [freeAbout, setFreeAbout] = useState("");
  const [q, setQ] = useState(params.get("cert") ?? "");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchCertifiedRegister>>>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [org, setOrg] = useState("");
  const [preferred, setPreferred] = useState<ContactPreference>("email");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [done, setDone] = useState<Case | null>(null);

  useEffect(() => {
    if (user) {
      setName((n) => n || user.full_name || "");
      setEmail((e) => e || user.email || "");
    }
  }, [user]);

  // Live register search for company / certificate (public data only).
  useEffect(() => {
    if (!crmDemoMode() || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      void searchCertifiedRegister(q).then((r) => alive && setResults(r));
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  // Self-help: Goals guides that match what the person typed.
  const suggestions = useMemo(() => {
    if (!["enquiry", "service_complaint"].includes(type)) return [];
    const words = `${subject} ${description}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (words.length < 2) return [];
    return GOALS.map((g) => {
      const hay = `${g.title} ${g.summary} ${g.tags}`.toLowerCase();
      return { g, score: words.filter((w) => hay.includes(w)).length };
    })
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.g);
  }, [type, subject, description]);

  if (type === "appeal") return <Navigate to="/account/applications" replace />;

  const needsContact = type === "billing_dispute";
  const canAnon = !needsContact;
  const aboutKind: "register" | "service" | "invoice" | "none" =
    type === "product_report" || type === "mark_misuse" ? "register" : type === "service_complaint" ? "service" : type === "billing_dispute" ? "invoice" : "none";

  const resolvedAbout = (): CaseSubject | undefined => {
    if (aboutKind === "register") return about ?? (freeAbout.trim() ? { kind: "product", label: freeAbout.trim() } : undefined);
    if (aboutKind === "service") return service ? { kind: "service", label: `${service}${serviceRef ? ` · ${serviceRef}` : ""}`, ref: serviceRef || undefined } : undefined;
    if (aboutKind === "invoice") return serviceRef ? { kind: "invoice", label: `Invoice ${serviceRef}`, ref: serviceRef } : undefined;
    return undefined;
  };

  const stepValid = [
    subject.trim().length >= 4 && description.trim().length >= 10,
    aboutKind === "none" || aboutKind === "service" ? true : aboutKind === "invoice" ? serviceRef.trim().length > 0 : Boolean(about || freeAbout.trim()),
    true,
    anonymous ? true : Boolean(name.trim() && (email.trim() || phone.trim())) && consent,
    true,
  ];

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const c = await lodgeCase({
        type,
        subject,
        description,
        channel: user ? "account" : "web",
        about: resolvedAbout(),
        incident_date: incident ? new Date(incident).toISOString() : undefined,
        location: location || undefined,
        attachments: files,
        reporter: anonymous
          ? { anonymous: true, preferred: "email" }
          : { anonymous: false, name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, organisation: org.trim() || undefined, preferred },
      });
      setDone(c);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (e instanceof CrmNotConnectedError) setNotConnected(true);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const crumbs = [
    { label: "Home", to: "/" },
    { label: "Complaints & enquiries", to: "/complaints" },
    { label: typeCfg.short },
  ];

  if (done) {
    const ack = addWorkingDays(done.created_at, typeCfg.ack_days);
    const due = addWorkingDays(done.created_at, typeCfg.resolve_days);
    return (
      <div className="page crm-pub">
        <Breadcrumbs items={crumbs} />
        <div className="crm-card crm-done">
          <div className="crm-done__ic">
            <Icon name="i-check" />
          </div>
          <h2>We've got it</h2>
          <p className="crm-muted">Your {typeCfg.short.toLowerCase()} is with our {done.team} team.</p>
          <div className="crm-ref">
            <span>Your reference</span>
            <b>{done.ref}</b>
          </div>
          {anonymous || (!email && !phone) ? (
            <CrmBanner tone="info" icon="i-lock">
              You reported anonymously. Save this tracking code — it's the only way to follow your case:{" "}
              <b className="crm-mono" style={{ fontSize: 15 }}>
                {done.access_code}
              </b>
            </CrmBanner>
          ) : (
            <p className="crm-small">
              We'll keep you updated at {email || phone}. Track the case with that {email ? "email" : "number"} or the code{" "}
              <b className="crm-mono">{done.access_code}</b>.
            </p>
          )}
          <div className="crm-grid crm-grid--2" style={{ textAlign: "left", maxWidth: 560, margin: "16px auto" }}>
            <div className="crm-kpi">
              <div className="crm-kpi__l">Acknowledged by</div>
              <div className="crm-kpi__v" style={{ fontSize: 18 }}>
                {ack.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </div>
            </div>
            <div className="crm-kpi">
              <div className="crm-kpi__l">Target answer by</div>
              <div className="crm-kpi__v" style={{ fontSize: 18 }}>
                {due.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </div>
            </div>
          </div>
          <div className="crm-row" style={{ justifyContent: "center" }}>
            <Link
              className="crm-btn crm-btn--pri crm-btn--lg"
              to={`/complaints/track/${done.ref}`}
              onClick={() => {
                try {
                  sessionStorage.setItem(`crm.track.${done.ref}`, done.access_code);
                } catch {
                  /* ignore */
                }
              }}
            >
              Track this case
            </Link>
            <Link className="crm-btn crm-btn--lg" to="/complaints">
              Back to complaints
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page crm-pub">
      <Breadcrumbs items={crumbs} />
      <h1 className="page-h">{typeCfg.label}</h1>
      <p className="page-lead">{typeCfg.description}</p>

      <ol className="crm-steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
            <i>{i < step ? "✓" : i + 1}</i>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      {notConnected ? <CrmNotConnected what="Online complaints" audience="public" /> : null}
      {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}

      <div className="crm-wizard">
        <div className="crm-card">
          {step === 0 ? (
            <div className="crm-form">
              <label className="crm-field">
                In a sentence, what's it about?
                <input className="crm-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={PLACEHOLDER[type]} autoFocus />
              </label>
              <label className="crm-field">
                Tell us more
                <span className="hint">What happened, when, and what you'd like ESWASA to do.</span>
                <textarea className="crm-textarea" style={{ minHeight: 140 }} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              {type !== "enquiry" && type !== "feedback" ? (
                <div className="crm-form crm-form--2">
                  <label className="crm-field">
                    When did it happen?
                    <input className="crm-input" type="date" max={new Date().toISOString().slice(0, 10)} value={incident} onChange={(e) => setIncident(e.target.value)} />
                  </label>
                  {type === "product_report" || type === "mark_misuse" ? (
                    <label className="crm-field">
                      Where? (shop, market, town)
                      <input className="crm-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Manzini market, stall row C" />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="crm-form">
              {aboutKind === "register" ? (
                <>
                  <label className="crm-field">
                    Which company, product or certificate?
                    <span className="hint">Search the public register by company name or certificate number.</span>
                    <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Nhlangano Grain or SZ-MS-2124" />
                  </label>
                  {results.length ? (
                    <div className="crm-results" role="listbox">
                      {results.map((r) => (
                        <button
                          key={r.client_id}
                          type="button"
                          role="option"
                          aria-selected={about?.client_id === r.client_id}
                          className={`crm-result${about?.client_id === r.client_id ? " on" : ""}`}
                          onClick={() => setAbout({ kind: "client", label: r.name, client_id: r.client_id, ref: r.certificates[0]?.id })}
                        >
                          <Icon name="i-building" />
                          <span>
                            <b>{r.name}</b>
                            <span className="crm-small">
                              {r.certificates.map((c) => `${c.id} · ${c.standard} (${c.status})`).join(" · ")}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : q.trim().length >= 2 && crmDemoMode() ? (
                    <CrmBanner tone={type === "mark_misuse" ? "warn" : "info"}>
                      Not in the register.{" "}
                      {type === "mark_misuse" ? "A product carrying a mark without a certificate is exactly what we need to know about." : "Describe it below instead."}
                    </CrmBanner>
                  ) : null}
                  {about ? (
                    <CrmBanner tone="ok">
                      About <b>{about.label}</b>.{" "}
                      <button type="button" className="crm-link" onClick={() => setAbout(undefined)}>
                        Change
                      </button>
                    </CrmBanner>
                  ) : (
                    <label className="crm-field">
                      Or describe the product and brand
                      <input className="crm-input" value={freeAbout} onChange={(e) => setFreeAbout(e.target.value)} placeholder="Brand, product, batch code, label text" />
                    </label>
                  )}
                </>
              ) : aboutKind === "service" ? (
                <>
                  <label className="crm-field">
                    Which ESWASA service?
                    <Select value={service} onChange={(val) => setService(val)} block>
                      <option value="">Choose…</option>
                      {SERVICE_OPTIONS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="crm-field">
                    Reference, if you have one
                    <span className="hint">Application, job, order, invoice or course number.</span>
                    <input className="crm-input" value={serviceRef} onChange={(e) => setServiceRef(e.target.value)} placeholder="e.g. CAL-2611" />
                  </label>
                </>
              ) : aboutKind === "invoice" ? (
                <label className="crm-field">
                  Invoice number
                  <input className="crm-input" value={serviceRef} onChange={(e) => setServiceRef(e.target.value)} placeholder="e.g. INV-3916" />
                </label>
              ) : (
                <p className="crm-muted" style={{ margin: 0 }}>
                  Nothing more needed here. Continue to add any files.
                </p>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="crm-form">
              <label className="crm-field">
                Photos or documents (optional)
                <span className="hint">Labels, receipts, batch codes, emails. Up to 5 files, 10 MB each.</span>
                <input
                  className="crm-input"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    setFileErr(null);
                    const list = Array.from(e.target.files ?? []);
                    const bad = list.map((f) => validateUpload(f, { accept: "image/*,application/pdf" })).find(Boolean);
                    if (bad) return setFileErr(bad);
                    // TODO: wire real — uploadMedia(file, "cases") once POST /cases accepts media keys.
                    setFiles((cur) => [...cur, ...list.map((f) => f.name)].slice(0, 5));
                  }}
                />
              </label>
              {fileErr ? <CrmBanner tone="err">{fileErr}</CrmBanner> : null}
              {files.length ? (
                <div className="crm-row">
                  {files.map((f) => (
                    <span key={f} className="crm-pill crm-pill--outline">
                      <Icon name="i-clip" size={12} /> {f}
                      <button type="button" className="crm-link" aria-label={`Remove ${f}`} onClick={() => setFiles((cur) => cur.filter((x) => x !== f))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {type === "product_report" || type === "mark_misuse" ? (
                <CrmBanner tone="info">Keep the product if you can. Our inspectors may ask to collect it as a sample.</CrmBanner>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="crm-form">
              {canAnon ? (
                <label className="crm-check">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                  <span>
                    <b>Report anonymously</b>
                    <span className="crm-small" style={{ display: "block" }}>
                      We won't know who you are. You'll get a tracking code instead, and we can't contact you with questions.
                    </span>
                  </span>
                </label>
              ) : (
                <CrmBanner tone="info">We need your contact details to resolve a billing question.</CrmBanner>
              )}
              {!anonymous ? (
                <>
                  <div className="crm-form crm-form--2">
                    <label className="crm-field">
                      Your name
                      <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    </label>
                    <label className="crm-field">
                      Organisation (optional)
                      <input className="crm-input" value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" />
                    </label>
                    <label className="crm-field">
                      Email
                      <input className="crm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                    </label>
                    <label className="crm-field">
                      Phone
                      <input className="crm-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+268" autoComplete="tel" />
                    </label>
                  </div>
                  <div className="crm-field">
                    How should we reach you?
                    <div className="crm-row">
                      {(["email", "sms", "whatsapp", "phone"] as ContactPreference[]).map((p) => (
                        <label key={p} className="crm-check" style={{ fontSize: 13 }}>
                          <input type="radio" name="pref" checked={preferred === p} onChange={() => setPreferred(p)} />
                          {p === "sms" ? "SMS" : p === "whatsapp" ? "WhatsApp" : p[0].toUpperCase() + p.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="crm-check">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span className="crm-small" style={{ color: "var(--ink)" }}>
                      ESWASA may use these details to handle this case and contact me about it. They won't be shared with the company I'm complaining about.
                    </span>
                  </label>
                </>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <dl className="crm-kv" style={{ gridTemplateColumns: "150px minmax(0,1fr)" }}>
              <dt>Type</dt>
              <dd>{typeCfg.label}</dd>
              <dt>Subject</dt>
              <dd>{subject}</dd>
              <dt>Details</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>{description}</dd>
              {incident ? (
                <>
                  <dt>When</dt>
                  <dd>{new Date(incident).toLocaleDateString()}</dd>
                </>
              ) : null}
              {location ? (
                <>
                  <dt>Where</dt>
                  <dd>{location}</dd>
                </>
              ) : null}
              {resolvedAbout() ? (
                <>
                  <dt>About</dt>
                  <dd>{resolvedAbout()!.label}</dd>
                </>
              ) : null}
              <dt>Files</dt>
              <dd>{files.length ? files.join(", ") : "None"}</dd>
              <dt>From</dt>
              <dd>{anonymous ? "Anonymous" : `${name}${org ? `, ${org}` : ""} · ${[email, phone].filter(Boolean).join(" · ")} · prefers ${preferred}`}</dd>
            </dl>
          ) : null}

          <div className="crm-wizard__nav">
            {step > 0 ? (
              <button type="button" className="crm-btn" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            ) : (
              <Link className="crm-btn" to="/complaints">
                Cancel
              </Link>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="crm-btn crm-btn--pri" disabled={!stepValid[step]} onClick={() => setStep((s) => s + 1)}>
                Continue
              </button>
            ) : (
              <button type="button" className="crm-btn crm-btn--pri" disabled={busy} onClick={() => void submit()}>
                {busy ? "Sending…" : "Submit"}
              </button>
            )}
          </div>
        </div>

        <aside className="crm-stack">
          {suggestions.length && step === 0 ? (
            <div className="crm-deflect">
              <b>These guides might answer it straight away</b>
              {suggestions.map((g) => (
                <Link key={g.slug} to={`/goals/${g.slug}`} target="_blank" rel="noreferrer">
                  {g.title} →
                </Link>
              ))}
              <span className="crm-small">Still need us? Carry on — nothing is lost.</span>
            </div>
          ) : null}
          <div className="crm-card">
            <div className="crm-card__h">
              <h3>What happens next</h3>
            </div>
            <ul className="crm-timeline">
              <li className="is-now">
                <b>You get a reference</b>
                <span>Straight away, with a tracking page</span>
              </li>
              <li>
                <b>We acknowledge it</b>
                <span>Within {typeCfg.ack_days} working day(s)</span>
              </li>
              <li>
                <b>{typeCfg.team} team handles it</b>
                <span>They may ask you for more information</span>
              </li>
              <li>
                <b>We reply with an answer</b>
                <span>Target {typeCfg.resolve_days} working days</span>
              </li>
              <li>
                <b>You confirm, or reopen</b>
                <span>Within {cfg.reopen_days} days</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
