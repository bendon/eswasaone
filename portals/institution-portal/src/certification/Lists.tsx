/**
 * Certification module tabs other than the pipeline and the application record (gap 05):
 * Quotes · Visits · Findings · Decisions · Certificates (register) · Surveillance · Appeals & complaints ·
 * Marks · Auditors (competence matrix) · Settings, plus the certificate record page.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon, Select } from "@eswasaone/shared-ui";
import {
  actOnCertificate,
  actOnMark,
  APP_DEF,
  certActions,
  getCertificate,
  getCertSettings,
  listAllFindings,
  listApplications,
  listCertificates,
  listCompetence,
  listMarks,
  markActions,
  MARK_DEF,
  ncOverdue,
  planSurveillance,
  reduceScope,
  REG_DEF,
  resetCertificationDemo,
  saveCertSettings,
  saveCompetence,
  surveillancePlan,
  clientCertHealth,
  type CertSettings,
  type Competence,
} from "@eswasaone/shared-ui/certification";
import { listCases, useCrm, type Case } from "@eswasaone/shared-ui/crm";
import { listVisits, overdueCheckIn, visitDef, VISIT_TYPES } from "@eswasaone/shared-ui/field";
import { DocumentsPanel, Facts, HistoryTimeline, IndependencePanel, ModuleSettings, RailCard, RecordPage, fmtDate } from "@eswasaone/shared-ui/record";
import { ReasonDialog, dutyList, stateDef } from "@eswasaone/shared-ui/workflow";
import { Acts, Empty, Gate, PageHead, Tile, useDomain, useStaffActor, useToast, WfPill } from "../domain/ui";
import { TeamPicker } from "../fieldops/TeamPicker";

const appLink = (id: string) => `/certification/applications/${id}`;

/* ---------------- quotes ---------------- */

export function QuotesView() {
  const res = useDomain(() => listApplications(), []);
  return (
    <Gate res={res} what="Quotes">
      {(apps) => {
        const toQuote = apps.filter((a) => a.state === "Document Review");
        const out = apps.filter((a) => a.state === "Quoted");
        const accepted = apps.filter((a) => a.quote?.accepted_at);
        return (
          <div className="crm-stack">
            <PageHead title="Quotes & agreements" sub="Build the quote from the application record (fee calculator). The customer accepts the agreement and pays the deposit online." />
            <div className="crm-kpis">
              <Tile label="Ready to quote" value={toQuote.length} sub="In document review" />
              <Tile label="With customers" value={out.length} tone="amber" sub="Clock paused" />
              <Tile label="Accepted" value={accepted.length} tone="green" />
              <Tile label="Expired" value={out.filter((a) => a.quote && new Date(a.quote.valid_until) < new Date()).length} tone="red" />
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>State</th>
                  <th>Quote</th>
                  <th>Valid until</th>
                  <th>Agreement / deposit</th>
                </tr>
              </thead>
              <tbody>
                {[...toQuote, ...out, ...accepted.filter((a) => a.state !== "Quoted")].map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link className="crm-link" to={appLink(a.id)}>
                        {a.org}
                      </Link>
                      <span className="crm-small">
                        {a.id} · {a.standard}
                      </span>
                    </td>
                    <td>
                      <WfPill def={APP_DEF} state={a.state} />
                    </td>
                    <td>{a.quote ? `${a.quote.id} · E ${(a.quote.lines.reduce((n, l) => n + l.qty * l.unit_price, 0) * 1.15).toLocaleString()}` : "To build"}</td>
                    <td>{fmtDate(a.quote?.valid_until)}</td>
                    <td className="crm-small">{a.quote?.agreement ? `Signed ${fmtDate(a.quote.agreement.at)} by ${a.quote.agreement.name}` : a.quote ? "Waiting" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    </Gate>
  );
}

/* ---------------- visits (audits) ---------------- */

export function VisitsView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [pick, setPick] = useState<string | null>(null);
  const res = useDomain(() => listVisits({ module: "Certification" }), []);
  return (
    <Gate res={res} what="Audit visits">
      {(visits) => {
        const v = visits.find((x) => x.id === pick);
        return (
          <div className="crm-stack">
            {toast}
            <PageHead title="Audits & inspections" sub="Field visits for certification. Reports are reviewed by someone other than the lead (R-V1)." actions={<Link className="crm-btn crm-btn--sm" to="/field">Field planning board</Link>} />
            <div className="crm-kpis">
              <Tile label="Need a team" value={visits.filter((x) => x.state === "Planned").length} tone="amber" />
              <Tile label="Awaiting customer date" value={visits.filter((x) => x.state === "Accepted").length} />
              <Tile label="Reports to review" value={visits.filter((x) => x.state === "Submitted").length} tone="amber" />
              <Tile label="Overdue check-in" value={visits.filter(overdueCheckIn).length} tone={visits.some(overdueCheckIn) ? "red" : "green"} sub="R-V2" />
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Date</th>
                  <th>Team</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visits.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <Link className="crm-link" to={`/field/visits/${x.id}`}>
                        {x.title}
                      </Link>
                      <span className="crm-small">
                        {x.id} · {VISIT_TYPES[x.type].label} · {x.parent?.label}
                      </span>
                    </td>
                    <td>{fmtDate(x.planned_date)}</td>
                    <td className="crm-small">{x.lead ? [`${x.lead} (lead)`, ...x.team].join(", ") : "—"}</td>
                    <td>
                      <WfPill def={visitDef(x.type)} state={x.state} />
                      {overdueCheckIn(x) ? <span className="crm-pill crm-pill--red">No check-in</span> : null}
                    </td>
                    <td className="num">
                      {x.state === "Planned" ? (
                        <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setPick(x.id)}>
                          Assign team
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v ? <TeamPicker visit={v} actor={actor} onClose={() => setPick(null)} onDone={(m) => (setPick(null), show(m))} /> : null}
          </div>
        );
      }}
    </Gate>
  );
}

/* ---------------- findings ---------------- */

export function FindingsView() {
  const [state, setState] = useState("open");
  const res = useDomain(() => listAllFindings(), []);
  return (
    <Gate res={res} what="Findings">
      {(rows) => {
        const shown = rows.filter(({ nc }) => (state === "open" ? nc.state !== "Verified closed" : state === "all" ? true : nc.state === state));
        return (
          <div className="crm-stack">
            <PageHead title="Findings & corrective actions" sub="Raised → Response submitted → Accepted → Verified closed. The customer has 30 days; overdue responses are flagged." />
            <div className="crm-kpis">
              <Tile label="Waiting for customers" value={rows.filter(({ nc }) => nc.state === "Raised").length} />
              <Tile label="Responses to review" value={rows.filter(({ nc }) => nc.state === "Response submitted").length} tone="amber" />
              <Tile label="Majors to verify" value={rows.filter(({ nc }) => nc.state === "Accepted").length} tone="amber" />
              <Tile label="Overdue" value={rows.filter(({ nc }) => ncOverdue(nc)).length} tone="red" />
            </div>
            <div className="crm-seg">
              {["open", "Raised", "Response submitted", "Accepted", "Verified closed", "all"].map((s) => (
                <button key={s} type="button" className={state === s ? "on" : ""} onClick={() => setState(s)}>
                  {s === "open" ? "Open" : s === "all" ? "All" : s}
                </button>
              ))}
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Finding</th>
                  <th>Client</th>
                  <th>State</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ app, nc }) => (
                  <tr key={`${app.id}-${nc.id}`}>
                    <td>
                      <b>
                        {nc.clause}
                      </b>{" "}
                      <span className={`crm-pill crm-pill--${nc.severity === "major" ? "red" : "amber"}`}>{nc.severity}</span>
                      <span className="crm-small">{nc.statement}</span>
                    </td>
                    <td>
                      <Link className="crm-link" to={appLink(app.id)}>
                        {app.org}
                      </Link>
                      <span className="crm-small">{app.id}</span>
                    </td>
                    <td>
                      {nc.state}
                      {ncOverdue(nc) ? <span className="crm-pill crm-pill--red">Overdue</span> : null}
                    </td>
                    <td>{fmtDate(nc.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length ? <Empty title="Nothing here" /> : null}
          </div>
        );
      }}
    </Gate>
  );
}

/* ---------------- decisions (technical review + decision queues) ---------------- */

export function DecisionsView() {
  const actor = useStaffActor();
  const res = useDomain(() => listApplications(), []);
  return (
    <Gate res={res} what="Decisions">
      {(apps) => {
        const tr = apps.filter((a) => a.state === "Technical Review");
        const dec = apps.filter((a) => a.state === "Decision");
        const recent = apps.filter((a) => a.decision).sort((x, y) => (y.decision!.at > x.decision!.at ? 1 : -1)).slice(0, 8);
        const conflict = (a: (typeof apps)[number]) => [...(a.duties?.["Audit team"] ?? []), ...(a.duties?.["Technical reviewer"] ?? [])].includes(actor.name);
        return (
          <div className="crm-stack">
            <PageHead title="Technical review & decisions" sub="Reviewer ≠ audit team; decision-maker ≠ audit team ≠ reviewer (§5.6). Product schemes go to the CAC." actions={<Link className="crm-btn crm-btn--sm" to="/board/cac">CAC session</Link>} />
            <div className="crm-grid crm-grid--2">
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Technical review ({tr.length})</h3>
                </div>
                {tr.map((a) => (
                  <p key={a.id} style={{ margin: "6px 0" }}>
                    <Link className="crm-link" to={appLink(a.id)}>
                      {a.org}
                    </Link>{" "}
                    <span className="crm-small">
                      {a.standard} · team {(a.duties?.["Audit team"] ?? []).join(", ") || "—"}
                    </span>
                    {(a.duties?.["Audit team"] ?? []).includes(actor.name) ? <span className="crm-pill crm-pill--red">You audited</span> : null}
                  </p>
                ))}
                {!tr.length ? <p className="crm-muted">Nothing waiting.</p> : null}
              </div>
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Decisions ({dec.length})</h3>
                </div>
                {dec.map((a) => (
                  <p key={a.id} style={{ margin: "6px 0" }}>
                    <Link className="crm-link" to={appLink(a.id)}>
                      {a.org}
                    </Link>{" "}
                    <span className="crm-small">
                      recommend {a.technical_review?.recommendation} · {getCertSettings().schemes.find((s) => s.code === a.scheme)?.cac ? "CAC" : "Cert. Manager"}
                    </span>
                    {conflict(a) ? <span className="crm-pill crm-pill--red">Conflict</span> : null}
                  </p>
                ))}
                {!dec.length ? <p className="crm-muted">Nothing waiting.</p> : null}
              </div>
            </div>
            <div className="crm-card">
              <div className="crm-card__h">
                <h3>Recent decisions</h3>
              </div>
              <table className="crm-table">
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link className="crm-link" to={appLink(a.id)}>
                          {a.org}
                        </Link>
                      </td>
                      <td>{a.decision!.outcome.replace("_", " ")}</td>
                      <td>{a.decision!.by}</td>
                      <td>{fmtDate(a.decision!.at)}</td>
                      <td>{a.decision!.outcome === "refuse" ? <Link className="crm-link" to={`/print/refusal/${a.id}`} target="_blank">Letter</Link> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }}
    </Gate>
  );
}

/* ---------------- certificates / register ---------------- */

export function CertificatesView() {
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const res = useDomain(() => listCertificates({ state, q }), [state, q]);
  return (
    <Gate res={res} what="Certificates">
      {(certs) => (
        <div className="crm-stack">
          <PageHead title="Certification register" sub="Active → Surveillance due (−60 days) → Active; Suspended → Reinstated; Withdrawn; Expired. The public register and verify page read this." />
          <div className="crm-toolbar">
            <input className="crm-input" style={{ maxWidth: 260 }} placeholder="Search holder or number" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="crm-seg">
              {["", ...REG_DEF.states.map((s) => s.id)].map((s) => (
                <button key={s} type="button" className={state === s ? "on" : ""} onClick={() => setState(s)}>
                  {s || "All"}
                </button>
              ))}
            </div>
          </div>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Holder</th>
                <th>Certificate</th>
                <th>State</th>
                <th>Next</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => {
                const next = c.cycle.find((x) => !x.done_at);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link className="crm-link" to={`/certification/certificates/${c.id}`}>
                        {c.org}
                      </Link>
                      <span className="crm-small">{c.scope}</span>
                    </td>
                    <td className="crm-mono">{c.number}</td>
                    <td>
                      <WfPill def={REG_DEF} state={c.state} />
                    </td>
                    <td className="crm-small">{next ? `${next.label} · ${fmtDate(next.due)}` : "—"}</td>
                    <td>{fmtDate(c.expires_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

export function CertificateRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [scope, setScope] = useState(false);
  const res = useDomain(() => getCertificate(id), [id]);
  return (
    <Gate res={res} what="Certificate">
      {({ cert: c, app, visits, marks }) => (
        <>
          {toast}
          <RecordPage
            back={{ to: "/certification/certificates", label: "Register" }}
            reference={c.number}
            type={`${c.standard} certificate`}
            title={c.org}
            state={stateDef(REG_DEF, c.state)?.label}
            tone={stateDef(REG_DEF, c.state)?.tone}
            actions={
              <>
                <Link className="crm-btn" to={`/print/certificate/${c.id}`} target="_blank">
                  <Icon name="i-download" /> PDF
                </Link>
                {["Active", "Surveillance Due"].includes(c.state) ? (
                  <button type="button" className="crm-btn" onClick={() => setScope(true)}>
                    Reduce scope
                  </button>
                ) : null}
                <Acts actions={certActions(c.id, actor)} state={c.state} toast={show} act={(a, input) => actOnCertificate(c.id, a.action, actor, input)} />
              </>
            }
            summary={<Facts rows={[{ label: "Scope", value: c.scope }, { label: "Sites", value: c.sites.join("; ") }, { label: "Issued / expires", value: `${fmtDate(c.issued_at)} → ${fmtDate(c.expires_at)}` }, { label: "Conditions", value: c.conditions }, { label: "Application", value: app ? <Link className="crm-link" to={appLink(app.id)}>{app.id}</Link> : "—" }]} />}
            tabs={[
              {
                id: "cycle",
                label: "Cycle",
                render: () => (
                  <table className="crm-table">
                    <tbody>
                      {c.cycle.map((x) => {
                        const v = visits.find((y) => y.id === x.visit_id);
                        return (
                          <tr key={x.id}>
                            <td>
                              <b>{x.label}</b>
                            </td>
                            <td>{fmtDate(x.due)}</td>
                            <td>{x.done_at ? `Done ${fmtDate(x.done_at)}` : v ? <Link className="crm-link" to={`/field/visits/${v.id}`}>{v.id} · {v.state}</Link> : "Not planned"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ),
              },
              { id: "scope", label: "Scope changes", badge: c.scope_history.length, render: () => (c.scope_history.length ? <ul>{c.scope_history.map((h) => <li key={h.at}>{fmtDate(h.at)} {h.by}: “{h.from}” → “{h.to}” — {h.reason}</li>)}</ul> : <p className="crm-muted">No changes.</p>) },
              { id: "marks", label: "Mark use", badge: marks.length, render: () => (marks.length ? <ul>{marks.map((m) => <li key={m.id}>{m.id} · {m.usage} · {m.state}</li>)}</ul> : <p className="crm-muted">No mark-use requests.</p>) },
              { id: "docs", label: "Documents", render: () => <DocumentsPanel doctype="Certification" name={c.id} by={actor.name} categories={["Certificate", "Scope annex", "Suspension evidence", "Reinstatement evidence", "Other"]} gateCategories={["Certificate"]} /> },
              { id: "history", label: "History", render: () => <HistoryTimeline events={c.history} /> },
            ]}
            rail={
              <>
                <IndependencePanel duties={dutyList(c)} checks={[{ rule: "Reinstate ≠ the person who suspended", ok: !(c.duties?.["Suspended by"] ?? []).includes(actor.name) }]} />
                <RailCard title="Public verify">
                  <p className="crm-small">
                    Token <span className="crm-mono">{c.token}</span>. The register shows <b>{stateDef(REG_DEF, c.state)?.display?.customer}</b>.
                  </p>
                </RailCard>
              </>
            }
          />
          {scope ? (
            <ReasonDialog
              title="Reduce scope"
              consequence="Changes the certificate scope (CER_PR_026). The holder is notified; the public register updates."
              requires="reason"
              onClose={() => setScope(false)}
              onSubmit={async (v) => {
                const n = v.payload?.scope ?? "";
                reduceScope(c.id, n, v.reason ?? "", actor);
                setScope(false);
                show("Scope reduced.");
              }}
              fields={[{ key: "scope", label: "New scope", type: "textarea", required: true }]}
            />
          ) : null}
        </>
      )}
    </Gate>
  );
}

/* ---------------- surveillance planner ---------------- */

export function SurveillanceView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [plan, setPlan] = useState<{ cert: string; item: string; date: string } | null>(null);
  const res = useDomain(() => surveillancePlan(), []);
  return (
    <Gate res={res} what="Surveillance">
      {(rows) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Surveillance & recertification planner" sub="Every certificate's next visit by due window. 'Plan visit' creates a Field visit; the customer confirms the date in their account." />
          <div className="crm-kpis">
            <Tile label="Due in 60 days" value={rows.filter((r) => new Date(r.item.due).getTime() < Date.now() + 60 * 86_400_000).length} tone="amber" />
            <Tile label="Not planned" value={rows.filter((r) => !r.visit).length} />
            <Tile label="Awaiting customer date" value={rows.filter((r) => r.visit?.state === "Accepted").length} />
            <Tile label="Overdue" value={rows.filter((r) => new Date(r.item.due) < new Date()).length} tone="red" />
          </div>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Due</th>
                <th>Visit</th>
                <th>Holder</th>
                <th>Suggested frequency</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cert, item, visit }) => (
                <tr key={`${cert.id}-${item.id}`}>
                  <td>
                    {fmtDate(item.due)}
                    {new Date(item.due) < new Date() ? <span className="crm-pill crm-pill--red">Overdue</span> : null}
                  </td>
                  <td>{item.label}</td>
                  <td>
                    <Link className="crm-link" to={`/certification/certificates/${cert.id}`}>
                      {cert.org}
                    </Link>
                    <span className="crm-small">{cert.number}</span>
                  </td>
                  <td>
                    <FreqHint clientId={cert.client_id ?? ""} org={cert.org} />
                  </td>
                  <td>{visit ? <Link className="crm-link" to={`/field/visits/${visit.id}`}>{visit.id} · {visit.state}</Link> : <WfPill def={REG_DEF} state={cert.state} />}</td>
                  <td className="num">{!visit ? <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setPlan({ cert: cert.id, item: item.id, date: item.due.slice(0, 10) })}>Plan visit</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan ? (
            <ReasonDialog
              title="Plan surveillance visit"
              consequence="Creates a Field visit in Planned; assign the team from the visit or the planning board."
              confirmLabel="Plan visit"
              onClose={() => setPlan(null)}
              onSubmit={async () => {
                planSurveillance(plan.cert, plan.item, plan.date, actor);
                setPlan(null);
                show("Visit planned.");
              }}
            >
              <label className="crm-field">
                Proposed date
                <input className="crm-input" type="date" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} />
              </label>
            </ReasonDialog>
          ) : null}
        </div>
      )}
    </Gate>
  );
}

/* ---------------- appeals & complaints (one case store — gap 04 R1, 05 C4) ---------------- */

export function RegisterView() {
  const cases = useCrm(() => listCases({ includeAppeals: true, state: "all" }), []);
  const res = useDomain(() => listCertificates(), []);
  const related = (c: Case) => c.type === "appeal" || c.type === "mark_misuse" || ["certificate", "application"].includes(c.about?.kind ?? "") || c.team === "Certification";
  return (
    <Gate res={res} what="Register">
      {(certs) => (
        <div className="crm-stack">
          <PageHead title="Register, appeals & complaints" sub="Appeals and certification complaints live in CRM cases (one store). Open a case to act; appeals are handled by the panel there." actions={<Link className="crm-btn crm-btn--sm" to="/crm/cases">All cases</Link>} />
          <div className="crm-kpis">
            {REG_DEF.states.map((s) => (
              <Tile key={s.id} label={s.label} value={certs.filter((c) => c.state === s.id).length} tone={s.id === "Suspended" ? "red" : s.id === "Surveillance Due" ? "amber" : undefined} to="/certification/certificates" />
            ))}
          </div>
          {cases.loading && !cases.data ? <p className="crm-muted">Loading cases…</p> : null}
          <table className="crm-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Type</th>
                <th>About</th>
                <th>State</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {(cases.data ?? []).filter(related).map((c) => (
                <tr key={c.ref}>
                  <td>
                    <Link className="crm-link" to={c.type === "appeal" ? `/crm/cases/${c.ref}` : `/crm/cases/${c.ref}`}>
                      {c.ref}
                    </Link>
                    <span className="crm-small">{c.subject}</span>
                  </td>
                  <td>{c.type.replace("_", " ")}</td>
                  <td className="crm-small">{c.about?.label ?? "—"}</td>
                  <td>{c.state}</td>
                  <td>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

/* ---------------- marks ---------------- */

export function MarksView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => listMarks(), []);
  return (
    <Gate res={res} what="Mark-use requests">
      {(marks) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Use of the mark" sub="Certified clients submit packaging, advertising and web artwork for approval (CER_RU_028)." />
          {marks.map((m) => (
            <div key={m.id} className="crm-card">
              <div className="crm-row">
                <b style={{ flex: 1 }}>
                  {m.org} — {m.usage}
                </b>
                <WfPill def={MARK_DEF} state={m.state} />
              </div>
              <p style={{ margin: "6px 0" }}>{m.description}</p>
              <p className="crm-small">
                Artwork: {m.artwork_url ? <a className="crm-link" href={m.artwork_url} target="_blank" rel="noreferrer">{m.artwork}</a> : m.artwork} · Certificate {m.certificate_id} · submitted {fmtDate(m.submitted_at)}
                {m.comments ? ` · Comments: ${m.comments}` : ""}
              </p>
              <Acts size="sm" actions={markActions(m.id, actor)} state={m.state} toast={show} act={(a, input) => actOnMark(m.id, a.action, actor, input)} />
            </div>
          ))}
          {!marks.length ? <Empty title="No mark-use requests" /> : null}
        </div>
      )}
    </Gate>
  );
}

/* ---------------- auditors (competence matrix) ---------------- */

export function AuditorsView() {
  const [toast, show] = useToast();
  const [edit, setEdit] = useState<Competence | null>(null);
  const res = useDomain(() => listCompetence(), []);
  const schemes = getCertSettings().schemes;
  const soon = (iso?: string) => !iso || new Date(iso).getTime() < Date.now() + 60 * 86_400_000;
  return (
    <Gate res={res} what="Competence">
      {(rows) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Auditor competence matrix" sub="Who is qualified for which scheme and role, until when; impartiality declarations and rotation. The team picker enforces this." />
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Auditor</th>
                  <th>Role</th>
                  {schemes.map((s) => (
                    <th key={s.code} title={s.title}>
                      {s.code}
                    </th>
                  ))}
                  <th>Qualified until</th>
                  <th>Declaration</th>
                  <th>Relationships / rotation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <b>{c.name}</b>
                      <span className="crm-small">{c.areas.join(", ")}</span>
                    </td>
                    <td>{c.role.replace("_", " ")}</td>
                    {schemes.map((s) => (
                      <td key={s.code}>{c.schemes.includes(s.code) ? "✓" : ""}</td>
                    ))}
                    <td>
                      {fmtDate(c.qualified_until)}
                      {soon(c.qualified_until) ? <span className="crm-pill crm-pill--amber">Soon</span> : null}
                    </td>
                    <td>{c.declaration_until && new Date(c.declaration_until) > new Date() ? fmtDate(c.declaration_until) : <span className="crm-pill crm-pill--red">Missing / expired</span>}</td>
                    <td className="crm-small">
                      {c.relationships.map((r) => `${r.org}: ${r.kind}`).join("; ")}
                      {c.cycles.length ? ` · Cycles: ${c.cycles.map((x) => `${x.org} ×${x.count}`).join(", ")}` : ""}
                    </td>
                    <td>
                      <button type="button" className="crm-link" onClick={() => setEdit(structuredClone(c))}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {edit ? (
            <ReasonDialog
              title={`Competence — ${edit.name}`}
              confirmLabel="Save"
              onClose={() => setEdit(null)}
              onSubmit={async () => {
                saveCompetence(edit);
                setEdit(null);
                show("Saved.");
              }}
            >
              <div className="crm-grid crm-grid--2">
                <label className="crm-field">
                  Role
                  <Select value={edit.role} onChange={(val) => setEdit({ ...edit, role: val as Competence["role"] })} block>
                    {["lead", "auditor", "technical_expert", "trainee"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </label>
                <label className="crm-field">
                  Qualified until
                  <input className="crm-input" type="date" value={edit.qualified_until.slice(0, 10)} onChange={(e) => setEdit({ ...edit, qualified_until: new Date(e.target.value).toISOString() })} />
                </label>
                <label className="crm-field">
                  Impartiality declaration valid until
                  <input className="crm-input" type="date" value={edit.declaration_until?.slice(0, 10) ?? ""} onChange={(e) => setEdit({ ...edit, declaration_until: new Date(e.target.value).toISOString() })} />
                </label>
              </div>
              <p className="crm-small">Schemes</p>
              <div className="crm-row">
                {schemes.map((s) => (
                  <label key={s.code} className="crm-check">
                    <input type="checkbox" checked={edit.schemes.includes(s.code)} onChange={(e) => setEdit({ ...edit, schemes: e.target.checked ? [...edit.schemes, s.code] : edit.schemes.filter((x) => x !== s.code) })} /> {s.code}
                  </label>
                ))}
              </div>
            </ReasonDialog>
          ) : null}
        </div>
      )}
    </Gate>
  );
}

/* ---------------- settings ---------------- */

export function CertSettingsView() {
  const res = useDomain(() => getCertSettings(), []);
  return (
    <Gate res={res} what="Settings">
      {(s) => (
        <div className="crm-stack">
          <ModuleSettings<Record<string, number>>
            title="Certification settings"
            description="Fees, SLAs, NC and appeal windows, rotation. Values from the confirmation pack are provisional."
            values={{ day_rate: s.day_rate, application_fee: s.application_fee, certificate_fee: s.certificate_fee, lab_fee: s.lab_fee, deposit_pct: s.deposit_pct, nc_days: s.nc_days, appeal_days: s.appeal_days, surveillance_lead_days: s.surveillance_lead_days, rotation_cycles: s.rotation_cycles, quote_valid_days: s.quote_valid_days, sla_document_review: s.sla_document_review, sla_technical_review: s.sla_technical_review, sla_decision: s.sla_decision }}
            fields={[
              { key: "day_rate", label: "Auditor-day rate (E)", type: "number", toConfirm: true },
              { key: "application_fee", label: "Application fee (E)", type: "number", toConfirm: true },
              { key: "certificate_fee", label: "Certificate / permit fee (E)", type: "number", toConfirm: true },
              { key: "lab_fee", label: "Lab testing (product, E)", type: "number", toConfirm: true },
              { key: "deposit_pct", label: "Deposit on acceptance (%)", type: "number", toConfirm: true },
              { key: "nc_days", label: "Customer NC response window (days)", type: "number" },
              { key: "appeal_days", label: "Appeal window (days)", type: "number" },
              { key: "surveillance_lead_days", label: "Surveillance due lead time (days)", type: "number" },
              { key: "rotation_cycles", label: "Max cycles a lead may audit one client", type: "number", toConfirm: true },
              { key: "quote_valid_days", label: "Quote validity (days)", type: "number" },
              { key: "sla_document_review", label: "SLA: document review (working days)", type: "number", toConfirm: true },
              { key: "sla_technical_review", label: "SLA: technical review", type: "number", toConfirm: true },
              { key: "sla_decision", label: "SLA: decision", type: "number", toConfirm: true },
            ]}
            onSave={async (v) => void (await saveCertSettings(v as Partial<CertSettings>))}
            onReset={resetCertificationDemo}
          />
          <div className="crm-card">
            <div className="crm-card__h">
              <h3>Schemes & required documents</h3>
            </div>
            {s.schemes.map((sc) => (
              <p key={sc.code} style={{ margin: "6px 0" }}>
                <b>{sc.title}</b> <span className="crm-small">({sc.flow}{sc.cac ? ", CAC decides" : ""})</span>
                <br />
                <span className="crm-small">{sc.required_docs.map((d) => d.label).join(" · ")}</span>
              </p>
            ))}
          </div>
          <div className="crm-card">
            <div className="crm-card__h">
              <h3>Auditor-days by employees (to confirm)</h3>
            </div>
            <p className="crm-small">{s.fee_table.map((b) => `≤${b.max > 9999 ? "∞" : b.max}: ${b.days}d`).join(" · ")}</p>
          </div>
        </div>
      )}
    </Gate>
  );
}

/** Risk-based surveillance frequency from certification health (05 P3) — a suggestion, not a rule. */
function FreqHint({ clientId, org }: { clientId: string; org: string }) {
  const h = clientCertHealth(clientId, org);
  return (
    <span title={h.surveillance.why}>
      <span className={`crm-pill crm-pill--${h.surveillance.months === 6 ? "amber" : "outline"}`}>Every {h.surveillance.months} months</span>
      <span className="crm-small">Health {h.score}/100</span>
    </span>
  );
}
