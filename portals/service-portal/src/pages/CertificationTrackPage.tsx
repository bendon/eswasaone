import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  actionsRequired,
  bookConsultation,
  getApplicationDetail,
  getCertificateDownload,
  respondToAudit,
  respondToQuote,
  schemeTitle,
  sendApplicationRequest,
  submitCorrectiveAction,
  uploadApplicationDocument,
  type AppAudit,
  type ApplicationDetail,
  type ApplicationRequest,
  type Finding,
  NotConnectedError,
} from "../api/certification";
import { lodgeComplaint } from "../api/misc";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { demoMode, mailtoCert } from "../certification/demoStore";
import {
  addWorkingDays,
  CHARTER,
  documentsFor,
  FLOW_LABEL,
  FLOW_STAGES,
  fmtDate,
  stageTitle,
  workingDaysBetween,
} from "../certification/flows";
import {
  Activity,
  FileRow,
  isoToday,
  FlowTimeline,
  NotSentNotice,
  Sheet,
  TextField,
  UploadButton,
} from "../certification/ui";
import { safeText } from "../lib/safe";
import { useToast } from "../ui/Toast";

type SheetKind =
  | { kind: "request"; type: ApplicationRequest["kind"] }
  | { kind: "nc"; finding: Finding }
  | { kind: "reschedule"; audit: AppAudit }
  | { kind: "consult" };

const REQUEST_COPY: Record<
  ApplicationRequest["kind"],
  { title: string; lead: string; label: string; cta: string; danger?: boolean }
> = {
  changes: {
    title: "Notify ESWASA of changes",
    lead: "Client notice of changes (CER_FO_028). Tell ESWASA what has changed and from when.",
    label: "What has changed, and from when?",
    cta: "Send notice",
  },
  scope: {
    title: "Request a scope extension",
    lead: "Extending scope of certification is handled under CER_PR_012.",
    label: "Describe the activities, products or sites to add",
    cta: "Send request",
  },
  appeal: {
    title: "Lodge an appeal",
    lead: `Appeals against certification decisions are handled under CER_PR_002 and must be lodged in writing within ${CHARTER.appealWindowDays} days of the decision.`,
    label: "Grounds for your appeal",
    cta: "Lodge appeal",
  },
  withdraw: {
    title: "Withdraw this application",
    lead: "Ask ESWASA to stop work on this application.",
    label: "Reason for withdrawing",
    cta: "Withdraw application",
    danger: true,
  },
  complaint: {
    title: "Raise a complaint",
    lead: `Complaints are handled under CER_PR_006: acknowledged within ${CHARTER.complaintAckDays} working days and resolved within ${CHARTER.complaintResolveDays} where possible.`,
    label: "What went wrong?",
    cta: "Send complaint",
  },
};

function statusChip(d: ApplicationDetail) {
  if (d.stage === "withdrawn") return <span className="cf-chip cf-chip--muted">Withdrawn</span>;
  if (d.certificate?.status === "suspended") return <span className="cf-chip cf-chip--red">Suspended</span>;
  if (d.certificate) return <span className="cf-chip cf-chip--green">Certified</span>;
  if (d.findings.some((f) => f.status === "open" || f.status === "rejected"))
    return <span className="cf-chip cf-chip--red">Action required</span>;
  return <span className="cf-chip">{safeText(d.status)}</span>;
}

export function CertificationTrackPage() {
  const { id = "" } = useParams();
  const { showToast } = useToast();
  const [d, setD] = useState<ApplicationDetail | null | undefined>(undefined);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [notSent, setNotSent] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(() => {
    setLoadErr(false);
    getApplicationDetail(id)
      .then(setD)
      .catch(() => setLoadErr(true));
  }, [id]);

  useEffect(load, [load]);

  const crumbs = (
    <Breadcrumbs
      items={[
        { label: "Home", to: "/" },
        { label: "My applications", to: "/account/applications" },
        { label: d ? d.id : id || "Case" },
      ]}
    />
  );

  if (loadErr) {
    return (
      <div className="page">
        {crumbs}
        <div className="cf-card" style={{ marginTop: 20 }}>
          <h1 className="page-h">Can’t reach ESWASA right now</h1>
          <p className="page-lead">
            The status of {safeText(id)} couldn’t be loaded. Nothing is shown rather than out-of-date information.
          </p>
          <div className="cf-nav">
            <button type="button" className="cf-btn cf-btn--pri" onClick={load}>
              Try again
            </button>
            <a className="cf-btn cf-btn--ghost" href={mailtoCert(`Status of ${id}`, `Please send me the status of application ${id}.`)}>
              Ask by email
            </a>
          </div>
        </div>
      </div>
    );
  }
  if (d === undefined) {
    return (
      <div className="page">
        {crumbs}
        <p className="page-note">Loading case…</p>
      </div>
    );
  }
  if (d === null) {
    return (
      <div className="page">
        {crumbs}
        <div className="cf-card" style={{ marginTop: 20 }}>
          <h1 className="page-h">We couldn’t find {safeText(id)}</h1>
          <p className="page-lead">Check the reference, or open it from your applications list.</p>
          <div className="cf-nav">
            <Link className="cf-btn cf-btn--pri" to="/account/applications">
              My applications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const detail = d;
  const stages = FLOW_STAGES[detail.flow];
  const cur = stages.find((x) => x.key === detail.stage);
  const todo = actionsRequired(detail);
  const created = detail.created_at ? new Date(detail.created_at) : null;
  const decisionDate = detail.decision?.date ? new Date(detail.decision.date) : null;
  const appealOpen =
    !!decisionDate &&
    (Date.now() - decisionDate.getTime()) / 86_400_000 <= CHARTER.appealWindowDays;
  const withdrawn = detail.stage === "withdrawn";

  /** Runs an action; if ESWASA can't receive it, says so and offers email. Never fakes success. */
  async function run(key: string, fn: () => Promise<ApplicationDetail | null>, ok: string, emailBody = "") {
    setBusy(key);
    setNotSent(null);
    try {
      const res = await fn();
      if (res) setD(res);
      else load();
      showToast(ok);
    } catch (err) {
      setSheet(null);
      setNotSent({
        title: err instanceof NotConnectedError ? err.message : "This wasn't sent.",
        body: `${ok.replace(/: sent$/, "")} for application ${detail.id}.\n\n${emailBody}`.trim(),
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(null);
    }
  }

  const charterRows: ReactNode[] = [];
  if (created && (detail.stage === "application" || detail.stage === "consultation" || detail.stage === "enquiry")) {
    const receipt = addWorkingDays(created, CHARTER.receiptDays);
    const left = workingDaysBetween(new Date(), receipt);
    charterRows.push(
      <li key="receipt">
        <Icon name="i-clock" />
        Receipt confirmation due {fmtDate(receipt)}
        {left >= 0 ? ` (${left} working day${left === 1 ? "" : "s"} left)` : " (overdue: contact ESWASA)"}
      </li>,
    );
    const sched = addWorkingDays(created, CHARTER.auditScheduleDays);
    charterRows.push(
      <li key="sched">
        <Icon name="i-cal" />
        {detail.flow === "product" ? "Assessment" : "Audit"} to be scheduled by {fmtDate(sched)}
      </li>,
    );
  }

  return (
    <div className="page">
      {crumbs}
      <header className="cf-head">
        <div>
          <span className="cf-head__kicker">
            {FLOW_LABEL[detail.flow]} · <span className="font-code">{detail.id}</span>
          </span>
          <h1>{safeText(schemeTitle(detail.scheme))}</h1>
          <p>
            {safeText(detail.org)} · applied {fmtDate(detail.created_at)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statusChip(detail)}
          {detail.local || demoMode() ? (
            <span className="cf-chip cf-chip--muted" title="Sample or device-only data: not a confirmed ESWASA record">
              Demo data
            </span>
          ) : null}
        </div>
      </header>

      <div className="cf-track">
        <div>
          {notSent ? (
            <NotSentNotice
              title={notSent.title}
              detail="Nothing was recorded by ESWASA. Send it by email to the certification desk instead."
              mailto={mailtoCert(`Application ${detail.id}`, notSent.body)}
              onClose={() => setNotSent(null)}
            />
          ) : null}
          {/* Where you are */}
          <section className="cf-card cf-now">
            <span className="cf-head__kicker">Where you are</span>
            <h2 style={{ marginTop: 4 }}>{withdrawn ? "Application withdrawn" : cur?.title ?? stageTitle(detail.flow, detail.stage)}</h2>
            {!withdrawn && cur ? <p style={{ color: "var(--muted)", marginTop: 6 }}>{cur.body}</p> : null}
            {todo.length && !withdrawn ? (
              <>
                <div className="cf-sec">What we need from you</div>
                <ul className="cf-todo">
                  {todo.map((t) => (
                    <li key={t}>
                      <Icon name="i-warn" /> {t}
                    </li>
                  ))}
                </ul>
              </>
            ) : !withdrawn ? (
              <div className="cf-note cf-note--ok" style={{ marginTop: 12 }}>
                <Icon name="i-check-c" />
                <span>Nothing needed from you right now. ESWASA has the next step.</span>
              </div>
            ) : null}
            {charterRows.length ? (
              <>
                <div className="cf-sec">Service Charter</div>
                <ul className="cf-todo">{charterRows}</ul>
              </>
            ) : null}
          </section>

          {/* Quote, contract & payment */}
          {detail.quote ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>Quote, contract &amp; payment</h2>
                  <p>
                    {detail.quote.id} · issued {fmtDate(detail.quote.issued_at)} · valid until{" "}
                    {fmtDate(detail.quote.valid_until)}
                  </p>
                </div>
                <span className={`cf-chip${detail.quote.status === "accepted" ? " cf-chip--green" : detail.quote.status === "issued" ? " cf-chip--gold" : " cf-chip--muted"}`}>
                  {detail.quote.status}
                </span>
              </div>
              {detail.quote.lines?.length ? (
                <table className="cf-lines">
                  <tbody>
                    {detail.quote.lines.map((l) => (
                      <tr key={l.label}>
                        <td>{l.label}</td>
                        <td>SZL {l.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Total (excl. surveillance)</td>
                      <td>SZL {(detail.quote.total ?? 0).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="cf-empty">ESWASA is preparing your quote.</p>
              )}
              {detail.quote.status === "issued" ? (
                <div className="cf-item__act">
                  <button
                    type="button"
                    className="cf-btn cf-btn--gold"
                    disabled={busy === "quote"}
                    onClick={() =>
                      void run("quote", async () => {
                        await respondToQuote(detail.quote!.id, true);
                        return null;
                      }, "Quote accepted")
                    }
                  >
                    <Icon name="i-check" /> Accept quote
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btn--ghost"
                    disabled={busy === "quote"}
                    onClick={() =>
                      void run("quote", async () => {
                        await respondToQuote(detail.quote!.id, false);
                        return null;
                      }, "Quote declined")
                    }
                  >
                    Decline
                  </button>
                </div>
              ) : detail.quote.status === "accepted" ? (
                <div className="cf-note" style={{ marginTop: 12 }}>
                  <Icon name="i-dollar" />
                  <span>
                    Quote accepted. ESWASA arranges the contract and payment with you; contact the certification desk
                    quoting <b>{detail.id}</b>.
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Ingelo consultation */}
          {detail.flow === "ingelo" ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>Free consultation &amp; gap analysis</h2>
                  <p>Pre-application support for MSMEs, free of charge.</p>
                </div>
              </div>
              {detail.consultation ? (
                <div className="cf-item">
                  <div className="cf-item__h">
                    <b>
                      {fmtDate(detail.consultation.date)} · {detail.consultation.mode}
                    </b>
                    <span className={`cf-chip${detail.consultation.status === "held" ? " cf-chip--green" : ""}`}>
                      {detail.consultation.status === "held" ? "Held" : "Requested"}
                    </span>
                  </div>
                  <small>An ESWASA officer will confirm the slot by phone or email.</small>
                </div>
              ) : (
                <div className="cf-item__act">
                  <button type="button" className="cf-btn cf-btn--pri" onClick={() => setSheet({ kind: "consult" })}>
                    <Icon name="i-cal" /> Book a free consultation
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {/* Documents */}
          <section className="cf-card">
            <div className="cf-card__h">
              <div>
                <h2>Documents</h2>
                <p>Upload anything ESWASA has requested. PDF or image, up to 10 MB.</p>
              </div>
            </div>
            <div className="cf-files">
              {detail.documents.map((doc) => {
                const ok = doc.status === "uploaded" || doc.status === "accepted";
                return (
                  <FileRow
                    key={doc.key}
                    title={doc.label}
                    sub={
                      ok
                        ? `${doc.file ?? "File"} · ${doc.status === "accepted" ? "accepted by ESWASA" : "uploaded, awaiting review"}`
                        : doc.status === "requested"
                          ? "Requested by ESWASA"
                          : "Optional"
                    }
                    state={ok ? "ok" : doc.status === "requested" ? "req" : "idle"}
                    action={
                      withdrawn || doc.status === "accepted" ? null : (
                        <UploadButton
                          label={ok ? "Replace" : "Upload"}
                          disabled={busy === `doc-${doc.key}`}
                          onFile={(f) =>
                            void run(`doc-${doc.key}`, () => uploadApplicationDocument(detail.id, doc.key, f), `${f.name} uploaded`)
                          }
                        />
                      )
                    }
                  />
                );
              })}
            </div>
          </section>

          {/* Audits / assessments */}
          {detail.audits.length ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>{detail.flow === "product" ? "Assessments & inspections" : "Audits"}</h2>
                  <p>Confirm your date or ask to reschedule.</p>
                </div>
              </div>
              <div className="cf-panel-list">
                {detail.audits.map((a) => {
                  const future = a.date ? new Date(a.date) > new Date() : false;
                  return (
                    <div className="cf-item" key={a.id}>
                      <div className="cf-item__h">
                        <b>{a.type}</b>
                        <span
                          className={`cf-chip${a.status === "done" ? " cf-chip--green" : a.status === "reschedule_requested" ? " cf-chip--amber" : ""}`}
                        >
                          {a.status === "done"
                            ? "Completed"
                            : a.status === "confirmed"
                              ? "Confirmed"
                              : a.status === "reschedule_requested"
                                ? "Reschedule requested"
                                : "Planned"}
                        </span>
                      </div>
                      <small>
                        {fmtDate(a.date)} · Lead auditor {a.auditor ?? "to be assigned"}
                        {a.note ? ` · ${a.note}` : ""}
                      </small>
                      {a.status === "planned" && future && !withdrawn ? (
                        <div className="cf-item__act">
                          <button
                            type="button"
                            className="cf-btn cf-btn--pri cf-btn--sm"
                            disabled={busy === a.id}
                            onClick={() =>
                              void run(a.id, () => respondToAudit(detail.id, a.id, { confirm: true }), "Audit date confirmed")
                            }
                          >
                            <Icon name="i-check" /> Confirm date
                          </button>
                          <button
                            type="button"
                            className="cf-btn cf-btn--ghost cf-btn--sm"
                            onClick={() => setSheet({ kind: "reschedule", audit: a })}
                          >
                            Request another date
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Non-conformities */}
          {detail.findings.length ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>Non-conformities</h2>
                  <p>
                    Answer each finding with the root cause, the correction and the corrective action, plus
                    evidence. The certificate can’t be granted while major findings are open.
                  </p>
                </div>
              </div>
              <div className="cf-panel-list">
                {detail.findings.map((f) => (
                  <div className="cf-item" key={f.id}>
                    <div className="cf-item__h">
                      <b>
                        {f.id} · {f.clause}
                      </b>
                      <span style={{ display: "flex", gap: 6 }}>
                        <span className={`cf-chip${f.severity === "major" ? " cf-chip--red" : f.severity === "minor" ? " cf-chip--amber" : " cf-chip--muted"}`}>
                          {f.severity}
                        </span>
                        <span className={`cf-chip${f.status === "accepted" ? " cf-chip--green" : f.status === "rejected" ? " cf-chip--red" : ""}`}>
                          {f.status === "open" ? `due ${fmtDate(f.due)}` : f.status}
                        </span>
                      </span>
                    </div>
                    <p>{f.statement}</p>
                    {f.response ? (
                      <small>
                        Your response: {f.response.corrective_action}
                        {f.response.evidence.length ? ` · ${f.response.evidence.length} evidence file(s)` : ""}
                      </small>
                    ) : null}
                    {(f.status === "open" || f.status === "rejected") && !withdrawn ? (
                      <div className="cf-item__act">
                        <button
                          type="button"
                          className="cf-btn cf-btn--pri cf-btn--sm"
                          onClick={() => setSheet({ kind: "nc", finding: f })}
                        >
                          <Icon name="i-send" /> {f.status === "rejected" ? "Resubmit corrective action" : "Submit corrective action"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Sampling & testing */}
          {detail.lab.length ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>Sampling &amp; testing</h2>
                  <p>Samples are tested at an accredited laboratory. Results go to the Certification Approval Committee.</p>
                </div>
              </div>
              <div className="cf-panel-list">
                {detail.lab.map((l, i) => (
                  <div className="cf-item" key={`${l.sample}-${l.field}-${i}`}>
                    <div className="cf-item__h">
                      <b>
                        {l.field}: {l.sample}
                      </b>
                      <span
                        className={`cf-chip${l.status === "pass" ? " cf-chip--green" : l.status === "fail" ? " cf-chip--red" : l.status === "in_test" ? " cf-chip--amber" : " cf-chip--muted"}`}
                      >
                        {l.status === "in_test" ? "In testing" : l.status}
                      </span>
                    </div>
                    <small>
                      Drawn {fmtDate(l.drawn_at)}
                      {l.report ? ` · Report ${l.report}` : ""}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Decision */}
          {detail.decision ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>Certification decision</h2>
                  <p>Made by the {detail.decision.body}.</p>
                </div>
                <span
                  className={`cf-chip${detail.decision.outcome === "granted" ? " cf-chip--green" : detail.decision.outcome === "refused" ? " cf-chip--red" : " cf-chip--amber"}`}
                >
                  {detail.decision.outcome}
                </span>
              </div>
              {detail.decision.outcome === "pending" ? (
                <p className="cf-empty">Awaiting decision.</p>
              ) : (
                <small>
                  Decided {fmtDate(detail.decision.date)}
                  {detail.decision.note ? ` · ${detail.decision.note}` : ""}
                </small>
              )}
              {detail.decision.outcome === "refused" && appealOpen ? (
                <div className="cf-note cf-note--warn" style={{ marginTop: 12 }}>
                  <Icon name="i-warn" />
                  <span>
                    You may appeal within {CHARTER.appealWindowDays} days of the decision (CER_PR_002).{" "}
                    <button type="button" className="linkish" onClick={() => setSheet({ kind: "request", type: "appeal" })}>
                      Lodge an appeal
                    </button>
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Certificate / permit / mark */}
          {detail.certificate ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>
                    {detail.flow === "product" ? "Permit" : detail.flow === "ingelo" ? "ESWASA Approved mark" : "Certificate"}
                  </h2>
                  <p>{detail.certificate.scope}</p>
                </div>
                <span className={`cf-chip${detail.certificate.status === "valid" ? " cf-chip--green" : " cf-chip--red"}`}>
                  {detail.certificate.status}
                </span>
              </div>
              <dl className="cf-kv">
                <dt>Number</dt>
                <dd className="font-code">{detail.certificate.number}</dd>
                <dt>Issued</dt>
                <dd>{fmtDate(detail.certificate.issued)}</dd>
                <dt>Expires</dt>
                <dd>{fmtDate(detail.certificate.expires)}</dd>
              </dl>
              <div className="cf-item__act">
                <button
                  type="button"
                  className="cf-btn cf-btn--pri cf-btn--sm"
                  disabled={busy === "pdf"}
                  onClick={async () => {
                    setBusy("pdf");
                    const url = await getCertificateDownload(detail.certificate!.id);
                    setBusy(null);
                    if (url) window.open(url, "_blank", "noopener");
                    else showToast("The signed PDF isn’t available yet. ESWASA will email it.");
                  }}
                >
                  <Icon name="i-download" /> Download PDF
                </button>
                <Link className="cf-btn cf-btn--ghost cf-btn--sm" to={`/verify/${encodeURIComponent(detail.certificate.number)}`}>
                  <Icon name="i-shield-c" /> Public verification
                </Link>
              </div>
              <div className="cf-note" style={{ marginTop: 12 }}>
                <Icon name="i-badge" />
                <span>
                  Use of the certification mark follows CER_RU_028.
                </span>
              </div>
            </section>
          ) : null}

          {/* Surveillance */}
          {detail.surveillance.length ? (
            <section className="cf-card">
              <div className="cf-card__h">
                <div>
                  <h2>Surveillance &amp; recertification</h2>
                  <p>
                    {detail.flow === "product"
                      ? "Post-permit inspections, audits and sampling keep the permit valid."
                      : "Two surveillance audits, then a recertification audit before the certificate expires."}
                  </p>
                </div>
              </div>
              <div className="cf-panel-list">
                {detail.surveillance.map((x) => (
                  <div className="cf-item" key={x.label}>
                    <div className="cf-item__h">
                      <b>{x.label}</b>
                      <span className={`cf-chip${x.status === "done" ? " cf-chip--green" : ""}`}>
                        {x.status === "done" ? "Done" : `Due ${fmtDate(x.due)}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="cf-card">
            <div className="cf-card__h">
              <div>
                <h2>The full journey</h2>
                <p>How {FLOW_LABEL[detail.flow].toLowerCase()} works at ESWASA.</p>
              </div>
            </div>
            <FlowTimeline flow={detail.flow} current={detail.stage} />
          </section>
        </div>

        <aside className="cf-side">
          <section className="cf-card">
            <h3>Actions</h3>
            <ul className="cf-links">
              {!withdrawn ? (
                <li>
                  <button type="button" onClick={() => setSheet({ kind: "request", type: "changes" })}>
                    <Icon name="i-refresh" /> Notify changes
                  </button>
                </li>
              ) : null}
              {detail.certificate ? (
                <li>
                  <button type="button" onClick={() => setSheet({ kind: "request", type: "scope" })}>
                    <Icon name="i-plus" /> Extend scope
                  </button>
                </li>
              ) : null}
              {appealOpen || detail.decision?.outcome === "refused" || detail.certificate?.status === "suspended" ? (
                <li>
                  <button type="button" onClick={() => setSheet({ kind: "request", type: "appeal" })}>
                    <Icon name="i-scroll" /> Lodge an appeal
                  </button>
                </li>
              ) : null}
              <li>
                <button type="button" onClick={() => setSheet({ kind: "request", type: "complaint" })}>
                  <Icon name="i-mega" /> Raise a complaint
                </button>
              </li>
              <li>
                <Link to={`/certification/quote?scheme=${encodeURIComponent(detail.scheme)}`}>
                  <Icon name="i-dollar" /> Request another quote
                </Link>
              </li>
              {!withdrawn && !detail.certificate ? (
                <li>
                  <button type="button" onClick={() => setSheet({ kind: "request", type: "withdraw" })} style={{ color: "#9f1239" }}>
                    <Icon name="i-x" /> Withdraw application
                  </button>
                </li>
              ) : null}
            </ul>
          </section>

          {detail.requests.length ? (
            <section className="cf-card">
              <h3>Your requests</h3>
              <ul className="cf-act">
                {[...detail.requests].reverse().map((r, i) => (
                  <li key={`${r.at}-${i}`}>
                    <span className="d" />
                    <div>
                      {REQUEST_COPY[r.kind].title}
                      <small>
                        {fmtDate(r.at)} · {r.status === "received" ? "Received" : r.status === "in_review" ? "In review" : "Closed"}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="cf-card">
            <h3>Activity</h3>
            <Activity items={detail.activity} />
          </section>

          <section className="cf-card">
            <h3>Rules &amp; procedures</h3>
            <ul className="cf-bul">
              {documentsFor(detail.flow).map((x) => (
                <li key={x.code} className="opt">
                  <Icon name="i-file" />
                  <span>
                    <b>{x.code}</b>: {x.title}
                  </span>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12 }}>
              Questions? (+268) 2518 4633 ·{" "}
              <a href={`mailto:certification@eswasa.co.sz?subject=${encodeURIComponent(detail.id)}`}>
                certification@eswasa.co.sz
              </a>
            </p>
          </section>
        </aside>
      </div>

      {sheet?.kind === "request" ? (
        <RequestSheet
          type={sheet.type}
          busy={busy === "req"}
          onClose={() => setSheet(null)}
          onSubmit={(text) =>
            void run(
              "req",
              async () => {
                // Complaints also go to the shared complaints desk (Customer Care).
                if (sheet.type === "complaint")
                  await lodgeComplaint({ subject: `Certification ${detail.id}`, detail: text });
                return sendApplicationRequest(detail.id, sheet.type, text);
              },
              `${REQUEST_COPY[sheet.type].title}: sent`,
            ).then(
              () => setSheet(null),
            )
          }
        />
      ) : null}
      {sheet?.kind === "nc" ? (
        <NcSheet
          finding={sheet.finding}
          busy={busy === "nc"}
          onClose={() => setSheet(null)}
          onSubmit={(resp) =>
            void run("nc", () => submitCorrectiveAction(detail.id, sheet.finding.id, resp), "Corrective action submitted").then(() =>
              setSheet(null),
            )
          }
        />
      ) : null}
      {sheet?.kind === "reschedule" ? (
        <RescheduleSheet
          audit={sheet.audit}
          busy={busy === "resched"}
          onClose={() => setSheet(null)}
          onSubmit={(reason, preferred) =>
            void run(
              "resched",
              () => respondToAudit(detail.id, sheet.audit.id, { confirm: false, reason, preferred }),
              "Reschedule request sent",
            ).then(() => setSheet(null))
          }
        />
      ) : null}
      {sheet?.kind === "consult" ? (
        <ConsultSheet
          busy={busy === "consult"}
          onClose={() => setSheet(null)}
          onSubmit={(slot) =>
            void run("consult", () => bookConsultation(detail.id, slot), "Consultation requested").then(() => setSheet(null))
          }
        />
      ) : null}
    </div>
  );
}

/* ---------------- Sheets ---------------- */

function RequestSheet({
  type,
  busy,
  onClose,
  onSubmit,
}: {
  type: ApplicationRequest["kind"];
  busy: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const copy = REQUEST_COPY[type];
  const [text, setText] = useState("");
  const [sure, setSure] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || (copy.danger && !sure)) return;
    onSubmit(text.trim());
  }
  return (
    <Sheet title={copy.title} lead={copy.lead} onClose={onClose}>
      <form onSubmit={submit}>
        <TextField label={copy.label} required multiline value={text} onChange={setText} />
        {copy.danger ? (
          <label className="cf-check">
            <input type="checkbox" checked={sure} onChange={() => setSure(!sure)} />
            <span>I understand this can’t be undone from the portal.</span>
          </label>
        ) : null}
        <div className="cf-nav">
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="grow" />
          <button
            type="submit"
            className={`cf-btn ${copy.danger ? "cf-btn--danger" : "cf-btn--pri"}`}
            disabled={busy || !text.trim() || (copy.danger && !sure)}
          >
            {busy ? "Sending…" : copy.cta}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function NcSheet({
  finding,
  busy,
  onClose,
  onSubmit,
}: {
  finding: Finding;
  busy: boolean;
  onClose: () => void;
  onSubmit: (r: NonNullable<Finding["response"]>) => void;
}) {
  const [rootCause, setRootCause] = useState(finding.response?.root_cause ?? "");
  const [correction, setCorrection] = useState(finding.response?.correction ?? "");
  const [action, setAction] = useState(finding.response?.corrective_action ?? "");
  const [evidence, setEvidence] = useState<string[]>(finding.response?.evidence ?? []);
  const ok = rootCause.trim() && correction.trim() && action.trim();
  return (
    <Sheet
      title={`Corrective action · ${finding.id}`}
      lead={`${finding.clause}: ${finding.statement}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSubmit({ root_cause: rootCause, correction, corrective_action: action, evidence });
        }}
      >
        <TextField label="Root cause" required multiline value={rootCause} onChange={setRootCause} hint="Why did it happen?" />
        <TextField label="Correction" required multiline value={correction} onChange={setCorrection} hint="What you fixed immediately." />
        <TextField
          label="Corrective action"
          required
          multiline
          value={action}
          onChange={setAction}
          hint="What stops it happening again, who owns it, and by when."
        />
        <div className="cf-field">
          <span className="lbl">Evidence</span>
          <div className="cf-files">
            {evidence.map((n) => (
              <FileRow
                key={n}
                title={n}
                state="ok"
                action={
                  <button type="button" className="cf-btn cf-btn--ghost cf-btn--sm" onClick={() => setEvidence(evidence.filter((x) => x !== n))} aria-label={`Remove ${n}`}>
                    <Icon name="i-x" />
                  </button>
                }
              />
            ))}
            <div>
              <UploadButton label="Add evidence" onFile={(f) => setEvidence([...evidence, f.name])} />
            </div>
          </div>
        </div>
        <div className="cf-nav">
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="grow" />
          <button type="submit" className="cf-btn cf-btn--pri" disabled={busy || !ok}>
            {busy ? "Sending…" : "Submit to auditor"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function RescheduleSheet({
  audit,
  busy,
  onClose,
  onSubmit,
}: {
  audit: AppAudit;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string, preferred: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [preferred, setPreferred] = useState("");
  return (
    <Sheet title={`Reschedule ${audit.type}`} lead={`Currently planned for ${fmtDate(audit.date)}.`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim() && preferred) onSubmit(reason.trim(), preferred);
        }}
      >
        <TextField label="Preferred date" type="date" min={isoToday()} required value={preferred} onChange={setPreferred} />
        <TextField label="Reason" required multiline value={reason} onChange={setReason} />
        <div className="cf-nav">
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="grow" />
          <button type="submit" className="cf-btn cf-btn--pri" disabled={busy || !reason.trim() || !preferred}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function ConsultSheet({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (slot: { date: string; mode: string; topic: string }) => void;
}) {
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("In person (ESWASA, Matsapha)");
  const [topic, setTopic] = useState("");
  return (
    <Sheet title="Book a free consultation" lead="Pre-application consultation or gap-analysis workshop for MSMEs." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (date) onSubmit({ date, mode, topic });
        }}
      >
        <TextField label="Preferred date" type="date" min={isoToday()} required value={date} onChange={setDate} />
        <label className="cf-field">
          <span className="lbl">How should we meet?</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {["In person (ESWASA, Matsapha)", "At my premises", "Online (video call)", "Group gap-analysis workshop"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <TextField label="What would you like help with?" multiline value={topic} onChange={setTopic} />
        <div className="cf-nav">
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="grow" />
          <button type="submit" className="cf-btn cf-btn--pri" disabled={busy || !date}>
            {busy ? "Sending…" : "Request slot"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
