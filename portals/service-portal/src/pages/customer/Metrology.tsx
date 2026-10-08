/**
 * Customer calibration journey (gap 07 M3, M4, M12): service page, request wizard, my calibration jobs
 * with tracking and quote acceptance, my instruments with "book recalibration", and the public
 * verification page for the QR on the calibration sticker.
 */
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { fmtMoney, invoiceFor } from "@eswasaone/shared-ui/billing";
import {
  createCalRequest,
  customerRespondQuote,
  DISCIPLINES,
  getJob,
  JOB_DEF,
  jobOot,
  listJobs,
  listMethods,
  listMyInstruments,
  pointError,
  pointOot,
  scopeWarnings,
  verifyCalCertificate,
  type CalItem,
  type Discipline,
} from "@eswasaone/shared-ui/metrology";
import { displayState } from "@eswasaone/shared-ui/workflow";
import { useAuth } from "../../auth/AuthProvider";
import { fmtD, Loadable, Panel, PayDialog, PublicPage, Toast, useCustomer, useCustomerData, useMsg } from "./ui";

const tone = (state: string) => JOB_DEF.states.find((s) => s.id === state)?.tone ?? "slate";

export function MetrologyServicePage() {
  const methods = useCustomerData(() => listMethods(), []);
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Calibration" }]} title="Calibration & measurement" lead="ESWASA's metrology laboratory calibrates balances, weights, thermometers, pressure gauges and volumetric equipment — in our Matsapha lab or on your site — with traceable, accredited certificates.">
      <div className="crm-row" style={{ marginBottom: 18 }}>
        <Link className="cf-btn cf-btn--pri" to="/metrology/request">
          Request calibration
        </Link>
        <Link className="cf-btn cf-btn--ghost" to="/account/instruments">
          My instruments
        </Link>
        <Link className="cf-btn cf-btn--ghost" to="/verify/cal/">
          Verify a calibration certificate
        </Link>
      </div>
      <div className="crm-grid crm-grid--3">
        {[
          ["i-gauge", "Turnaround", "Typically 10 working days in the lab (to confirm). On-site visits by appointment."],
          ["i-shield-c", "Accreditation", "SADCAS-accredited methods are marked below; others are traceable but not accredited."],
          ["i-bell", "Reminders", "We remind you 30 days before each instrument is due again."],
        ].map(([ic, t, d]) => (
          <div key={t} className="crm-card">
            <Icon name={ic as "i-gauge"} />
            <h3>{t}</h3>
            <p className="crm-small">{d}</p>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 24 }}>What we calibrate</h2>
      <Loadable res={methods} what="Methods">
        {(rows) => (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Instruments</th>
                <th>Range</th>
                <th>Best capability (CMC)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.discipline}</td>
                  <td>{m.title}</td>
                  <td>{m.range}</td>
                  <td>{m.cmc}</td>
                  <td>{m.accredited ? <span className="crm-pill crm-pill--green">Accredited</span> : <span className="crm-pill crm-pill--slate">Traceable</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loadable>
      <p className="crm-small" style={{ marginTop: 10 }}>
        Prices from E 650 per instrument (lab). Exact fees are on your quote.
      </p>
    </PublicPage>
  );
}

type ItemDraft = Omit<CalItem, "id">;
const blank = (): ItemDraft => ({ description: "", make: "", model: "", serial: "", range: "", resolution: "", discipline: "Mass" });

export function CalRequestPage() {
  const me = useCustomer();
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const pre = params.get("instrument");
  const mine = (() => {
    try {
      return listMyInstruments(me.email);
    } catch {
      return [];
    }
  })();
  const preIns = pre ? mine.find((i) => i.id === pre) : undefined;
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<ItemDraft[]>(preIns ? [{ description: preIns.description, make: preIns.make, model: preIns.model, serial: preIns.serial, range: preIns.range, discipline: preIns.discipline, instrument_id: preIns.id }] : [blank()]);
  const [v, setV] = useState({ customer: preIns?.client ?? "", contact: me.name, phone: "", email: user?.email ?? "", location: "lab" as "lab" | "onsite", site: "", accreditation: true, preferred_date: "", delivery: "collect" as "collect" | "courier", notes: "" });
  const [err, setErr] = useState<string | null>(null);
  const warnings = scopeWarnings(items, v.accreditation);
  const steps = ["Instruments", "Where & when", "Review"];
  const submit = async () => {
    setErr(null);
    try {
      const j = await createCalRequest({ ...v, customer_email: v.email || "demo", customer: v.customer || me.name, items }, me.name);
      nav(`/account/calibration/${j.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Calibration", to: "/metrology" }, { label: "Request" }]} title="Request calibration" lead="Tell us what to calibrate. The lab sends a quote within 2 working days; accept it online to book.">
      <ol className="crm-steps" style={{ display: "flex", gap: 16, listStyle: "none", padding: 0 }}>
        {steps.map((s, i) => (
          <li key={s} style={{ fontWeight: i === step ? 700 : 400, opacity: i <= step ? 1 : 0.5 }}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {step === 0 ? (
        <div className="crm-stack">
          {mine.length ? (
            <div className="crm-row">
              <span className="crm-small">Add from my instruments:</span>
              {mine.map((i) => (
                <button key={i.id} type="button" className="crm-btn crm-btn--sm" onClick={() => setItems([...items.filter((x) => x.description), { description: i.description, make: i.make, model: i.model, serial: i.serial, range: i.range, discipline: i.discipline, instrument_id: i.id }])}>
                  + {i.description}
                </button>
              ))}
            </div>
          ) : null}
          {items.map((it, n) => (
            <div key={n} className="cf-card crm-grid crm-grid--3">
              <label className="crm-field">
                Instrument *
                <input className="crm-input" value={it.description} placeholder="e.g. Analytical balance" onChange={(e) => setItems(items.map((x, k) => (k === n ? { ...x, description: e.target.value } : x)))} />
              </label>
              <label className="crm-field">
                Discipline
                <select className="crm-select" value={it.discipline} onChange={(e) => setItems(items.map((x, k) => (k === n ? { ...x, discipline: e.target.value as Discipline } : x)))}>
                  {DISCIPLINES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="crm-field">
                Serial number *
                <input className="crm-input" value={it.serial} onChange={(e) => setItems(items.map((x, k) => (k === n ? { ...x, serial: e.target.value } : x)))} />
              </label>
              <label className="crm-field">
                Make / model
                <input className="crm-input" value={`${it.make ?? ""}${it.model ? ` ${it.model}` : ""}`} onChange={(e) => setItems(items.map((x, k) => (k === n ? { ...x, make: e.target.value, model: "" } : x)))} />
              </label>
              <label className="crm-field">
                Range *
                <input className="crm-input" value={it.range} placeholder="0–220 g" onChange={(e) => setItems(items.map((x, k) => (k === n ? { ...x, range: e.target.value } : x)))} />
              </label>
              <label className="crm-field">
                Resolution
                <input className="crm-input" value={it.resolution ?? ""} onChange={(e) => setItems(items.map((x, k) => (k === n ? { ...x, resolution: e.target.value } : x)))} />
              </label>
              {items.length > 1 ? (
                <button type="button" className="crm-link" onClick={() => setItems(items.filter((_, k) => k !== n))}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className="crm-btn crm-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setItems([...items, blank()])}>
            + Another instrument
          </button>
        </div>
      ) : step === 1 ? (
        <div className="cf-card crm-form crm-grid crm-grid--2">
          <label className="crm-field">
            Organisation *
            <input className="crm-input" value={v.customer} onChange={(e) => setV({ ...v, customer: e.target.value })} />
          </label>
          <label className="crm-field">
            Contact person
            <input className="crm-input" value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} />
          </label>
          <label className="crm-field">
            Email
            <input className="crm-input" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </label>
          <label className="crm-field">
            Phone
            <input className="crm-input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </label>
          <label className="crm-field">
            Where
            <select className="crm-select" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value as "lab" | "onsite" })}>
              <option value="lab">I'll bring the items to the lab</option>
              <option value="onsite">On site (weighbridges, fixed equipment)</option>
            </select>
          </label>
          {v.location === "onsite" ? (
            <label className="crm-field">
              Site address
              <input className="crm-input" value={v.site} onChange={(e) => setV({ ...v, site: e.target.value })} />
            </label>
          ) : (
            <label className="crm-field">
              Return
              <select className="crm-select" value={v.delivery} onChange={(e) => setV({ ...v, delivery: e.target.value as "collect" | "courier" })}>
                <option value="collect">I'll collect</option>
                <option value="courier">Courier back to me</option>
              </select>
            </label>
          )}
          <label className="crm-field">
            Preferred {v.location === "onsite" ? "visit" : "drop-off"} date
            <input className="crm-input" type="date" value={v.preferred_date} onChange={(e) => setV({ ...v, preferred_date: e.target.value })} />
          </label>
          <label className="crm-check" style={{ alignSelf: "end" }}>
            <input type="checkbox" checked={v.accreditation} onChange={(e) => setV({ ...v, accreditation: e.target.checked })} /> I need an accredited certificate
          </label>
          <label className="crm-field" style={{ gridColumn: "1 / -1" }}>
            Notes
            <textarea className="crm-textarea" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="cf-card">
          <p>
            <b>{items.length} instrument(s)</b> · {v.location === "onsite" ? `on site at ${v.site}` : "in the lab"} · preferred {fmtD(v.preferred_date || undefined)}
          </p>
          <ul>
            {items.map((i, n) => (
              <li key={n}>
                {i.description} — SN {i.serial}, {i.range} ({i.discipline})
              </li>
            ))}
          </ul>
          {warnings.map((w) => (
            <div key={w} className="crm-banner crm-banner--info">
              {w}
            </div>
          ))}
        </div>
      )}
      {err ? <p className="eo-error">{err}</p> : null}
      <div className="cf-nav" style={{ marginTop: 14 }}>
        {step > 0 ? (
          <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
        {step < 2 ? (
          <button type="button" className="cf-btn cf-btn--pri" disabled={step === 0 ? items.some((i) => !i.description || !i.serial || !i.range) : !v.customer || (v.location === "onsite" && !v.site)} onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="cf-btn cf-btn--pri" onClick={() => void submit()}>
            Submit request
          </button>
        )}
      </div>
    </PublicPage>
  );
}

export function AccountCalibrationPage() {
  const me = useCustomer();
  const res = useCustomerData(() => listJobs({ email: me.email }), [me.email]);
  return (
    <Panel title="Calibration" sub="Your calibration jobs from request to collection." actions={<Link className="abtn" to="/metrology/request">New request</Link>}>
      <Loadable res={res} what="Jobs">
        {(jobs) =>
          jobs.length ? (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Instruments</th>
                  <th>Status</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <Link to={`/account/calibration/${j.id}`}>
                        <b>{j.id}</b>
                      </Link>
                      <span className="crm-small">{j.customer}</span>
                    </td>
                    <td className="crm-small">{j.items.map((i) => i.description).join(", ")}</td>
                    <td>
                      <span className={`crm-pill crm-pill--${tone(j.state)}`}>{displayState(JOB_DEF, j.state, "customer")}</span>
                      {j.oot_notified_at ? <span className="crm-pill crm-pill--red">Out of tolerance</span> : null}
                    </td>
                    <td>{fmtD(j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="crm-empty">
              <Icon name="i-gauge" />
              <b>No calibration jobs</b>
              <Link to="/metrology/request">Request calibration</Link>
            </div>
          )
        }
      </Loadable>
    </Panel>
  );
}

export function AccountCalibrationDetailPage() {
  const { id = "" } = useParams();
  const me = useCustomer();
  const [msg, show] = useMsg();
  const [decline, setDecline] = useState("");
  const [pay, setPay] = useState(false);
  const res = useCustomerData(() => getJob(id), [id]);
  return (
    <Panel title={`Calibration ${id}`}>
      <Toast msg={msg} />
      <Loadable res={res} what="Job">
        {({ job: j }) => {
          const inv = invoiceFor(j.id);
          const steps = JOB_DEF.states.filter((s) => !["Cancelled", "Reviewed"].includes(s.id));
          const idx = steps.findIndex((s) => s.id === (j.state === "Reviewed" ? "Pending Review" : j.state));
          return (
            <div className="crm-stack">
              <ol style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0 }}>
                {steps.map((s, i) => (
                  <li key={s.id} className={`crm-pill crm-pill--${i < idx ? "green" : i === idx ? tone(j.state) : "outline"}`}>
                    {s.display?.customer ?? s.label}
                  </li>
                ))}
              </ol>
              {j.state === "Cancelled" ? <div className="crm-banner crm-banner--err">This job was cancelled. {j.history[j.history.length - 1]?.reason ?? ""}</div> : null}
              {j.oot_notified_at ? (
                <div className="crm-banner crm-banner--err">
                  <b>Out of tolerance:</b> one or more instruments were outside tolerance when received (as found). See the results below and consider measurements made since the last calibration.
                </div>
              ) : null}
              {j.state === "Quoted" && j.quote ? (
                <div className="crm-card">
                  <h3 style={{ marginTop: 0 }}>Your quote</h3>
                  {j.quote.lines.map((l, i) => (
                    <p key={i} style={{ margin: "2px 0" }}>
                      {l.label} × {l.qty} — {fmtMoney(l.qty * l.unit_price)}
                    </p>
                  ))}
                  <p>
                    <b>Total {fmtMoney(j.quote.lines.reduce((n, l) => n + l.qty * l.unit_price, 0) * 1.15)} incl. VAT</b> · valid until {fmtD(j.quote.valid_until)}
                  </p>
                  <div className="crm-row">
                    <button type="button" className="crm-btn crm-btn--pri" onClick={() => void customerRespondQuote(j.id, true, me.name).then(() => show(j.location === "onsite" ? "Accepted — we'll propose a visit date." : "Accepted — bring your instruments to the lab."), (e: Error) => show(e.message))}>
                      Accept quote
                    </button>
                    <input className="crm-input" style={{ maxWidth: 280 }} placeholder="Reason, if declining" value={decline} onChange={(e) => setDecline(e.target.value)} />
                    <button type="button" className="crm-btn crm-btn--ghost" disabled={!decline.trim()} onClick={() => void customerRespondQuote(j.id, false, me.name, decline).then(() => show("Declined."), (e: Error) => show(e.message))}>
                      Decline
                    </button>
                  </div>
                </div>
              ) : null}
              {j.state === "Accepted" ? (
                <div className="crm-banner crm-banner--info">
                  {j.location === "onsite" ? (
                    <>
                      We're arranging the on-site visit. <Link to="/account/visits">Confirm the date in Visits</Link>.
                    </>
                  ) : (
                    <>Bring the instruments to the ESWASA lab in Matsapha (Mon–Fri, 08:00–16:00) quoting {j.id}.</>
                  )}
                </div>
              ) : null}
              {j.receipt ? <p className="crm-small">Received {fmtD(j.receipt.at)} · condition {j.receipt.condition}{j.receipt.mismatch ? ` (${j.receipt.mismatch})` : ""} · tag {j.receipt.tag}{j.due ? ` · expected ready ${fmtD(j.due)}` : ""}</p> : null}
              {j.worksheet.points.length && ["Reviewed", "Certified", "Dispatched", "Pending Review"].includes(j.state) || jobOot(j) ? (
                <div className="crm-card">
                  <h3 style={{ marginTop: 0 }}>Results{j.state === "Pending Review" ? " (under review)" : ""}</h3>
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Instrument</th>
                        <th>Nominal</th>
                        <th>As found</th>
                        <th>As left</th>
                        <th>Error</th>
                        <th>Tolerance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {j.worksheet.points.map((p) => (
                        <tr key={p.id}>
                          <td>{j.items.find((i) => i.id === p.item_id)?.serial}</td>
                          <td>
                            {p.nominal} {p.unit}
                          </td>
                          <td>{p.as_found}</td>
                          <td>{p.as_left}</td>
                          <td style={{ color: pointOot(p) ? "var(--red)" : undefined }}>{pointError(p)}</td>
                          <td>±{p.tolerance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {j.certificate ? (
                <div className="crm-row">
                  <Link className="crm-btn crm-btn--pri" to={`/print/calcert/${j.id}`} target="_blank">
                    <Icon name="i-download" /> Download certificate {j.certificate.id}
                  </Link>
                  <span className="crm-small">{j.state === "Certified" ? (j.delivery === "courier" ? "Your items will be couriered back." : "Ready for collection at the lab.") : j.dispatch ? `Collected by ${j.dispatch.name} on ${fmtD(j.dispatch.at)}.` : ""}</span>
                </div>
              ) : null}
              {inv && inv.status !== "paid" ? (
                <button type="button" className="crm-btn" style={{ alignSelf: "flex-start" }} onClick={() => setPay(true)}>
                  Pay invoice {inv.id}
                </button>
              ) : null}
              {pay && inv ? <PayDialog inv={inv} onClose={() => setPay(false)} onPaid={() => (setPay(false), show("Payment recorded."))} /> : null}
              <Link to={`/complaints/new/service_complaint?about=${j.id}`} className="crm-small">
                Report a problem with this job
              </Link>
            </div>
          );
        }}
      </Loadable>
    </Panel>
  );
}

export function AccountInstrumentsPage() {
  const me = useCustomer();
  const res = useCustomerData(() => listMyInstruments(me.email), [me.email]);
  return (
    <Panel title="My instruments" sub="Last and next calibration for each instrument. We remind you 30 days before it's due.">
      <Loadable res={res} what="Instruments">
        {(rows) => (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Last calibrated</th>
                <th>Next due</th>
                <th>Certificate</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const days = i.next_due ? Math.ceil((new Date(i.next_due).getTime() - Date.now()) / 86_400_000) : null;
                return (
                  <tr key={i.id}>
                    <td>
                      <b>{i.description}</b>
                      <span className="crm-small">
                        SN {i.serial} · {i.range}
                      </span>
                    </td>
                    <td>
                      {fmtD(i.last_cal)}
                      {i.last_result === "out_of_tolerance" ? <span className="crm-pill crm-pill--red">Was out of tolerance</span> : null}
                    </td>
                    <td>
                      {fmtD(i.next_due)} {days !== null ? <span className={`crm-pill crm-pill--${days < 0 ? "red" : days <= 30 ? "amber" : "green"}`}>{days < 0 ? `${-days} d overdue` : `${days} d`}</span> : null}
                    </td>
                    <td>{i.last_job ? <Link to={`/print/calcert/${i.last_job}`} target="_blank">{i.last_cert}</Link> : "—"}</td>
                    <td className="num">
                      <Link className="crm-btn crm-btn--sm" to={`/metrology/request?instrument=${i.id}`}>
                        Book recalibration
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Loadable>
    </Panel>
  );
}

export function VerifyCalPage() {
  const { token = "" } = useParams();
  const [t, setT] = useState(token);
  const [q, setQ] = useState(token);
  const r = q ? verifyCalCertificate(q) : null;
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Verify calibration certificate" }]} title="Verify a calibration certificate" lead="Scan the QR on the calibration sticker or enter the certificate number.">
      <div className="crm-row" style={{ maxWidth: 520 }}>
        <input className="crm-input" value={t} onChange={(e) => setT(e.target.value)} placeholder="CAL-26-0231 or token" />
        <button type="button" className="cf-btn cf-btn--pri" onClick={() => setQ(t)}>
          Verify
        </button>
      </div>
      {r ? (
        r.valid ? (
          <div className="crm-banner crm-banner--ok" style={{ marginTop: 14 }}>
            <b>Genuine ESWASA certificate {r.id}</b>
            {r.version && r.version > 1 ? ` (version ${r.version})` : ""} — issued {fmtD(r.issued)} to {r.customer} for {r.items}.
          </div>
        ) : (
          <div className="crm-banner crm-banner--err" style={{ marginTop: 14 }}>
            No calibration certificate matches “{q}”. If you were shown this certificate, report it to ESWASA.
          </div>
        )
      ) : null}
    </PublicPage>
  );
}
