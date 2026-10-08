/**
 * Customer certification additions (gap 05 C3, C11, C13, C15, P2): the tracker's "Action needed"
 * information-request card and quote → agreement → deposit card; certificate management with mark-use
 * artwork, requests and renewal; transfer applications; and every field visit to confirm.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { fmtMoney, getInvoice, invoiceTotals } from "@eswasaone/shared-ui/billing";
import {
  confirmDeposit,
  createApplication,
  customerAcceptQuote,
  customerCertificateRequest,
  customerDeclineQuote,
  customerRespondInfo,
  customerUploadDoc,
  getApplication,
  getCertificate,
  getCertSettings,
  linesTotal,
  listCertificates,
  MARK_DEF,
  REG_DEF,
  startRenewal,
  submitMark,
  type MarkRequest,
} from "@eswasaone/shared-ui/certification";
import { customerConfirmVisit, customerRequestReschedule, listVisits, VISIT_TYPES, visitDef } from "@eswasaone/shared-ui/field";
import { displayState } from "@eswasaone/shared-ui/workflow";
import { fmtD, Loadable, Panel, PayDialog, PublicPage, Toast, useCustomer, useCustomerData, useMsg } from "./ui";

/* ---------------- tracker cards ---------------- */

export function CertActionCards({ id, onChange }: { id: string; onChange: () => void }) {
  const me = useCustomer();
  const res = useCustomerData(() => getApplication(id), [id]);
  const [msg, show] = useMsg();
  const b = res.data;
  if (!b) return null;
  const a = b.app;
  const done = () => (onChange(), void 0);
  return (
    <>
      <Toast msg={msg} />
      {a.state === "Awaiting Customer" ? <InfoRequestCard a={a} who={me.name} onDone={(m) => (show(m), done())} /> : null}
      {a.state === "Quoted" && a.quote ? <QuoteCard b={b} who={me.name} onDone={(m) => (show(m), done())} /> : null}
    </>
  );
}

function InfoRequestCard({ a, who, onDone }: { a: NonNullable<ReturnType<typeof getApplication>>["app"]; who: string; onDone: (m: string) => void }) {
  const ir = a.info_requests[a.info_requests.length - 1];
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!ir) return null;
  return (
    <section className="cf-card" style={{ borderLeft: "4px solid var(--amber, #d98c00)", marginBottom: 16 }}>
      <span className="cf-head__kicker">Action needed · requested {fmtD(ir.at)} · please reply by {fmtD(ir.due)}</span>
      <h2 style={{ margin: "4px 0 8px" }}>We need a few more documents</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{ir.message.split("\n\n")[1] ?? ir.message}</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {ir.items.map((it) => {
          const d = a.documents.find((x) => x.key === it.key);
          const got = d?.status === "received" || d?.status === "acceptable";
          return (
            <li key={it.key} className="crm-row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line, #e5e7eb)" }}>
              <Icon name={got ? "i-check-c" : "i-warn"} />
              <span style={{ flex: 1 }}>
                <b>{it.label}</b>
                {it.note ? <span className="crm-small" style={{ display: "block" }}>{it.note}</span> : null}
                {got ? <span className="crm-small" style={{ display: "block" }}>Uploaded: {d?.versions[d.versions.length - 1]?.name}</span> : null}
              </span>
              <label className="crm-btn crm-btn--sm">
                {got ? "Replace" : "Upload"}
                <input
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      customerUploadDoc(a.id, it.key, f.name, who);
                      onDone(`${it.label} uploaded.`);
                    } catch (x) {
                      setErr(x instanceof Error ? x.message : String(x));
                    }
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
      <label className="crm-field">
        Message to your certification officer (optional)
        <textarea className="crm-textarea" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Anything we should know about these documents" />
      </label>
      {err ? <p className="eo-error">{err}</p> : null}
      <button type="button" className="cf-btn cf-btn--pri" onClick={() => void customerRespondInfo(a.id, reply, who).then(() => onDone("Sent — your officer continues the review."), (e: Error) => setErr(e.message))}>
        Submit response
      </button>
    </section>
  );
}

function QuoteCard({ b, who, onDone }: { b: NonNullable<ReturnType<typeof getApplication>>; who: string; onDone: (m: string) => void }) {
  const a = b.app;
  const q = a.quote!;
  const inv = q.invoice_id ? getInvoice(q.invoice_id) : null;
  const [sig, setSig] = useState({ name: who, title: "", agree: false });
  const [pay, setPay] = useState(false);
  const [decline, setDecline] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const net = linesTotal(q.lines);
  const total = net * 1.15;
  const deposit = Math.round(total * q.deposit_pct) / 100;
  const expired = new Date(q.valid_until) < new Date();
  return (
    <section className="cf-card" style={{ borderLeft: "4px solid var(--navy, #1f3a78)", marginBottom: 16 }}>
      <span className="cf-head__kicker">
        Quote {q.id} · valid until {fmtD(q.valid_until)}
      </span>
      <h2 style={{ margin: "4px 0 8px" }}>Accept your quote and pay the deposit</h2>
      <table className="crm-table">
        <tbody>
          {q.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.label}</td>
              <td className="num">{l.qty}</td>
              <td className="num">{fmtMoney(l.qty * l.unit_price)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2}>VAT 15%</td>
            <td className="num">{fmtMoney(net * 0.15)}</td>
          </tr>
          <tr>
            <td colSpan={2}>
              <b>Total</b>
            </td>
            <td className="num">
              <b>{fmtMoney(total)}</b>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="crm-small">
        {q.auditor_days} auditor-days. A {q.deposit_pct}% deposit ({fmtMoney(deposit)}) books your audit; the balance is invoiced at the decision.{" "}
        <Link to={`/print/certquote/${a.id}`} target="_blank">
          Download quote & agreement
        </Link>
      </p>
      {expired ? <div className="crm-banner crm-banner--err">This quote has expired — ask ESWASA for a new one.</div> : null}
      {!q.agreement ? (
        <>
          <div className="crm-grid crm-grid--2">
            <label className="crm-field">
              Full name
              <input className="crm-input" value={sig.name} onChange={(e) => setSig({ ...sig, name: e.target.value })} />
            </label>
            <label className="crm-field">
              Position
              <input className="crm-input" value={sig.title} onChange={(e) => setSig({ ...sig, title: e.target.value })} placeholder="e.g. Managing Director" />
            </label>
          </div>
          <label className="crm-check">
            <input type="checkbox" checked={sig.agree} onChange={(e) => setSig({ ...sig, agree: e.target.checked })} /> I accept the certification agreement (CER_PR_014, CER_PR_026, CER_RU_028) on behalf of {a.org}.
          </label>
        </>
      ) : (
        <p>
          <Icon name="i-check-c" /> Agreement signed by {q.agreement.name}, {q.agreement.title} on {fmtD(q.agreement.at)}.
          {inv ? ` Deposit paid ${fmtMoney(invoiceTotals(inv).paid)} of ${fmtMoney(inv.deposit ?? 0)}.` : ""}
        </p>
      )}
      {err ? <p className="eo-error">{err}</p> : null}
      <div className="cf-nav">
        <button
          type="button"
          className="cf-btn cf-btn--pri"
          disabled={expired || (!q.agreement && (!sig.agree || !sig.title.trim() || !sig.name.trim()))}
          onClick={() => {
            setErr(null);
            try {
              if (!q.agreement) customerAcceptQuote(a.id, { name: sig.name, title: sig.title }, who);
              setPay(true);
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {q.agreement ? "Pay deposit" : "Accept & pay deposit"}
        </button>
        <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setDecline(true)}>
          Decline
        </button>
      </div>
      {decline ? (
        <div style={{ marginTop: 10 }}>
          <label className="crm-field">
            Why are you declining? (helps us improve)
            <textarea className="crm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="crm-btn crm-btn--danger crm-btn--sm" disabled={!reason.trim()} onClick={() => void customerDeclineQuote(a.id, reason, who).then(() => onDone("Quote declined; the application is closed."), (e: Error) => setErr(e.message))}>
            Decline quote
          </button>
        </div>
      ) : null}
      {pay ? (
        <PayDialog
          inv={getInvoice(getApplication(a.id)!.app.quote!.invoice_id!)!}
          amount={deposit}
          title="Pay your deposit"
          onClose={() => setPay(false)}
          onPaid={(paid, method) => {
            setPay(false);
            if (method === "eft" || method === "invoice") return onDone(method === "eft" ? "Thanks — your audit is booked once the EFT arrives." : "Noted — ESWASA will invoice you; planning starts when the deposit is received.");
            void confirmDeposit(a.id, who).then(
              () => onDone(`Deposit received (${paid.id}). We're planning your audit.`),
              (e: Error) => setErr(e.message),
            );
          }}
        />
      ) : null}
    </section>
  );
}

/* ---------------- certificate management ---------------- */

export function AccountCertificateDetailPage() {
  const { id = "" } = useParams();
  const me = useCustomer();
  const nav = useNavigate();
  const [msg, show] = useMsg();
  const [req, setReq] = useState<{ kind: "scope" | "changes" | "copy" | "good_standing"; text: string } | null>(null);
  const [mark, setMark] = useState<{ usage: MarkRequest["usage"]; description: string; artwork: string; url?: string } | null>(null);
  const res = useCustomerData(() => getCertificate(id), [id]);
  return (
    <Panel title="Certificate" sub="Scope, sites, surveillance, mark files and requests">
      <Toast msg={msg} />
      <Loadable res={res} what="Certificate">
        {({ cert: c, marks }) => {
          const valid = c.state === "Active" || c.state === "Surveillance Due";
          const renewable = new Date(c.expires_at).getTime() - Date.now() < 183 * 86_400_000;
          return (
            <div className="crm-stack">
              <div className="crm-card">
                <div className="crm-row">
                  <div style={{ flex: 1 }}>
                    <span className="crm-mono crm-small">{c.number}</span>
                    <h3 style={{ margin: "2px 0" }}>{c.standard}</h3>
                    <p style={{ margin: 0 }}>{c.scope}</p>
                  </div>
                  <span className={`crm-pill crm-pill--${valid ? "green" : "red"}`}>{displayState(REG_DEF, c.state, "customer")}</span>
                </div>
                <dl className="crm-kv" style={{ marginTop: 10 }}>
                  <dt>Sites</dt>
                  <dd>{c.sites.join("; ")}</dd>
                  <dt>Valid</dt>
                  <dd>
                    {fmtD(c.issued_at)} → {fmtD(c.expires_at)}
                  </dd>
                  <dt>Next</dt>
                  <dd>{c.cycle.find((x) => !x.done_at) ? `${c.cycle.find((x) => !x.done_at)!.label} by ${fmtD(c.cycle.find((x) => !x.done_at)!.due)}` : "—"}</dd>
                  {c.conditions ? (
                    <>
                      <dt>Conditions</dt>
                      <dd>{c.conditions}</dd>
                    </>
                  ) : null}
                </dl>
                <div className="crm-row" style={{ marginTop: 12 }}>
                  <Link className="crm-btn crm-btn--sm crm-btn--pri" to={`/print/certificate/${c.id}`} target="_blank">
                    <Icon name="i-download" /> Certificate PDF
                  </Link>
                  {valid ? (
                    <a className="crm-btn crm-btn--sm" href="data:text/plain;charset=utf-8,ESWASA certification mark files (demo)" download={`eswasa-mark-${c.number}.txt`}>
                      <Icon name="i-download" /> Mark files
                    </a>
                  ) : null}
                  <Link className="crm-btn crm-btn--sm" to={`/verify/${c.token}`}>
                    Public verify page
                  </Link>
                </div>
              </div>
              {!valid ? <div className="crm-banner crm-banner--err">While the certificate is {c.state.toLowerCase()}, you must not use the ESWASA mark. You may appeal within 90 days (Complaints → Appeal).</div> : null}
              {renewable && valid ? (
                <div className="crm-banner crm-banner--info">
                  Your certificate expires on {fmtD(c.expires_at)}.{" "}
                  <button type="button" className="crm-link" onClick={() => nav(`/certification/renew/${c.id}`)}>
                    Request recertification
                  </button>
                </div>
              ) : null}
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Requests</h3>
                </div>
                <div className="crm-row">
                  {(
                    [
                      ["scope", "Extend the scope"],
                      ["changes", "Notify changes (CER_FO_028)"],
                      ["copy", "Request a copy"],
                      ["good_standing", "Letter of good standing"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} type="button" className="crm-btn crm-btn--sm" onClick={() => setReq({ kind: k, text: "" })}>
                      {l}
                    </button>
                  ))}
                  <Link className="crm-btn crm-btn--sm" to="/certification/transfer">
                    Transfer from another body
                  </Link>
                </div>
                {req ? (
                  <div style={{ marginTop: 10 }}>
                    <textarea className="crm-textarea" placeholder="Describe what you need" value={req.text} onChange={(e) => setReq({ ...req, text: e.target.value })} />
                    <button
                      type="button"
                      className="crm-btn crm-btn--sm crm-btn--pri"
                      onClick={() => {
                        try {
                          customerCertificateRequest(c.id, req.kind, req.text, me.name);
                          setReq(null);
                          show("Request sent to your certification officer.");
                        } catch (e) {
                          show(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Send
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Use of the mark</h3>
                  {valid ? (
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => setMark({ usage: "packaging", description: "", artwork: "" })}>
                      Submit artwork
                    </button>
                  ) : null}
                </div>
                <p className="crm-small">Send packaging, advertising or web artwork that shows the ESWASA mark for approval before you print it (CER_RU_028).</p>
                {marks.map((m) => (
                  <p key={m.id} style={{ margin: "6px 0" }}>
                    <b>{m.usage}</b> — {m.description}{" "}
                    <span className={`crm-pill crm-pill--${MARK_DEF.states.find((s) => s.id === m.state)?.tone}`}>{displayState(MARK_DEF, m.state, "customer")}</span>
                    {m.comments ? <span className="crm-small" style={{ display: "block" }}>ESWASA: {m.comments}</span> : null}
                  </p>
                ))}
                {mark ? (
                  <div className="crm-stack" style={{ marginTop: 10 }}>
                    <select className="crm-select" value={mark.usage} onChange={(e) => setMark({ ...mark, usage: e.target.value as MarkRequest["usage"] })}>
                      {["packaging", "advertising", "website", "vehicle", "other"].map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                    <textarea className="crm-textarea" placeholder="Where and how the mark will appear" value={mark.description} onChange={(e) => setMark({ ...mark, description: e.target.value })} />
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const r = new FileReader();
                        r.onload = () => setMark({ ...mark, artwork: f.name, url: f.size < 400_000 ? String(r.result) : undefined });
                        r.readAsDataURL(f);
                      }}
                    />
                    <button
                      type="button"
                      className="crm-btn crm-btn--sm crm-btn--pri"
                      onClick={() => {
                        try {
                          submitMark(c.id, { usage: mark.usage, description: mark.description, artwork: mark.artwork, artwork_url: mark.url }, me.name);
                          setMark(null);
                          show("Artwork sent for approval.");
                        } catch (e) {
                          show(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Submit for approval
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Surveillance cycle</h3>
                </div>
                {c.cycle.map((x) => (
                  <p key={x.id} style={{ margin: "4px 0" }}>
                    {x.label} · due {fmtD(x.due)} {x.done_at ? `· done ${fmtD(x.done_at)}` : x.visit_id ? <Link to="/account/visits"> · confirm the date</Link> : ""}
                  </p>
                ))}
              </div>
            </div>
          );
        }}
      </Loadable>
    </Panel>
  );
}

export function AccountSharedCertificates() {
  const me = useCustomer();
  const res = useCustomerData(() => listCertificates({ email: me.email }), [me.email]);
  if (!res.data?.length) return null;
  return (
    <div className="crm-card" style={{ marginBottom: 16 }}>
      <div className="crm-card__h">
        <h3>Certification register</h3>
      </div>
      {res.data.map((c) => (
        <p key={c.id} style={{ margin: "6px 0" }}>
          <Link to={`/account/certificates/${c.id}`}>
            <b>{c.standard}</b> — {c.number}
          </Link>{" "}
          <span className={`crm-pill crm-pill--${REG_DEF.states.find((s) => s.id === c.state)?.tone}`}>{displayState(REG_DEF, c.state, "customer")}</span>
          <span className="crm-small"> expires {fmtD(c.expires_at)}</span>
        </p>
      ))}
    </div>
  );
}

export function RenewPage() {
  const { certId = "" } = useParams();
  const me = useCustomer();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const res = useCustomerData(() => getCertificate(certId), [certId]);
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "My account", to: "/account" }, { label: "Recertification" }]} title="Request recertification" lead="We pre-fill the application from your current certificate. Check the scope and submit; your officer reviews what changed.">
      <Loadable res={res} what="Certificate">
        {({ cert: c, app }) => (
          <div className="cf-card">
            <dl className="crm-kv">
              <dt>Certificate</dt>
              <dd>
                {c.number} · {c.standard}
              </dd>
              <dt>Scope</dt>
              <dd>{c.scope}</dd>
              <dt>Expires</dt>
              <dd>{fmtD(c.expires_at)}</dd>
              <dt>Documents</dt>
              <dd>{app ? `${app.documents.filter((d) => d.status === "acceptable").length} accepted documents carried over` : "—"}</dd>
            </dl>
            {err ? <p className="eo-error">{err}</p> : null}
            <button
              type="button"
              className="cf-btn cf-btn--pri"
              onClick={() => {
                try {
                  const a = startRenewal(c.id, me.name);
                  nav(`/certification/${a.id}`);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Submit recertification request
            </button>
          </div>
        )}
      </Loadable>
    </PublicPage>
  );
}

export function TransferPage() {
  const me = useCustomer();
  const nav = useNavigate();
  const schemes = getCertSettings().schemes.filter((s) => s.flow === "ms");
  const [v, setV] = useState({ scheme: schemes[0]?.code ?? "iso9001", org: "", employees: "20", scope: "", body: "", cert: "", expires: "", contact: me.name, email: me.email ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Certification", to: "/certification" }, { label: "Transfer" }]} title="Transfer your certification to ESWASA" lead="Already certified by another accredited body? We do a pre-transfer review of your certificate, last audit report and open findings, then quote the remaining cycle.">
      <div className="cf-card crm-form crm-grid crm-grid--2">
        <label className="crm-field">
          Standard
          <select className="crm-select" value={v.scheme} onChange={set("scheme")}>
            {schemes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="crm-field">
          Organisation
          <input className="crm-input" value={v.org} onChange={set("org")} />
        </label>
        <label className="crm-field">
          Current certification body
          <input className="crm-input" value={v.body} onChange={set("body")} />
        </label>
        <label className="crm-field">
          Certificate number
          <input className="crm-input" value={v.cert} onChange={set("cert")} />
        </label>
        <label className="crm-field">
          Expiry date
          <input className="crm-input" type="date" value={v.expires} onChange={set("expires")} />
        </label>
        <label className="crm-field">
          Employees
          <input className="crm-input" type="number" value={v.employees} onChange={set("employees")} />
        </label>
        <label className="crm-field" style={{ gridColumn: "1 / -1" }}>
          Certified scope
          <input className="crm-input" value={v.scope} onChange={set("scope")} />
        </label>
        <label className="crm-field">
          Contact person
          <input className="crm-input" value={v.contact} onChange={set("contact")} />
        </label>
        <label className="crm-field">
          Email
          <input className="crm-input" value={v.email} onChange={set("email")} />
        </label>
      </div>
      {err ? <p className="eo-error">{err}</p> : null}
      <button
        type="button"
        className="cf-btn cf-btn--pri"
        style={{ marginTop: 12 }}
        disabled={!v.org || !v.body || !v.cert || !v.scope}
        onClick={() => {
          try {
            const a = createApplication({ scheme: v.scheme, org: v.org, contact: v.contact, customer_email: v.email || "demo", employees: Number(v.employees) || 1, sites: [{ name: "Main site", address: "", employees: Number(v.employees) || 1 }], scope: v.scope, channel: "transfer", transfer_from: { body: v.body, certificate: v.cert, expires: v.expires } }, v.contact);
            nav(`/certification/${a.id}`);
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        Submit transfer application
      </button>
    </PublicPage>
  );
}

/* ---------------- visits (all types) ---------------- */

export function AccountVisitsPage() {
  const me = useCustomer();
  const [msg, show] = useMsg();
  const [resched, setResched] = useState<{ id: string; date: string; reason: string } | null>(null);
  const res = useCustomerData(() => listVisits({ client_email: me.email ?? "demo" }).filter((v) => v.client_email), [me.email]);
  return (
    <Panel title="Visits" sub="Audits, inspections and on-site calibration at your premises. Confirm the date or ask for another.">
      <Toast msg={msg} />
      <Loadable res={res} what="Visits">
        {(visits) =>
          visits.length ? (
            <div className="crm-stack">
              {visits.map((v) => (
                <div key={v.id} className="crm-card">
                  <div className="crm-row">
                    <div style={{ flex: 1 }}>
                      <b>{v.title}</b>
                      <span className="crm-small" style={{ display: "block" }}>
                        {VISIT_TYPES[v.type].label} · {["Planned", "Assigned"].includes(v.state) ? "date being arranged" : new Date(v.planned_date).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
                        {v.lead ? ` · ${v.lead}` : ""}
                      </span>
                    </div>
                    <span className={`crm-pill crm-pill--${visitDef(v.type).states.find((s) => s.id === v.state)?.tone}`}>{displayState(visitDef(v.type), v.state, "customer")}</span>
                  </div>
                  {v.state === "Accepted" ? (
                    v.reschedule_request ? (
                      <p className="crm-small">You asked for {fmtD(v.reschedule_request.proposed)} — ESWASA will propose a new date.</p>
                    ) : (
                      <div className="crm-row" style={{ marginTop: 8 }}>
                        <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void customerConfirmVisit(v.id, me.name).then(() => show("Date confirmed. The inspector will see you then."), (e: Error) => show(e.message))}>
                          Confirm this date
                        </button>
                        <button type="button" className="crm-btn crm-btn--sm" onClick={() => setResched({ id: v.id, date: "", reason: "" })}>
                          Ask for another date
                        </button>
                      </div>
                    )
                  ) : null}
                  {v.state === "In Progress" ? <p className="crm-small">Inspector on site since {fmtD(v.checkin?.at)}.</p> : null}
                  {v.state === "Closed" ? <p className="crm-small">Visit complete{v.findings.length ? ` — ${v.findings.length} finding(s); respond from your application.` : "."}</p> : null}
                  {resched?.id === v.id ? (
                    <div className="crm-row" style={{ marginTop: 8 }}>
                      <input className="crm-input" type="date" value={resched.date} onChange={(e) => setResched({ ...resched, date: e.target.value })} />
                      <input className="crm-input" placeholder="Why the date doesn't work" value={resched.reason} onChange={(e) => setResched({ ...resched, reason: e.target.value })} />
                      <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" disabled={!resched.date || !resched.reason} onClick={() => void customerRequestReschedule(v.id, resched.date, resched.reason, me.name).then(() => (setResched(null), show("Request sent.")), (e: Error) => show(e.message))}>
                        Send
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="crm-empty">
              <Icon name="i-cal" />
              <b>No visits planned</b>
            </div>
          )
        }
      </Loadable>
    </Panel>
  );
}

