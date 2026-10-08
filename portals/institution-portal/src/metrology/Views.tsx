/**
 * Metrology & LIMS tabs (gap 07): Overview · Requests · Receipt · Jobs · Review · Customer items ·
 * Lab equipment · Tests (LIMS) · Capacity · Settings, plus the LIMS test record page.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  actOnTest,
  capacity,
  eligibleAnalysts,
  equipmentProblem,
  getMetSettings,
  getTest,
  JOB_DEF,
  jobOot,
  listAllInstruments,
  listEquipment,
  listJobs,
  listMethods,
  listTests,
  metrologyOverview,
  recordCheck,
  recordEquipmentCalibration,
  resetMetrologyDemo,
  saveMetSettings,
  saveTestResults,
  setEquipmentStatus,
  TEST_DEF,
  testActions,
  type CalJob,
  type LabEquipment,
  type MetrologySettings,
  type TestResult,
} from "@eswasaone/shared-ui/metrology";
import { listSamples, receiveSample, sampleBySeal, sendSampleToLab } from "@eswasaone/shared-ui/field";
import { Facts, HistoryTimeline, IndependencePanel, ModuleSettings, RailCard, RecordPage, fmtDate } from "@eswasaone/shared-ui/record";
import { ReasonDialog, dutyList, stateDef } from "@eswasaone/shared-ui/workflow";
import { Acts, downloadCsv, Empty, Gate, PageHead, run, Tile, useDomain, useStaffActor, useToast, WfPill } from "../domain/ui";
import { ReceiveDialog } from "./JobRecord";

const jobLink = (id: string) => `/metrology/jobs/${id}`;

function JobTable({ jobs, empty = "Nothing here." }: { jobs: CalJob[]; empty?: string }) {
  if (!jobs.length) return <Empty title={empty} />;
  return (
    <table className="crm-table">
      <thead>
        <tr>
          <th>Job</th>
          <th>Customer</th>
          <th>Items</th>
          <th>State</th>
          <th>Metrologist</th>
          <th>Due</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td>
              <Link className="crm-link crm-mono" to={jobLink(j.id)}>
                {j.id}
              </Link>
              <span className="crm-small">
                {j.discipline} · {j.location === "onsite" ? "on site" : "lab"}
              </span>
            </td>
            <td>{j.customer}</td>
            <td className="crm-small">{j.items.map((i) => i.description).join(", ")}</td>
            <td>
              <WfPill def={JOB_DEF} state={j.state} />
              {jobOot(j) ? <span className="crm-pill crm-pill--red">OOT</span> : null}
            </td>
            <td>{j.metrologist ?? "—"}</td>
            <td>
              {fmtDate(j.due)}
              {j.due && new Date(j.due) < new Date() && !["Certified", "Dispatched", "Cancelled"].includes(j.state) ? <span className="crm-pill crm-pill--red">Late</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MetOverview() {
  const res = useDomain(() => ({ o: metrologyOverview(), jobs: listJobs() }), []);
  return (
    <Gate res={res} what="Metrology">
      {({ o, jobs }) => (
        <div className="crm-stack">
          <PageHead title="Metrology & LIMS" sub="Calibration from request to dispatch, reference standards and product testing for certification samples." />
          <div className="crm-kpis crm-kpis--6">
            <Tile label="Open jobs" value={o.open} to="/metrology/jobs" />
            <Tile label="Turnaround (days)" value={o.turnaround} sub={`SLA ${o.sla} days (to confirm)`} tone={o.turnaround > o.sla ? "red" : "green"} />
            <Tile label="Out-of-tolerance rate" value={`${o.ootRate}%`} tone={o.ootRate > 20 ? "amber" : undefined} />
            <Tile label="To review" value={o.byState["Pending Review"] ?? 0} tone="amber" to="/metrology/review" />
            <Tile label="Equipment due ≤30d" value={o.equipmentDue} sub={`${o.equipmentBlocked} blocked`} tone={o.equipmentBlocked ? "red" : undefined} to="/metrology/equipment" />
            <Tile label="LIMS tests open" value={o.testsOpen} to="/metrology/tests" />
          </div>
          <div className="crm-card">
            <div className="crm-card__h">
              <h3>Jobs by state</h3>
            </div>
            <div className="crm-row" style={{ flexWrap: "wrap" }}>
              {JOB_DEF.states.map((s) => (
                <span key={s.id} className={`crm-pill crm-pill--${s.tone}`}>
                  {s.label}: {o.byState[s.id] ?? 0}
                </span>
              ))}
            </div>
          </div>
          <JobTable jobs={jobs.filter((j) => !["Dispatched", "Cancelled"].includes(j.state)).slice(0, 8)} />
        </div>
      )}
    </Gate>
  );
}

export function MetRequests() {
  const res = useDomain(() => listJobs(), []);
  return (
    <Gate res={res} what="Requests">
      {(jobs) => (
        <div className="crm-stack">
          <PageHead title="Requests & quotes" sub="Customer requests from the Service portal (R-M1). Open a request to quote it; customers accept online." />
          <h4 style={{ margin: 0 }}>To quote</h4>
          <JobTable jobs={jobs.filter((j) => j.state === "Requested")} empty="No new requests." />
          <h4 style={{ margin: 0 }}>Quoted — waiting for the customer</h4>
          <JobTable jobs={jobs.filter((j) => j.state === "Quoted")} empty="No open quotes." />
          <h4 style={{ margin: 0 }}>Accepted — waiting for items / visit</h4>
          <JobTable jobs={jobs.filter((j) => j.state === "Accepted")} empty="None." />
        </div>
      )}
    </Gate>
  );
}

export function MetReceipt() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [rec, setRec] = useState<CalJob | null>(null);
  const [seal, setSeal] = useState("");
  const [cond, setCond] = useState<"ok" | "damaged" | "seal_broken" | "mismatch">("ok");
  const res = useDomain(() => ({ jobs: listJobs({ state: "Accepted" }).filter((j) => j.location === "lab"), samples: listSamples().filter((s) => ["In Transit", "Received", "Collected"].includes(s.state)) }), []);
  return (
    <Gate res={res} what="Receipt">
      {({ jobs, samples }) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Receipt desk" sub="Customer instruments arriving for calibration, and sealed samples arriving from the field (chain of custody)." />
          <div className="crm-grid crm-grid--2">
            <div className="crm-card">
              <div className="crm-card__h">
                <h3>Instruments expected ({jobs.length})</h3>
              </div>
              {jobs.map((j) => (
                <div key={j.id} className="crm-row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ flex: 1 }}>
                    <Link className="crm-link" to={jobLink(j.id)}>
                      {j.id}
                    </Link>{" "}
                    {j.customer}
                    <span className="crm-small" style={{ display: "block" }}>
                      {j.items.map((i) => `${i.description} SN ${i.serial}`).join("; ")}
                    </span>
                  </span>
                  <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setRec(j)}>
                    Log receipt
                  </button>
                </div>
              ))}
              {!jobs.length ? <p className="crm-muted">Nothing expected.</p> : null}
            </div>
            <div className="crm-card">
              <div className="crm-card__h">
                <h3>Sample receipt (scan seal)</h3>
              </div>
              <div className="crm-row">
                <input className="crm-input" placeholder="Scan or type seal number" value={seal} onChange={(e) => setSeal(e.target.value)} />
                <select className="crm-select" style={{ width: "auto" }} value={cond} onChange={(e) => setCond(e.target.value as typeof cond)}>
                  <option value="ok">Seal intact</option>
                  <option value="seal_broken">Seal broken</option>
                  <option value="damaged">Damaged</option>
                  <option value="mismatch">Doesn't match label</option>
                </select>
                <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" disabled={!seal.trim()} onClick={() => void run(() => receiveSample(seal, cond, actor), show, cond === "ok" ? "Received — seal intact." : "Rejected at receipt — Quality Manager alerted.").then((ok) => ok && setSeal(""))}>
                  Receive
                </button>
              </div>
              {seal && sampleBySeal(seal) ? <p className="crm-small">Found: {sampleBySeal(seal)!.product} from {sampleBySeal(seal)!.collected_by}</p> : null}
              <table className="crm-table" style={{ marginTop: 10 }}>
                <tbody>
                  {samples.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <b className="crm-mono">{s.seal}</b>
                        <span className="crm-small">
                          {s.product} · {s.parent?.label}
                        </span>
                      </td>
                      <td>{s.state}</td>
                      <td className="num">
                        {s.state === "Received" ? (
                          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void run(() => sendSampleToLab(s.id, actor), show, "Test request created in LIMS.")}>
                            Send to LIMS
                          </button>
                        ) : s.state === "In Transit" || s.state === "Collected" ? (
                          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setSeal(s.seal)}>
                            Use seal
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {rec ? <ReceiveDialog j={rec} actor={actor} onClose={() => setRec(null)} show={show} /> : null}
        </div>
      )}
    </Gate>
  );
}

export function MetJobs() {
  const [state, setState] = useState("");
  const [discipline, setDiscipline] = useState("");
  const res = useDomain(() => listJobs({ state, discipline }), [state, discipline]);
  return (
    <Gate res={res} what="Jobs">
      {(jobs) => (
        <div className="crm-stack">
          <PageHead title="Calibration jobs" actions={<button type="button" className="crm-btn crm-btn--sm" onClick={() => downloadCsv("calibration-jobs.csv", jobs.map((j) => ({ id: j.id, customer: j.customer, state: j.state, discipline: j.discipline, metrologist: j.metrologist ?? "", certificate: j.certificate?.id ?? "" })))}><Icon name="i-download" /> Export</button>} />
          <div className="crm-toolbar">
            <select className="crm-select" style={{ width: "auto" }} value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
              <option value="">All states</option>
              {JOB_DEF.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select className="crm-select" style={{ width: "auto" }} value={discipline} onChange={(e) => setDiscipline(e.target.value)} aria-label="Discipline">
              <option value="">All disciplines</option>
              {["Mass", "Temperature", "Pressure", "Volume", "Length", "Electrical"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <JobTable jobs={jobs} />
        </div>
      )}
    </Gate>
  );
}

export function MetReview() {
  const actor = useStaffActor();
  const res = useDomain(() => listJobs().filter((j) => ["Pending Review", "Reviewed"].includes(j.state)), []);
  return (
    <Gate res={res} what="Review queue">
      {(jobs) => (
        <div className="crm-stack">
          <PageHead title="Technical review" sub="A reviewer who didn't record the results approves the worksheet; then the certificate is issued (R-M3)." />
          {jobs.map((j) => {
            const mine = (j.duties?.Metrologist ?? []).includes(actor.name);
            return (
              <div key={j.id} className="crm-card">
                <div className="crm-row">
                  <Link className="crm-link" to={jobLink(j.id)} style={{ flex: 1 }}>
                    <b>{j.id}</b> {j.customer} — {j.items.map((i) => i.description).join(", ")}
                  </Link>
                  <WfPill def={JOB_DEF} state={j.state} />
                  {mine ? <span className="crm-pill crm-pill--red">You recorded these results</span> : null}
                  {jobOot(j) ? <span className="crm-pill crm-pill--red">OOT</span> : null}
                </div>
                <p className="crm-small">
                  Metrologist {j.metrologist} · {j.worksheet.points.length} points · refs {j.worksheet.refs.join(", ")}
                </p>
              </div>
            );
          })}
          {!jobs.length ? <Empty title="Nothing to review" /> : null}
        </div>
      )}
    </Gate>
  );
}

export function MetItems() {
  const res = useDomain(() => listAllInstruments(), []);
  return (
    <Gate res={res} what="Customer items">
      {(rows) => (
        <div className="crm-stack">
          <PageHead title="Customer instrument register" sub="Every customer's instruments with last and next calibration. Customers see their own in /account/instruments." />
          <table className="crm-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Owner</th>
                <th>Last</th>
                <th>Next due</th>
                <th>Last result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <b>{i.description}</b>
                    <span className="crm-small">
                      {i.id} · SN {i.serial} · {i.range}
                    </span>
                  </td>
                  <td>{i.client}</td>
                  <td>{i.last_job ? <Link className="crm-link" to={jobLink(i.last_job)}>{fmtDate(i.last_cal)}</Link> : fmtDate(i.last_cal)}</td>
                  <td>
                    {fmtDate(i.next_due)}
                    {i.next_due && new Date(i.next_due) < new Date() ? <span className="crm-pill crm-pill--red">Overdue</span> : null}
                  </td>
                  <td>{i.last_result ? <span className={`crm-pill crm-pill--${i.last_result === "in_tolerance" ? "green" : "red"}`}>{i.last_result.replace(/_/g, " ")}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

export function MetEquipment() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [dlg, setDlg] = useState<{ e: LabEquipment; mode: "check" | "status" | "recal" } | null>(null);
  const res = useDomain(() => listEquipment(), []);
  return (
    <Gate res={res} what="Lab equipment">
      {(rows) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Lab equipment & reference standards" sub="Traceability chain, due dates and intermediate checks. Overdue or out-of-service items are blocked in worksheets (M9)." />
          <table className="crm-table">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Traceability</th>
                <th>Due</th>
                <th>Status</th>
                <th>Last check</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const p = equipmentProblem(e);
                return (
                  <tr key={e.id}>
                    <td>
                      <b>
                        {e.id} {e.name}
                      </b>
                      <span className="crm-small">
                        {e.kind} · {e.discipline} · {e.range} · SN {e.serial}
                      </span>
                    </td>
                    <td className="crm-small">{e.traceability}</td>
                    <td>{fmtDate(e.cal_due)}</td>
                    <td>{p ? <span className="crm-pill crm-pill--red" title={p}>Blocked</span> : <span className="crm-pill crm-pill--green">In service</span>}</td>
                    <td className="crm-small">{e.checks[0] ? `${fmtDate(e.checks[0].at)} ${e.checks[0].ok ? "✓" : "✕"} ${e.checks[0].note ?? ""}` : "—"}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="crm-link" onClick={() => setDlg({ e, mode: "check" })}>
                        Check
                      </button>{" "}
                      ·{" "}
                      <button type="button" className="crm-link" onClick={() => setDlg({ e, mode: "recal" })}>
                        Recalibrated
                      </button>{" "}
                      ·{" "}
                      <button type="button" className="crm-link" onClick={() => setDlg({ e, mode: "status" })}>
                        {e.status === "in_service" ? "Out of service" : "Back in service"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {dlg ? (
            <ReasonDialog
              title={dlg.mode === "check" ? `Intermediate check — ${dlg.e.id}` : dlg.mode === "recal" ? `Record external calibration — ${dlg.e.id}` : `${dlg.e.status === "in_service" ? "Take out of service" : "Return to service"} — ${dlg.e.id}`}
              requires={dlg.mode === "status" && dlg.e.status === "in_service" ? "reason" : "note"}
              fields={dlg.mode === "check" ? [{ key: "ok", label: "Result", type: "select", required: true, options: [{ value: "ok", label: "Within limits" }, { value: "fail", label: "Failed" }] }] : dlg.mode === "recal" ? [{ key: "cert", label: "Certificate number (NMI / lab)", required: true }, { key: "days", label: "Next due in (days)", type: "number", required: true }] : undefined}
              onClose={() => setDlg(null)}
              onSubmit={async (v) => {
                const note = v.note ?? v.reason ?? "";
                if (dlg.mode === "check") recordCheck(dlg.e.id, v.payload?.ok === "ok", note, actor);
                else if (dlg.mode === "recal") recordEquipmentCalibration(dlg.e.id, v.payload?.cert ?? "", Number(v.payload?.days) || 365, actor);
                else setEquipmentStatus(dlg.e.id, dlg.e.status === "in_service" ? "out_of_service" : "in_service", note, actor);
                setDlg(null);
                show("Saved.");
              }}
            />
          ) : null}
        </div>
      )}
    </Gate>
  );
}

export function MetTests() {
  const res = useDomain(() => listTests(), []);
  return (
    <Gate res={res} what="Tests">
      {(tests) => (
        <div className="crm-stack">
          <PageHead title="LIMS test requests" sub="Certification and market samples → analyst → Technical Manager approval (≠ analyst) → result to the parent record (R-V4)." />
          <table className="crm-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Sample</th>
                <th>For</th>
                <th>Analyst</th>
                <th>State</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link className="crm-link crm-mono" to={`/metrology/tests/${t.id}`}>
                      {t.id}
                    </Link>
                    <span className="crm-small">{t.tests}</span>
                  </td>
                  <td>
                    {t.seal}
                    <span className="crm-small">{t.product}</span>
                  </td>
                  <td className="crm-small">{t.parent?.label}</td>
                  <td>{t.analyst ?? "—"}</td>
                  <td>
                    <WfPill def={TEST_DEF} state={t.state} />
                    {t.conclusion ? <span className={`crm-pill crm-pill--${t.conclusion === "pass" ? "green" : "red"}`}>{t.conclusion}</span> : null}
                  </td>
                  <td>{fmtDate(t.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

export function TestRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => getTest(id), [id]);
  const [assign, setAssign] = useState(false);
  return (
    <Gate res={res} what="Test request">
      {(t) => (
        <>
          {toast}
          <RecordPage
            back={{ to: "/metrology/tests", label: "Tests" }}
            reference={t.id}
            type="LIMS test request"
            title={t.product}
            state={stateDef(TEST_DEF, t.state)?.label}
            tone={stateDef(TEST_DEF, t.state)?.tone}
            actions={
              <>
                {t.state === "Requested" ? (
                  <button type="button" className="crm-btn crm-btn--pri" onClick={() => setAssign(true)}>
                    Assign analyst
                  </button>
                ) : null}
                <Acts actions={testActions(t.id, actor)} hide={["assign"]} state={t.state} toast={show} act={(a, input) => actOnTest(t.id, a.action, actor, input)} />
              </>
            }
            summary={<Facts rows={[{ label: "Sample", value: `${t.seal} (${t.sample_id})` }, { label: "Tests", value: t.tests }, { label: "Clauses", value: t.clauses }, { label: "For", value: t.parent ? <Link className="crm-link" to={t.parent.doctype === "Case" ? `/crm/cases/${t.parent.name}` : `/certification/applications/${t.parent.name}`}>{t.parent.label}</Link> : "—" }, { label: "Due", value: fmtDate(t.due) }]} />}
            tabs={[
              { id: "results", label: "Results", render: () => <ResultsEditor key={t.seq} t={t} actor={actor} show={show} /> },
              { id: "history", label: "History", render: () => <HistoryTimeline events={t.history} /> },
            ]}
            rail={
              <>
                <IndependencePanel duties={dutyList(t)} checks={[{ rule: "Approver ≠ analyst", ok: !(t.duties?.Analyst ?? []).includes(actor.name) }]} />
                <RailCard title="Rule">
                  <p className="crm-small">A failed result triggers R-V4: a case is opened, the certification is put forward for suspension and the risk register is notified.</p>
                </RailCard>
              </>
            }
          />
          {assign ? (
            <ReasonDialog
              title="Assign analyst"
              fields={[{ key: "analyst", label: "Analyst", type: "select", required: true, options: eligibleAnalysts().filter((a) => a.ok).map((a) => ({ value: a.name, label: a.name })) }]}
              onClose={() => setAssign(false)}
              onSubmit={async (v) => {
                await actOnTest(t.id, "assign", actor, { expected_state: t.state, payload: v.payload });
                setAssign(false);
                show("Assigned.");
              }}
            />
          ) : null}
        </>
      )}
    </Gate>
  );
}

function ResultsEditor({ t, actor, show }: { t: NonNullable<ReturnType<typeof getTest>>; actor: ReturnType<typeof useStaffActor>; show: (m: string) => void }) {
  const editable = t.state === "In Test";
  const [rows, setRows] = useState<TestResult[]>(t.results.length ? t.results : [{ param: "", spec: "", value: "", unit: "", pass: true }]);
  const [conclusion, setConclusion] = useState<"pass" | "fail" | "">(t.conclusion ?? "");
  const [remarks, setRemarks] = useState(t.remarks ?? "");
  return (
    <div className="crm-stack">
      <table className="crm-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Specification</th>
            <th>Result</th>
            <th>Unit</th>
            <th>Pass</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {(["param", "spec", "value", "unit"] as const).map((k) => (
                <td key={k}>
                  <input className="crm-input" disabled={!editable} value={r[k] ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                </td>
              ))}
              <td>
                <input type="checkbox" disabled={!editable} checked={r.pass} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pass: e.target.checked } : x)))} aria-label="Pass" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <>
          <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" style={{ alignSelf: "flex-start" }} onClick={() => setRows([...rows, { param: "", spec: "", value: "", unit: "", pass: true }])}>
            + Parameter
          </button>
          <div className="crm-row">
            <label className="crm-field">
              Conclusion
              <select className="crm-select" value={conclusion} onChange={(e) => setConclusion(e.target.value as typeof conclusion)}>
                <option value="">Choose…</option>
                <option value="pass">Conforms (pass)</option>
                <option value="fail">Does not conform (fail)</option>
              </select>
            </label>
            <label className="crm-field" style={{ flex: 1 }}>
              Remarks
              <input className="crm-input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </label>
          </div>
          <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => void run(() => saveTestResults(t.id, rows.filter((r) => r.param.trim()), conclusion || undefined, remarks, actor), show, "Results saved — submit them for approval.")}>
            Save results
          </button>
        </>
      ) : (
        <p>
          Conclusion: <b>{t.conclusion ?? "—"}</b> {t.remarks ? `— ${t.remarks}` : ""}
        </p>
      )}
    </div>
  );
}

export function MetCapacity() {
  const res = useDomain(() => capacity(), []);
  return (
    <Gate res={res} what="Capacity">
      {(rows) => (
        <div className="crm-stack">
          <PageHead title="Lab capacity" sub="Open jobs per metrologist and discipline, with late jobs against the lab turnaround SLA." />
          <div className="crm-grid crm-grid--3">
            {rows.map((r) => (
              <div key={r.name} className="crm-card">
                <div className="crm-card__h">
                  <h3>{r.name}</h3>
                  {r.late ? <span className="crm-pill crm-pill--red">{r.late} late</span> : null}
                </div>
                <p className="crm-small">{r.disciplines.join(", ")}</p>
                {r.jobs.map((j) => (
                  <p key={j.id} style={{ margin: "4px 0" }}>
                    <Link className="crm-link" to={jobLink(j.id)}>
                      {j.id}
                    </Link>{" "}
                    <span className="crm-small">
                      {j.discipline} · {j.state} · due {fmtDate(j.due)}
                    </span>
                  </p>
                ))}
                {!r.jobs.length ? <p className="crm-muted">Free</p> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </Gate>
  );
}

export function MetSettings() {
  const res = useDomain(() => ({ s: getMetSettings(), methods: listMethods() }), []);
  return (
    <Gate res={res} what="Settings">
      {({ s, methods }) => (
        <div className="crm-stack">
          <ModuleSettings<Record<string, string | number>>
            title="Metrology settings"
            description="Turnaround, reminders and the certificate statement (confirmation pack F1–F4, G15–G16)."
            values={{ lab_turnaround_days: s.lab_turnaround_days, quote_days: s.quote_days, reminder_days: s.reminder_days, default_interval_months: s.default_interval_months, oot_notify: s.oot_notify, certificate_statement: s.certificate_statement }}
            fields={[
              { key: "lab_turnaround_days", label: "Lab turnaround SLA (days)", type: "number", toConfirm: true },
              { key: "quote_days", label: "Quote within (working days)", type: "number", toConfirm: true },
              { key: "reminder_days", label: "Recalibration reminder (days before due)", type: "number" },
              { key: "default_interval_months", label: "Default recalibration interval (months)", type: "number" },
              { key: "oot_notify", label: "Out-of-tolerance notice (immediate | with_certificate)", toConfirm: true },
              { key: "certificate_statement", label: "Certificate uncertainty statement" },
            ]}
            onSave={async (v) => void (await saveMetSettings(v as Partial<MetrologySettings>))}
            onReset={resetMetrologyDemo}
          />
          <div className="crm-card">
            <div className="crm-card__h">
              <h3>Methods & scope of accreditation (CMC)</h3>
            </div>
            <table className="crm-table">
              <tbody>
                {methods.map((m) => (
                  <tr key={m.id}>
                    <td className="crm-mono">{m.code}</td>
                    <td>{m.title}</td>
                    <td>{m.discipline}</td>
                    <td>{m.range}</td>
                    <td className="crm-small">CMC {m.cmc}</td>
                    <td>{m.accredited ? <span className="crm-pill crm-pill--green">SADCAS</span> : <span className="crm-pill crm-pill--slate">Not accredited</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Gate>
  );
}
