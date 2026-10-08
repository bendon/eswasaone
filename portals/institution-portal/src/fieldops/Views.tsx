/**
 * Field operations in the Institution portal (gap 08 P2): planning board (Planned → Assigned with
 * eligibility), every visit, the visit record page (report review ≠ lead, return with reason, abort
 * decisions, sync conflicts) and sample custody / lab receipt by scan.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  actOnVisit,
  getVisit,
  listSamples,
  listVisits,
  overdueCheckIn,
  planVisit,
  receiveSample,
  resolveConflict,
  sampleBySeal,
  sendSampleToLab,
  SAMPLE_STATES,
  VISIT_TYPES,
  visitActions,
  visitDef,
  type FieldVisit,
  type VisitType,
} from "@eswasaone/shared-ui/field";
import { DocumentsPanel, Facts, HistoryTimeline, IndependencePanel, RailCard, RecordPage, fmtDate } from "@eswasaone/shared-ui/record";
import { ReasonDialog, dutyList, stateDef } from "@eswasaone/shared-ui/workflow";
import { Acts, Empty, Gate, PageHead, run, Tile, useDomain, useStaffActor, useToast, WfPill } from "../domain/ui";
import { TeamPicker } from "./TeamPicker";

const vLink = (id: string) => `/field/visits/${id}`;

export function PlanningBoard() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [type, setType] = useState<VisitType | "">("");
  const [pick, setPick] = useState<string | null>(null);
  const [plan, setPlan] = useState(false);
  const res = useDomain(() => listVisits({ type }), [type]);
  const cols = ["Planned", "Assigned", "Accepted", "Confirmed", "In Progress", "Submitted", "Returned", "Aborted"];
  return (
    <Gate res={res} what="Visits">
      {(visits) => {
        const v = visits.find((x) => x.id === pick);
        return (
          <div className="crm-stack">
            {toast}
            <PageHead
              title="Field planning board"
              sub="One board for audits, inspections, market sampling, investigations and on-site calibration. Assign with eligibility checks; review reports (≠ lead)."
              actions={
                <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setPlan(true)}>
                  <Icon name="i-plus" /> Plan a visit
                </button>
              }
            />
            <div className="crm-kpis">
              <Tile label="Need a team" value={visits.filter((x) => x.state === "Planned").length} tone="amber" />
              <Tile label="Reports to review" value={visits.filter((x) => x.state === "Submitted").length} tone="amber" />
              <Tile label="Overdue check-in (R-V2)" value={visits.filter(overdueCheckIn).length} tone={visits.some(overdueCheckIn) ? "red" : "green"} />
              <Tile label="Aborted — decide" value={visits.filter((x) => x.state === "Aborted").length} tone={visits.some((x) => x.state === "Aborted") ? "red" : undefined} />
            </div>
            <div className="crm-seg">
              <button type="button" className={type === "" ? "on" : ""} onClick={() => setType("")}>
                All
              </button>
              {(Object.keys(VISIT_TYPES) as VisitType[]).map((t) => (
                <button key={t} type="button" className={type === t ? "on" : ""} onClick={() => setType(t)}>
                  {VISIT_TYPES[t].short}
                  {VISIT_TYPES[t].toConfirm ? " *" : ""}
                </button>
              ))}
            </div>
            <div className="crm-kanban" style={{ gridAutoColumns: "minmax(220px, 1fr)" }}>
              {cols.map((c) => {
                const list = visits.filter((x) => x.state === c);
                return (
                  <div key={c} className="crm-col">
                    <div className="crm-col__h">
                      <WfPill def={visitDef("cert_audit")} state={c} />
                      <b>{list.length}</b>
                    </div>
                    {list.map((x) => (
                      <div key={x.id} className="crm-opp">
                        <Link to={vLink(x.id)} className="crm-link">
                          <b>{x.title}</b>
                        </Link>
                        <span className="crm-small" style={{ display: "block" }}>
                          {VISIT_TYPES[x.type].short} · {fmtDate(x.planned_date)} · {x.lead ?? "no lead"}
                        </span>
                        {overdueCheckIn(x) ? <span className="crm-pill crm-pill--red">No check-in</span> : null}
                        {x.conflict && !x.conflict.resolved ? <span className="crm-pill crm-pill--red">Sync conflict</span> : null}
                        {x.reschedule_request ? <span className="crm-pill crm-pill--amber">Reschedule asked</span> : null}
                        {x.state === "Planned" ? (
                          <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" style={{ marginTop: 6 }} onClick={() => setPick(x.id)}>
                            Assign team
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {v ? <TeamPicker visit={v} actor={actor} onClose={() => setPick(null)} onDone={(m) => (setPick(null), show(m))} /> : null}
            {plan ? (
              <ReasonDialog
                title="Plan a visit"
                consequence="Creates a visit in Planned. Certification audits are normally planned from the application; this is for ad-hoc inspections and investigations."
                fields={[
                  { key: "type", label: "Type", type: "select", required: true, options: (Object.keys(VISIT_TYPES) as VisitType[]).map((t) => ({ value: t, label: `${VISIT_TYPES[t].label}${VISIT_TYPES[t].toConfirm ? " (mandate to confirm)" : ""}` })) },
                  { key: "title", label: "Title", required: true },
                  { key: "client", label: "Client / premises", required: true },
                  { key: "address", label: "Address", required: true },
                  { key: "date", label: "Date", type: "date", required: true },
                  { key: "scope", label: "Scope / purpose", type: "textarea" },
                ]}
                onClose={() => setPlan(false)}
                onSubmit={async (val) => {
                  const p = val.payload ?? {};
                  planVisit({ type: p.type as VisitType, title: p.title, client: p.client, client_email: "", site: { name: p.client, address: p.address, contact: "On site" }, planned_date: new Date(p.date).toISOString(), scope: p.scope }, actor);
                  setPlan(false);
                  show("Visit planned.");
                }}
              />
            ) : null}
          </div>
        );
      }}
    </Gate>
  );
}

export function VisitRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [pick, setPick] = useState(false);
  const [conflict, setConflict] = useState(false);
  const res = useDomain(() => getVisit(id), [id]);
  return (
    <Gate res={res} what="Visit">
      {(v: FieldVisit) => {
        const cfg = VISIT_TYPES[v.type];
        const acts = visitActions(v.id, actor);
        return (
          <>
            {toast}
            <RecordPage
              back={{ to: "/field", label: "Planning board" }}
              reference={v.id}
              type={cfg.label}
              title={v.title}
              state={stateDef(visitDef(v.type), v.state)?.label}
              tone={stateDef(visitDef(v.type), v.state)?.tone}
              chips={overdueCheckIn(v) ? <span className="crm-pill crm-pill--red">No check-in (R-V2)</span> : null}
              actions={
                <>
                  {v.state === "Planned" ? (
                    <button type="button" className="crm-btn crm-btn--pri" onClick={() => setPick(true)}>
                      Assign team
                    </button>
                  ) : null}
                  {v.conflict && !v.conflict.resolved ? (
                    <button type="button" className="crm-btn crm-btn--danger" onClick={() => setConflict(true)}>
                      Resolve sync conflict
                    </button>
                  ) : null}
                  <Acts actions={acts} hide={["assign"]} state={v.state} toast={show} act={(a, input) => actOnVisit(v.id, a.action, actor, input)} />
                </>
              }
              banner={
                v.abort ? (
                  <div className="crm-banner crm-banner--err">
                    Aborted {fmtDate(v.abort.at)}: {v.abort.code.replace("_", " ")} — {v.abort.reason}. Replan or cancel (R-V3).
                  </div>
                ) : v.reschedule_request ? (
                  <div className="crm-banner crm-banner--info">
                    The customer asked for {fmtDate(v.reschedule_request.proposed)}: “{v.reschedule_request.reason}”. Use Reschedule to propose the new date.
                  </div>
                ) : v.conflict && !v.conflict.resolved ? (
                  <div className="crm-banner crm-banner--err">Sync conflict: {v.conflict.detail}</div>
                ) : null
              }
              summary={
                <Facts
                  rows={[
                    { label: "For", value: v.parent ? <Link className="crm-link" to={v.parent.link ?? "#"}>{v.parent.label}</Link> : "—" },
                    { label: "Client / site", value: `${v.client} — ${v.site.name}, ${v.site.address}` },
                    { label: "Date", value: `${fmtDate(v.planned_date)} · ${v.duration_days} day(s)${v.auditor_days ? ` · ${v.auditor_days} auditor-days` : ""}` },
                    { label: "Team", value: v.lead ? [`${v.lead} (lead)`, ...v.team].join(", ") : "Not assigned" },
                    { label: "Customer confirmed", value: cfg.confirm ? (v.customer_confirmed_at ? fmtDate(v.customer_confirmed_at) : "Not yet") : "Unannounced visit" },
                  ]}
                />
              }
              tabs={[
                {
                  id: "report",
                  label: "Report",
                  render: () => (
                    <div className="crm-stack">
                      {v.checkin ? <p className="crm-small">Checked in {fmtDate(v.checkin.at)} by {v.checkin.by} at {v.checkin.lat.toFixed(4)}, {v.checkin.lng.toFixed(4)} (±{v.checkin.accuracy} m)</p> : null}
                      {cfg.body.includes("checklist") ? (
                        <>
                          <h4 style={{ margin: 0 }}>Checklist {v.checklist_version} {v.pack ? "(frozen)" : ""}</h4>
                          <table className="crm-table">
                            <tbody>
                              {v.checklist.map((c) => (
                                <tr key={c.id}>
                                  <td className="crm-small">{c.section}</td>
                                  <td>{c.question}</td>
                                  <td>{c.answer ? <span className={`crm-pill crm-pill--${c.answer === "yes" ? "green" : c.answer === "no" ? "red" : "slate"}`}>{c.answer}</span> : "—"}</td>
                                  <td className="crm-small">{c.note}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : null}
                      {v.findings.length ? (
                        <>
                          <h4 style={{ margin: 0 }}>Findings</h4>
                          {v.findings.map((f) => (
                            <p key={f.id} style={{ margin: "4px 0" }}>
                              <span className={`crm-pill crm-pill--${f.severity === "major" ? "red" : "amber"}`}>{f.severity}</span> <b>{f.clause}</b> — {f.statement}
                            </p>
                          ))}
                        </>
                      ) : null}
                      {v.cal_points.length ? (
                        <>
                          <h4 style={{ margin: 0 }}>Calibration points</h4>
                          <table className="crm-table">
                            <tbody>
                              {v.cal_points.map((p) => (
                                <tr key={p.id}>
                                  <td>{p.instrument}</td>
                                  <td>
                                    {p.nominal} {p.unit}
                                  </td>
                                  <td>found {p.as_found}</td>
                                  <td>left {p.as_left}</td>
                                  <td>±{p.tolerance}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : null}
                      {v.notes ? (
                        <p>
                          <b>Notes:</b> {v.notes}
                        </p>
                      ) : null}
                      <p className="crm-small">
                        Photos: {v.photos.map((p) => `${p.name} (#${p.hash})`).join(", ") || "—"} · Signatures: {v.signatures.map((s) => `${s.name} (${s.role})`).join(", ") || "—"}
                      </p>
                      {v.review ? <p className="crm-small">Review: {v.review.outcome} by {v.review.by} on {fmtDate(v.review.at)}{v.review.note ? ` — ${v.review.note}` : ""}</p> : null}
                    </div>
                  ),
                },
                {
                  id: "samples",
                  label: "Samples",
                  badge: v.sample_ids.length,
                  render: () => <SampleTable visit={v.id} />,
                },
                { id: "docs", label: "Documents", render: () => <DocumentsPanel doctype="Field Visit" name={v.id} by={actor.name} categories={["Visit pack", "Audit report", "Photos", "Abort evidence", "Other"]} /> },
                { id: "history", label: "History", render: () => <HistoryTimeline events={v.history} /> },
              ]}
              rail={
                <>
                  <IndependencePanel duties={dutyList(v)} checks={[{ rule: "Report reviewer ≠ visit lead", ok: v.lead !== actor.name, detail: v.lead === actor.name ? "You led this visit." : undefined }]} />
                  <RailCard title="Pack">
                    <p className="crm-small">{v.pack ? `Downloaded ${fmtDate(v.pack.downloaded_at)} — checklist ${v.checklist_version} frozen.` : "Not downloaded yet."}</p>
                    {v.site.directions ? <p className="crm-small">Directions: {v.site.directions}</p> : null}
                  </RailCard>
                </>
              }
            />
            {pick ? <TeamPicker visit={v} actor={actor} onClose={() => setPick(false)} onDone={(m) => (setPick(false), show(m))} /> : null}
            {conflict ? (
              <ReasonDialog
                title="Resolve sync conflict"
                consequence="Records how the supervisor resolved what the device sent while the record moved on."
                requires="note"
                onClose={() => setConflict(false)}
                onSubmit={async (val) => {
                  resolveConflict(v.id, actor, val.note ?? "");
                  setConflict(false);
                  show("Conflict resolved.");
                }}
              />
            ) : null}
          </>
        );
      }}
    </Gate>
  );
}

function SampleTable({ visit }: { visit?: string }) {
  const res = useDomain(() => listSamples(visit ? { visit } : {}), [visit]);
  return (
    <Gate res={res} what="Samples">
      {(rows) =>
        rows.length ? (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Seal</th>
                <th>Product</th>
                <th>Custody</th>
                <th>State</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="crm-mono">{s.seal}</td>
                  <td>
                    {s.product}
                    <span className="crm-small">
                      {s.brand} · batch {s.batch ?? "—"} · {s.quantity} · split {s.split.test}/{s.split.retained}/{s.split.client}
                    </span>
                  </td>
                  <td className="crm-small">
                    {s.custody.map((c) => `${fmtDate(c.at)} ${c.actor}: ${c.action}`).join(" → ")}
                  </td>
                  <td>
                    <span className={`crm-pill crm-pill--${SAMPLE_STATES.find((x) => x.id === s.state)?.tone ?? "slate"}`}>{SAMPLE_STATES.find((x) => x.id === s.state)?.label}</span>
                  </td>
                  <td>{s.result ? <span className={`crm-pill crm-pill--${s.result === "pass" ? "green" : "red"}`}>{s.result}</span> : s.test_request_id ? <Link className="crm-link" to={`/metrology/tests/${s.test_request_id}`}>{s.test_request_id}</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="i-flask" title="No samples" />
        )
      }
    </Gate>
  );
}

export function SampleReceiptView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [seal, setSeal] = useState("");
  const [cond, setCond] = useState<"ok" | "damaged" | "seal_broken" | "mismatch">("ok");
  const [note, setNote] = useState("");
  const res = useDomain(() => listSamples(), []);
  const found = seal.trim() ? sampleBySeal(seal) : null;
  return (
    <Gate res={res} what="Samples">
      {(rows) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Sample custody & lab receipt" sub="Scan the seal QR (or type it). A broken seal or mismatch rejects the sample and alerts the Quality Manager. Received samples go to LIMS." />
          <div className="crm-card">
            <div className="crm-row" style={{ alignItems: "flex-end" }}>
              <label className="crm-field" style={{ flex: 1 }}>
                Seal number
                <input className="crm-input" autoFocus value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="ES-SEAL-…" />
              </label>
              <label className="crm-field">
                Condition
                <select className="crm-select" value={cond} onChange={(e) => setCond(e.target.value as typeof cond)}>
                  <option value="ok">Seal intact</option>
                  <option value="seal_broken">Seal broken</option>
                  <option value="damaged">Damaged</option>
                  <option value="mismatch">Doesn't match the label</option>
                </select>
              </label>
              <label className="crm-field" style={{ flex: 1 }}>
                Note
                <input className="crm-input" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button type="button" className="crm-btn crm-btn--pri" disabled={!seal.trim()} onClick={() => void run(() => receiveSample(seal, cond, actor, note), show, cond === "ok" ? "Received." : "Rejected — Quality Manager alerted.").then((ok) => ok && (setSeal(""), setNote("")))}>
                Receive
              </button>
            </div>
            {seal.trim() ? <p className="crm-small">{found ? `${found.product} (${found.brand ?? ""}) collected by ${found.collected_by} on ${fmtDate(found.collected_at)} — now ${found.state}` : "No sample with this seal — check the label."}</p> : null}
          </div>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Seal</th>
                <th>Product</th>
                <th>For</th>
                <th>Holder</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="crm-mono">{s.seal}</td>
                  <td>{s.product}</td>
                  <td className="crm-small">{s.parent?.label}</td>
                  <td>{s.holder}</td>
                  <td>{SAMPLE_STATES.find((x) => x.id === s.state)?.label}</td>
                  <td className="num">
                    {s.state === "Received" ? (
                      <button type="button" className="crm-btn crm-btn--sm" onClick={() => void run(() => sendSampleToLab(s.id, actor), show, "Sent to LIMS.")}>
                        Send to LIMS
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

