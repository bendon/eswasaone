/**
 * Application record page (gap 05 C5, C6, C7, C10, C14): Overview · Documents · Quote & payment ·
 * Audit plan · Visits & findings · Lab · Technical review · Decision · Certificate · History.
 * ActionBar shows only map transitions this user may take; the rail shows SLA, people, links and
 * the independence checks (reviewer ≠ audit team; decision-maker ≠ team ≠ reviewer).
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon, Select } from "@eswasaone/shared-ui";
import { fmtMoney, invoiceTotals } from "@eswasaone/shared-ui/billing";
import {
  actOnApplication,
  addDocument,
  addStage,
  auditReportFor,
  draftAuditReport,
  saveAuditReport,
  APP_DEF,
  appActions,
  completeTechnicalReview,
  feeCalc,
  getApplication,
  infoRequestDraft,
  issueQuote,
  labBlock,
  linesTotal,
  ncOverdue,
  planStageVisit,
  raiseNc,
  requestInfo,
  reviewNc,
  sendAuditPlan,
  setDocStatus,
  TR_CHECKLIST,
  verifyNc,
  type AppBundle,
  type AppDoc,
  type FeeLine,
  type Nonconformity,
} from "@eswasaone/shared-ui/certification";
import { VISIT_TYPES, visitDef } from "@eswasaone/shared-ui/field";
import { DocumentsPanel, Facts, HistoryTimeline, IndependencePanel, RailCard, RecordPage, SuggestButton, fmtDate } from "@eswasaone/shared-ui/record";
import { taskSla, tasksForRecord } from "@eswasaone/shared-ui/tasks";
import { ReasonDialog, dutyList, stateDef, type Actor } from "@eswasaone/shared-ui/workflow";
import { Acts, Empty, Gate, run, useDomain, useStaffActor, useToast, WfPill } from "../domain/ui";
import { TeamPicker } from "../fieldops/TeamPicker";

const DOC_STATUS: AppDoc["status"][] = ["missing", "received", "acceptable", "rejected"];
const DOC_TONE: Record<AppDoc["status"], string> = { missing: "slate", received: "navy", acceptable: "green", rejected: "red" };

export function ApplicationRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => getApplication(id), [id]);
  return (
    <Gate res={res} what="Application">
      {(b) => <Record b={b} actor={actor} show={show} toast={toast} />}
    </Gate>
  );
}

/** Map application workflow state to the most relevant record tab. */
const STATE_TO_TAB: Record<string, string> = {
  "Submitted": "docs",
  "Document Review": "docs",
  "Awaiting Customer": "docs",
  "Quoted": "quote",
  "Audit Planned": "plan",
  "Audit in Progress": "findings",
  "NC Resolution": "findings",
  "Technical Review": "review",
  "Decision": "decision",
  "Certified": "certificate",
  "Rejected": "history",
  "Withdrawn": "history",
};

function Record({ b, actor, show, toast }: { b: AppBundle; actor: Actor; show: (m: string) => void; toast: React.ReactNode }) {
  const a = b.app;
  const acts = appActions(a.id, actor);
  const [infoOpen, setInfoOpen] = useState(false);
  const task = tasksForRecord("Certification Application", a.id).find((t) => !t.closed_at && t.state === a.state);
  const sla = stateDef(APP_DEF, a.state)?.paused ? { status: "paused", label: "Paused — waiting on customer" } : task ? taskSla(task) : null;
  const duties = dutyList(a);
  const team = a.duties?.["Audit team"] ?? [];
  const reviewer = a.duties?.["Technical reviewer"] ?? [];
  const open = (n: Nonconformity) => n.severity !== "observation" && n.state !== "Verified closed" && !(n.state === "Accepted" && n.severity === "minor");
  const lab = labBlock(a);

  return (
    <>
      {toast}
      <RecordPage
        back={{ to: "/certification", label: "Pipeline" }}
        reference={a.id}
        type={`${a.standard} application`}
        title={a.org}
        state={stateDef(APP_DEF, a.state)?.label}
        tone={stateDef(APP_DEF, a.state)?.tone}
        defaultTab={STATE_TO_TAB[a.state] ?? "docs"}
        chips={sla ? <span className={`crm-sla crm-sla--${sla.status}`}>{sla.label}</span> : null}
        actions={
          <Acts
            actions={acts}
            state={a.state}
            hide={["issue_quote", "complete_review", "review_more_info", "request_info"]}
            toast={show}
            act={(x, input) => actOnApplication(a.id, x.action, actor, input)}
          />
        }
        banner={
          a.state === "Awaiting Customer" ? (
            <div className="crm-banner crm-banner--info">Waiting for {a.contact} to send: {a.info_requests[a.info_requests.length - 1]?.items.map((i) => i.label).join(", ")}. Chases go out at D+7 and D+14; the file is flagged stale at D+21.</div>
          ) : a.transfer_from ? (
            <div className="crm-banner crm-banner--info">
              Transfer from {a.transfer_from.body} (certificate {a.transfer_from.certificate}, expires {fmtDate(a.transfer_from.expires)}): do the pre-transfer review before quoting.
            </div>
          ) : a.renewal_of ? (
            <div className="crm-banner crm-banner--info">Recertification of {a.renewal_of}.</div>
          ) : null
        }
        summary={
          <Facts
            rows={[
              { label: "Scheme", value: `${a.standard} (${b.scheme?.cac ? "CAC decides" : "Certification Manager decides"})` },
              { label: "Scope", value: a.scope },
              { label: "Employees / sites", value: `${a.employees} / ${a.sites.map((s) => s.name).join(", ")}` },
              { label: "Contact", value: `${a.contact}${a.phone ? ` · ${a.phone}` : ""} · ${a.customer_email === "demo" ? "demo customer" : a.customer_email}` },
              { label: "Received", value: `${fmtDate(a.created_at)} via ${a.channel}` },
            ]}
          />
        }
        tabs={[
          {
            id: "docs",
            label: "Documents",
            badge: a.documents.filter((d) => d.status !== "acceptable").length,
            render: () => (
              <div className="crm-stack">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Required document</th>
                      <th>Received</th>
                      <th>Verdict</th>
                      <th>Comment to customer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.documents.map((d) => (
                      <DocRow key={d.key} d={d} editable={["Document Review", "Submitted"].includes(a.state)} onSave={(status, comment) => run(() => setDocStatus(a.id, d.key, status, comment, actor), show, `${d.label}: ${status}`)} />
                    ))}
                  </tbody>
                </table>
                {a.state === "Document Review" ? (
                  <div className="crm-row">
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => setInfoOpen(true)}>
                      <Icon name="i-send" /> Request information
                    </button>
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => { const l = window.prompt("Extra required document"); if (l) void run(() => addDocument(a.id, l, actor), show, "Added."); }}>
                      <Icon name="i-plus" /> Add required document
                    </button>
                  </div>
                ) : null}
                {a.info_requests.length ? (
                  <div className="crm-card">
                    <h4 style={{ margin: "0 0 8px" }}>Information requests</h4>
                    {a.info_requests.map((r) => (
                      <p key={r.id} className="crm-small" style={{ margin: "4px 0" }}>
                        <b>{r.id}</b> {fmtDate(r.at)} by {r.by}: {r.items.map((i) => i.label).join(", ")} — {r.responded_at ? `answered ${fmtDate(r.responded_at)}: "${r.response}"` : `due ${fmtDate(r.due)}`}
                      </p>
                    ))}
                  </div>
                ) : null}
                <h4 style={{ margin: "6px 0 0" }}>Files</h4>
                <DocumentsPanel doctype="Certification Application" name={a.id} by={actor.name} categories={["Application", "Customer documents", "Audit plan", "Audit report", "Certificate", "Decision", "Other"]} gateCategories={["Certificate", "Decision"]} />
              </div>
            ),
          },
          { id: "quote", label: "Quote & payment", render: () => <QuoteTab b={b} actor={actor} show={show} /> },
          { id: "plan", label: "Audit plan", badge: a.stages.filter((s) => !s.visit_id).length, render: () => <PlanTab b={b} actor={actor} show={show} /> },
          {
            id: "findings",
            label: "Visits & findings",
            badge: a.findings.filter(open).length,
            render: () => <FindingsTab b={b} actor={actor} show={show} />,
          },
          ...(a.flow === "product" || a.flow === "combined"
            ? [
                {
                  id: "lab",
                  label: "Lab",
                  badge: lab ? "!" : undefined,
                  render: () => (
                    <div className="crm-stack">
                      {lab ? <div className="crm-banner crm-banner--err">{lab}</div> : <div className="crm-banner crm-banner--ok">All lab results approved and conforming.</div>}
                      <table className="crm-table">
                        <thead>
                          <tr>
                            <th>Sample</th>
                            <th>Custody</th>
                            <th>Test request</th>
                            <th>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.samples.map((s) => {
                            const t = b.tests.find((x) => x.sample_id === s.id);
                            return (
                              <tr key={s.id}>
                                <td>
                                  <b>{s.seal}</b>
                                  <span className="crm-small">
                                    {s.product} · batch {s.batch ?? "—"}
                                  </span>
                                </td>
                                <td>{s.state} · {s.holder}</td>
                                <td>{t ? <Link className="crm-link" to={`/metrology/tests/${t.id}`}>{t.id} ({t.state})</Link> : "—"}</td>
                                <td>{s.result ? <span className={`crm-pill crm-pill--${s.result === "pass" ? "green" : "red"}`}>{s.result}</span> : "Pending"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {!b.samples.length ? <Empty icon="i-flask" title="No samples yet">Samples are taken at the factory inspection in the Field app.</Empty> : null}
                    </div>
                  ),
                },
              ]
            : []),
          { id: "review", label: "Technical review", render: () => <TechReviewTab b={b} actor={actor} show={show} /> },
          {
            id: "decision",
            label: "Decision",
            render: () => (
              <div className="crm-stack">
                {a.technical_review ? (
                  <div className="crm-card">
                    <b>Technical review by {a.technical_review.by}</b> — recommends <b>{a.technical_review.recommendation}</b>
                    <p style={{ margin: "6px 0 0" }}>{a.technical_review.justification}</p>
                  </div>
                ) : (
                  <p className="crm-muted">No technical review yet.</p>
                )}
                {a.decision ? (
                  <div className="crm-card">
                    <b>
                      {a.decision.outcome === "refuse" ? "Refused" : a.decision.outcome === "grant_conditions" ? "Granted with conditions" : "Granted"}
                    </b>{" "}
                    by {a.decision.by} ({a.decision.body}) on {fmtDate(a.decision.at)}
                    <p style={{ margin: "6px 0 0" }}>{a.decision.note}</p>
                    {a.decision.conditions ? <p>Conditions: {a.decision.conditions}</p> : null}
                    {a.decision.appeal_until ? (
                      <p className="crm-small">
                        Appeal window until {fmtDate(a.decision.appeal_until)} ·{" "}
                        <Link className="crm-link" to={`/print/refusal/${a.id}`} target="_blank">
                          Refusal letter
                        </Link>
                      </p>
                    ) : null}
                  </div>
                ) : a.state === "Decision" ? (
                  <>
                    <p className="crm-small">Decide from the action bar above. Grant creates the certificate (R-C3); refusal generates the letter and opens the 90-day appeal window.</p>
                    {lab ? <div className="crm-banner crm-banner--err">{lab}</div> : null}
                  </>
                ) : (
                  <p className="crm-muted">The decision is taken after the technical review.</p>
                )}
              </div>
            ),
          },
          {
            id: "certificate",
            label: "Certificate",
            render: () =>
              b.certificate ? (
                <div className="crm-stack">
                  <Facts rows={[{ label: "Number", value: b.certificate.number }, { label: "State", value: b.certificate.state }, { label: "Expires", value: fmtDate(b.certificate.expires_at) }, { label: "Scope", value: b.certificate.scope }]} />
                  <div className="crm-row">
                    <Link className="crm-btn crm-btn--sm" to={`/certification/certificates/${b.certificate.id}`}>
                      Open certificate record
                    </Link>
                    <Link className="crm-btn crm-btn--sm" to={`/print/certificate/${b.certificate.id}`} target="_blank">
                      <Icon name="i-download" /> Certificate PDF
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="crm-muted">No certificate yet.</p>
              ),
          },
          { id: "history", label: "History", render: () => <HistoryTimeline events={a.history} /> },
        ]}
        rail={
          <>
            <RailCard title="Clock">
              <Facts
                rows={[
                  { label: "State", value: <WfPill def={APP_DEF} state={a.state} /> },
                  { label: "Customer sees", value: stateDef(APP_DEF, a.state)?.display?.customer ?? a.state },
                  { label: "Task", value: task ? `${task.title} · due ${fmtDate(task.due)}` : "—" },
                  { label: "Chases", value: a.chases?.length ? a.chases.map((c) => `D+${c.day}`).join(", ") : "—" },
                ]}
              />
            </RailCard>
            <RailCard title="People">
              <Facts rows={[{ label: "Officer", value: a.officer ?? "Unclaimed" }, { label: "Audit team", value: team.join(", ") || "—" }, { label: "Technical reviewer", value: reviewer.join(", ") || "—" }, { label: "Decision", value: a.decision?.by ?? "—" }]} />
            </RailCard>
            <RailCard title="Linked records">
              <ul className="crm-small" style={{ margin: 0, paddingLeft: 16 }}>
                {b.visits.map((v) => (
                  <li key={v.id}>
                    <Link className="crm-link" to={`/field/visits/${v.id}`}>
                      {v.id}
                    </Link>{" "}
                    {VISIT_TYPES[v.type].short} · {v.state}
                  </li>
                ))}
                {b.invoice ? <li>Invoice {b.invoice.id} · {b.invoice.status}</li> : null}
                {b.certificate ? (
                  <li>
                    <Link className="crm-link" to={`/certification/certificates/${b.certificate.id}`}>
                      {b.certificate.number}
                    </Link>
                  </li>
                ) : null}
                {a.client_id ? (
                  <li>
                    <Link className="crm-link" to={`/crm/clients/${a.client_id}`}>
                      Client 360
                    </Link>
                  </li>
                ) : null}
              </ul>
            </RailCard>
            <IndependencePanel
              duties={duties}
              checks={[
                { rule: "Technical reviewer ≠ audit team", ok: !reviewer.some((r) => team.includes(r)) && !team.includes(actor.name) || a.state !== "Technical Review", detail: team.includes(actor.name) ? "You were on the audit team — you can't review." : undefined },
                { rule: "Decision-maker ≠ team ≠ reviewer", ok: ![...team, ...reviewer].includes(actor.name), detail: [...team, ...reviewer].includes(actor.name) ? "You can't take the decision on this file." : undefined },
              ]}
            />
            <RailCard title="Assistant">
              <SuggestButton
                build={() => ({
                  summary: `${a.org}, ${a.standard}. ${a.history.length} events; now ${a.state}.`,
                  flags: [
                    ...a.documents.filter((d) => d.required && d.status !== "acceptable").map((d) => `Document not acceptable: ${d.label}`),
                    ...a.findings.filter(ncOverdue).map((n) => `${n.id} response overdue`),
                    ...(lab ? [lab] : []),
                  ],
                  next: acts.find((x) => !x.disabledReason && x.primary)?.label,
                  draft: a.state === "Document Review" ? infoRequestDraft(a).message : undefined,
                })}
              />
            </RailCard>
          </>
        }
      />
      {infoOpen ? <InfoRequestDialog b={b} actor={actor} onClose={() => setInfoOpen(false)} onDone={() => (setInfoOpen(false), show("Information requested — the customer was notified."))} /> : null}
    </>
  );
}

function DocRow({ d, editable, onSave }: { d: AppDoc; editable: boolean; onSave: (s: AppDoc["status"], c: string) => void }) {
  const [comment, setComment] = useState(d.comment ?? "");
  return (
    <tr>
      <td>
        <b>{d.label}</b>
      </td>
      <td className="crm-small">{d.versions.length ? `${d.versions[d.versions.length - 1].name} · ${fmtDate(d.versions[d.versions.length - 1].at)}${d.versions.length > 1 ? ` (v${d.versions.length})` : ""}` : "—"}</td>
      <td>
        {editable ? (
          <Select value={d.status} onChange={(val) => onSave(val as AppDoc["status"], comment)} aria-label={`Verdict for ${d.label}`}>
            {DOC_STATUS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        ) : (
          <span className={`crm-pill crm-pill--${DOC_TONE[d.status]}`}>{d.status}</span>
        )}
      </td>
      <td>
        {editable ? <input className="crm-input" value={comment} placeholder="Shown to the customer" onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (d.comment ?? "") && onSave(d.status, comment)} /> : <span className="crm-small">{d.comment ?? ""}</span>}
      </td>
    </tr>
  );
}

function InfoRequestDialog({ b, actor, onClose, onDone }: { b: AppBundle; actor: Actor; onClose: () => void; onDone: () => void }) {
  const draft = infoRequestDraft(b.app);
  const [items, setItems] = useState(draft.items.map((i) => i.key));
  return (
    <ReasonDialog
      title="Request information from the customer"
      consequence="Moves the file to Awaiting Customer (clock paused). The customer sees an 'Action needed' card with an upload slot per item."
      requires="reason"
      reasonLabel="Message to the customer"
      initialReason={draft.message}
      confirmLabel="Send request"
      canSubmit={items.length > 0}
      preview={(r) => ({ to: `${b.app.contact} <${b.app.customer_email}>`, subject: `Action needed on ${b.app.id}`, body: r, channel: ["email", "portal"] })}
      onClose={onClose}
      onSubmit={async (v) => {
        await requestInfo(b.app.id, draft.items.filter((i) => items.includes(i.key)), v.reason ?? "", actor, b.app.state);
        onDone();
      }}
    >
      <p className="crm-small">Items to request (from missing / rejected documents):</p>
      {b.app.documents.filter((d) => d.status !== "acceptable").map((d) => (
        <label key={d.key} className="crm-check">
          <input type="checkbox" checked={items.includes(d.key)} onChange={(e) => setItems(e.target.checked ? [...items, d.key] : items.filter((x) => x !== d.key))} /> {d.label}
          {d.comment ? <span className="crm-small"> — {d.comment}</span> : null}
        </label>
      ))}
    </ReasonDialog>
  );
}

function QuoteTab({ b, actor, show }: { b: AppBundle; actor: Actor; show: (m: string) => void }) {
  const a = b.app;
  const calc = feeCalc(a.scheme, a.employees, a.sites.length);
  const [lines, setLines] = useState<FeeLine[]>(calc.lines);
  const [days, setDays] = useState(calc.auditor_days);
  const block = appActions(a.id, actor).find((x) => x.action === "issue_quote");
  if (a.quote) {
    const inv = b.invoice;
    const t = inv ? invoiceTotals(inv) : null;
    return (
      <div className="crm-stack">
        <table className="crm-table">
          <tbody>
            {a.quote.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.label}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{fmtMoney(l.unit_price)}</td>
                <td className="num">{fmtMoney(l.qty * l.unit_price)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <b>Net (excl. VAT)</b>
              </td>
              <td className="num">
                <b>{fmtMoney(linesTotal(a.quote.lines))}</b>
              </td>
            </tr>
          </tbody>
        </table>
        <Facts
          rows={[
            { label: "Quote", value: `${a.quote.id} · issued ${fmtDate(a.quote.issued_at)} by ${a.quote.issued_by} · valid until ${fmtDate(a.quote.valid_until)}` },
            { label: "Auditor-days", value: a.quote.auditor_days },
            { label: "Agreement", value: a.quote.agreement ? `Signed by ${a.quote.agreement.name}, ${a.quote.agreement.title} on ${fmtDate(a.quote.agreement.at)}` : a.quote.declined ? `Declined: ${a.quote.declined.reason}` : "Not yet accepted" },
            { label: "Deposit", value: inv && t ? `${inv.id}: ${fmtMoney(t.paid)} paid of ${fmtMoney(inv.deposit ?? t.total)} deposit (${inv.status})` : `${a.quote.deposit_pct}% on acceptance` },
          ]}
        />
        <Link className="crm-btn crm-btn--sm" style={{ alignSelf: "flex-start" }} to={`/print/certquote/${a.id}`} target="_blank">
          <Icon name="i-download" /> Quote & agreement PDF
        </Link>
      </div>
    );
  }
  if (a.state !== "Document Review") return <p className="crm-muted">The quote is built once the documents are reviewed.</p>;
  const total = linesTotal(lines);
  return (
    <div className="crm-stack">
      <p className="crm-small">
        Fee calculator: {a.employees} employees, {a.sites.length} site(s) → <b>{calc.auditor_days} auditor-days</b> (table to confirm). Edit lines as needed.
      </p>
      <table className="crm-table">
        <thead>
          <tr>
            <th>Line</th>
            <th>Qty</th>
            <th>Unit price (E)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <input className="crm-input" value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              </td>
              <td>
                <input className="crm-input" type="number" step="0.5" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
              </td>
              <td>
                <input className="crm-input" type="number" value={l.unit_price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) } : x)))} />
              </td>
              <td>
                <button type="button" className="crm-link" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="crm-row">
        <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setLines([...lines, { label: "", qty: 1, unit_price: 0 }])}>
          <Icon name="i-plus" /> Line
        </button>
        <label className="crm-small">
          Auditor-days <input className="crm-input" style={{ width: 80, display: "inline-block" }} type="number" step="0.5" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        <span className="crm-spacer" />
        <b>
          {fmtMoney(total)} + VAT = {fmtMoney(total * 1.15)}
        </b>
      </div>
      {block?.disabledReason ? <p className="eo-error">{block.disabledReason}</p> : null}
      <button type="button" className="crm-btn crm-btn--pri" style={{ alignSelf: "flex-start" }} disabled={!block || Boolean(block.disabledReason)} onClick={() => void run(() => issueQuote(a.id, lines, days, actor), show, "Quote issued — the customer can accept and pay online.")}>
        Accept documents & issue quote
      </button>
    </div>
  );
}

function PlanTab({ b, actor, show }: { b: AppBundle; actor: Actor; show: (m: string) => void }) {
  const a = b.app;
  const [stage, setStage] = useState({ label: a.stages.length ? "Stage 2" : a.flow === "ms" || a.flow === "combined" ? "Stage 1" : "Factory inspection + sampling", date: "", days: "1" });
  const [pick, setPick] = useState<string | null>(null);
  const canPlan = ["Audit Planned", "Audit in Progress", "NC Resolution"].includes(a.state);
  const pickVisit = b.visits.find((v) => v.id === pick);
  return (
    <div className="crm-stack">
      {!canPlan && !a.stages.length ? <p className="crm-muted">Audit planning opens once the customer has accepted the quote and paid the deposit.</p> : null}
      <table className="crm-table">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Date</th>
            <th>Auditor-days</th>
            <th>Visit & team</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {a.stages.map((s) => {
            const v = b.visits.find((x) => x.id === s.visit_id);
            return (
              <tr key={s.id}>
                <td>
                  <b>{s.label}</b>
                </td>
                <td>{fmtDate(v?.planned_date ?? s.date)}</td>
                <td>{s.days}</td>
                <td>
                  {v ? (
                    <>
                      <Link className="crm-link" to={`/field/visits/${v.id}`}>
                        {v.id}
                      </Link>{" "}
                      <WfPill def={visitDef(v.type)} state={v.state} />
                      <span className="crm-small">{v.lead ? [`${v.lead} (lead)`, ...v.team].join(", ") : "No team yet"}</span>
                    </>
                  ) : (
                    <span className="crm-muted">Not planned</span>
                  )}
                </td>
                <td className="num">
                  {!v && canPlan ? (
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => void run(() => planStageVisit(a.id, s.id, actor), show, "Visit planned — now assign the team.")}>
                      Plan visit
                    </button>
                  ) : v && v.state === "Planned" ? (
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setPick(v.id)}>
                      Assign team
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canPlan ? (
        <div className="crm-row" style={{ alignItems: "flex-end" }}>
          <label className="crm-field" style={{ flex: 2 }}>
            Stage
            <input className="crm-input" value={stage.label} onChange={(e) => setStage({ ...stage, label: e.target.value })} />
          </label>
          <label className="crm-field">
            Date
            <input className="crm-input" type="date" value={stage.date} onChange={(e) => setStage({ ...stage, date: e.target.value })} />
          </label>
          <label className="crm-field" style={{ width: 110 }}>
            Auditor-days
            <input className="crm-input" type="number" step="0.5" value={stage.days} onChange={(e) => setStage({ ...stage, days: e.target.value })} />
          </label>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void run(() => addStage(a.id, { label: stage.label, date: stage.date, days: Number(stage.days) }, actor), show, "Stage added.").then((ok) => ok && setStage({ label: "Stage 2", date: "", days: "3" }))}>
            <Icon name="i-plus" /> Add stage
          </button>
        </div>
      ) : null}
      {a.stages.length ? (
        <div className="crm-row">
          <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void run(() => sendAuditPlan(a.id, actor), show, "Audit plan sent to the client.")}>
            <Icon name="i-send" /> {a.plan_sent_at ? `Re-send audit plan (sent ${fmtDate(a.plan_sent_at)})` : "Send audit plan to client"}
          </button>
          <Link className="crm-btn crm-btn--sm" to={`/print/auditplan/${a.id}`} target="_blank">
            <Icon name="i-download" /> Audit plan PDF
          </Link>
          {a.quote ? <span className="crm-small">Quoted: {a.quote.auditor_days} auditor-days · planned: {a.stages.reduce((n, s) => n + s.days, 0)}</span> : null}
        </div>
      ) : null}
      {pickVisit ? <TeamPicker visit={pickVisit} actor={actor} onClose={() => setPick(null)} onDone={(m) => (setPick(null), show(m))} /> : null}
    </div>
  );
}

function FindingsTab({ b, actor, show }: { b: AppBundle; actor: Actor; show: (m: string) => void }) {
  const a = b.app;
  const [nc, setNc] = useState<{ clause: string; severity: Nonconformity["severity"]; statement: string } | null>(null);
  const [review, setReview] = useState<{ n: Nonconformity; mode: "accept" | "reject" | "verify" } | null>(null);
  return (
    <div className="crm-stack">
      <h4 style={{ margin: 0 }}>Visits</h4>
      {b.visits.length ? (
        <table className="crm-table">
          <tbody>
            {b.visits.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link className="crm-link" to={`/field/visits/${v.id}`}>
                    {v.id}
                  </Link>
                  <span className="crm-small">{v.title}</span>
                </td>
                <td>{fmtDate(v.planned_date)}</td>
                <td>
                  <WfPill def={visitDef(v.type)} state={v.state} />
                </td>
                <td className="crm-small">
                  {v.findings.length} findings · {v.sample_ids.length} samples
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="crm-muted">No visits yet.</p>
      )}
      {b.visits.filter((v) => v.type !== "market_sampling").map((v) => (
        <AuditReportCard key={v.id} appId={a.id} visitId={v.id} title={v.title} actor={actor} show={show} />
      ))}
      <div className="crm-row">
        <h4 style={{ margin: 0 }}>Nonconformities</h4>
        <span className="crm-spacer" />
        <button type="button" className="crm-btn crm-btn--sm" onClick={() => setNc({ clause: "", severity: "minor", statement: "" })}>
          <Icon name="i-plus" /> Raise finding
        </button>
      </div>
      {a.findings.length ? (
        <table className="crm-table">
          <thead>
            <tr>
              <th>Finding</th>
              <th>State</th>
              <th>Customer response</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {a.findings.map((n) => (
              <tr key={n.id}>
                <td>
                  <b>
                    {n.id} · {n.clause}
                  </b>{" "}
                  <span className={`crm-pill crm-pill--${n.severity === "major" ? "red" : n.severity === "minor" ? "amber" : "slate"}`}>{n.severity}</span>
                  <span className="crm-small">{n.statement}</span>
                </td>
                <td>
                  {n.state}
                  {ncOverdue(n) ? <span className="crm-pill crm-pill--red">Overdue</span> : null}
                  <span className="crm-small">Due {fmtDate(n.due)}{n.rejections ? ` · ${n.rejections} rejection(s)` : ""}</span>
                </td>
                <td className="crm-small">
                  {n.response ? (
                    <>
                      <b>Root cause:</b> {n.response.root_cause}
                      <br />
                      <b>Correction:</b> {n.response.correction}
                      <br />
                      <b>Corrective action:</b> {n.response.corrective_action}
                      <br />
                      <b>Evidence:</b> {n.response.evidence.join(", ") || "—"}
                    </>
                  ) : (
                    "—"
                  )}
                  {n.review ? <p style={{ margin: "4px 0 0" }}>Review: {n.review.accepted ? "accepted" : "rejected"} by {n.review.by} — {n.review.note}</p> : null}
                </td>
                <td className="num">
                  {n.state === "Response submitted" ? (
                    <>
                      <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setReview({ n, mode: "accept" })}>
                        Accept
                      </button>{" "}
                      <button type="button" className="crm-btn crm-btn--sm crm-btn--danger" onClick={() => setReview({ n, mode: "reject" })}>
                        Reject
                      </button>
                    </>
                  ) : n.state === "Accepted" ? (
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setReview({ n, mode: "verify" })}>
                      Verify closed
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="crm-muted">No findings.</p>
      )}
      {nc ? (
        <ReasonDialog
          title="Raise a finding"
          consequence="The customer is notified and has the configured number of days to respond with root cause, correction and corrective action (R-C2)."
          reasonLabel="Statement of nonconformity"
          requires="note"
          canSubmit={Boolean(nc.clause.trim())}
          onClose={() => setNc(null)}
          onSubmit={async (v) => {
            raiseNc(a.id, { clause: nc.clause, severity: nc.severity, statement: v.note ?? "" }, actor);
            setNc(null);
            show("Finding raised.");
          }}
        >
          <div className="crm-grid crm-grid--2">
            <label className="crm-field">
              Clause
              <input className="crm-input" value={nc.clause} onChange={(e) => setNc({ ...nc, clause: e.target.value })} placeholder="ISO 9001 §8.5.1" />
            </label>
            <label className="crm-field">
              Severity
              <Select value={nc.severity} onChange={(val) => setNc({ ...nc, severity: val as Nonconformity["severity"] })} block>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="observation">Observation</option>
              </Select>
            </label>
          </div>
        </ReasonDialog>
      ) : null}
      {review ? (
        <ReasonDialog
          title={review.mode === "verify" ? `Verify ${review.n.id} closed` : `${review.mode === "accept" ? "Accept" : "Reject"} response to ${review.n.id}`}
          consequence={review.mode === "reject" ? "The finding goes back to the customer with your reason." : review.mode === "verify" ? "Record the objective evidence that closes the major." : review.n.severity === "major" ? "Accepted majors still need verification on evidence." : "Accepting closes the minor finding."}
          requires={review.mode === "accept" ? undefined : review.mode === "reject" ? "reason" : "note"}
          onClose={() => setReview(null)}
          onSubmit={async (v) => {
            if (review.mode === "verify") verifyNc(a.id, review.n.id, v.note ?? "", actor);
            else reviewNc(a.id, review.n.id, review.mode === "accept", v.reason ?? v.note ?? "", actor);
            setReview(null);
            show("Saved.");
          }}
        />
      ) : null}
    </div>
  );
}

function TechReviewTab({ b, actor, show }: { b: AppBundle; actor: Actor; show: (m: string) => void }) {
  const a = b.app;
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [rec, setRec] = useState<"grant" | "refuse" | "more_info">("grant");
  const [why, setWhy] = useState("");
  const allowed = appActions(a.id, actor).find((x) => x.action === "complete_review");
  if (a.state !== "Technical Review")
    return a.technical_review ? (
      <div className="crm-stack">
        <Facts rows={[{ label: "Reviewer", value: a.technical_review.by }, { label: "Date", value: fmtDate(a.technical_review.at) }, { label: "Recommendation", value: a.technical_review.recommendation }, { label: "Justification", value: a.technical_review.justification }]} />
        {a.technical_review.checklist.length ? (
          <ul className="eo-checks">
            {a.technical_review.checklist.map((c) => (
              <li key={c.id} className={c.ok ? "ok" : "bad"}>
                <Icon name={c.ok ? "i-check-c" : "i-warn"} />
                <span>
                  <b>{c.q}</b>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : (
      <p className="crm-muted">The technical review happens once visits are closed and all findings resolved.</p>
    );
  return (
    <div className="crm-stack">
      {!allowed ? <div className="crm-banner crm-banner--lock">Only a Technical Reviewer outside the audit team can complete this review.</div> : allowed.disabledReason ? <div className="crm-banner crm-banner--lock">{allowed.disabledReason}</div> : null}
      <p className="crm-small">Read the audit report(s), NC closure evidence and lab results (tabs above), then record your review.</p>
      {TR_CHECKLIST.map((c) => (
        <label key={c.id} className="crm-check">
          <input type="checkbox" checked={Boolean(checks[c.id])} onChange={(e) => setChecks({ ...checks, [c.id]: e.target.checked })} /> {c.q}
        </label>
      ))}
      <div className="crm-seg" role="radiogroup" aria-label="Recommendation">
        {(["grant", "more_info", "refuse"] as const).map((r) => (
          <button key={r} type="button" className={rec === r ? "on" : ""} onClick={() => setRec(r)}>
            {r === "grant" ? "Recommend grant" : r === "refuse" ? "Recommend refusal" : "More information"}
          </button>
        ))}
      </div>
      <textarea className="crm-textarea" placeholder="Justification (required)" value={why} onChange={(e) => setWhy(e.target.value)} />
      <button
        type="button"
        className="crm-btn crm-btn--pri"
        style={{ alignSelf: "flex-start" }}
        disabled={!allowed || Boolean(allowed.disabledReason)}
        onClick={() => void run(() => completeTechnicalReview(a.id, { checklist: TR_CHECKLIST.map((c) => ({ ...c, ok: Boolean(checks[c.id]) })), recommendation: rec, justification: why }, actor), show, rec === "more_info" ? "Returned for more evidence." : "Review complete — decision task opened.")}
      >
        Complete technical review
      </button>
    </div>
  );
}

/** Audit report generator (05 P3): draft from the Field record, edited by the lead auditor, filed as a document. */
function AuditReportCard({ appId, visitId, title, actor, show }: { appId: string; visitId: string; title: string; actor: Actor; show: (m: string) => void }) {
  const saved = auditReportFor(appId, visitId);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <h3>Audit report — {title}</h3>
        {saved ? (
          <span className="crm-small">
            v{saved.version} saved {fmtDate(saved.at)} by {saved.by}
          </span>
        ) : (
          <span className="crm-pill crm-pill--amber">Not written</span>
        )}
      </div>
      {text === null ? (
        <div className="crm-row">
          <button
            type="button"
            className="crm-btn crm-btn--sm crm-btn--pri"
            onClick={() => {
              setErr(null);
              try {
                setText(saved ? saved.text : draftAuditReport(appId, visitId));
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <Icon name="i-spark" /> {saved ? "Edit report" : "Generate report draft"}
          </button>
          {saved ? (
            <Link className="crm-btn crm-btn--sm" to={`/print/auditreport/${appId}?visit=${visitId}`} target="_blank">
              Print
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <p className="crm-small" style={{ marginTop: 0 }}>
            Drafted from the checklist, findings, photos and sign-offs. Check every statement before you save.
          </p>
          <textarea className="crm-textarea" rows={18} style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 12.5 }} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="crm-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="crm-btn crm-btn--sm crm-btn--pri"
              onClick={() => {
                setErr(null);
                try {
                  const r = saveAuditReport(appId, visitId, text, actor);
                  setText(null);
                  show(`Audit report v${r.version} saved to Documents.`);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Save report
            </button>
            <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setText(draftAuditReport(appId, visitId))}>
              Regenerate from field record
            </button>
            <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setText(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
      {err ? <p className="eo-error">{err}</p> : null}
    </div>
  );
}
