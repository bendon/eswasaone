import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import { errorText, hrSend } from "../api";
import type { HrCase, HrCaseKind, HrCaseRegister, HrEmployeesResponse, HrOffence, HrOffenceList } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill } from "../../me/parts";
import { useHrSettings } from "../useHrSettings";
import { WarningLetterLink } from "../letters/Letters";

/**
 * Cases (journey J10; screens H10, H10a). Grievances (HRMS Employee Grievance) and disciplinary cases. Only HR
 * Managers and the named case owner see a case; the register never names the people involved. Not in search or
 * Ask Esi; the Board sees counts only.
 */

const KIND: Record<HrCaseKind, string> = { grievance: "Grievance", disciplinary: "Disciplinary" };
const caseUrl = (kind: string, id: string) => `/hr/cases/${kind}/${encodeURIComponent(id)}`;

function stageCls(stage: string, closed: boolean) {
  if (closed) return stage === "Invalid" ? "mute" : "ok";
  return stage === "Appeal" || stage === "Hearing scheduled" ? "info" : "leave";
}

/** "Late coming (Minor)": how an offence reads in a picker. */
export const offenceLabel = (o: HrOffence) => `${o.title ?? o.code}${o.level ? ` (${o.level})` : ""}`;

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** What the outcome form says about expiry: the date it would lapse, or that ESWASA hasn't set validity (A1). */
export function expiryNote(sanction: string, months: Record<string, number | null> | undefined, today: string): string | null {
  if (!months || !(sanction in months)) return null;
  const n = months[sanction];
  return n ? `Active for ${n} months, until ${fmtDay(addMonths(today, n), true)}.` : "Expiry not set: awaiting ESWASA (A1).";
}

function warningCls(status?: string | null) {
  return status === "Active" ? "bad" : status === "Withdrawn" ? "mute" : "info";
}

const LOCK = "Restricted to the HR Manager and the case owner. Not in search, exports or Ask Esi. The Board sees counts only.";

/** H10 Register. */
export function CasesView() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrCaseRegister>("/hr/cases", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const open = (d?.items ?? []).filter((c) => !c.closed);
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <div className="hr-head">
              <div>
                <h2>Cases</h2>
                <p>Grievances and disciplinary matters. {open.length} open.</p>
              </div>
              <div className="hr-head__r">
                {(user?.roles ?? []).some((r) => r === "HR Manager" || r === "HR User" || r === "System Manager") ? (
                  <Link className="btn ghost" to="/hr/cases/code">
                    Disciplinary code
                  </Link>
                ) : null}
                {d.can_open ? (
                  <Link className="btn pri" to="/hr/cases/new">
                    Open a case
                  </Link>
                ) : null}
              </div>
            </div>
            <Banner kind="lock" title="Restricted">
              {LOCK} The list shows no names; they're inside each case.
            </Banner>
            {d.items.length ? (
              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Kind</th>
                      <th>Opened</th>
                      <th>Stage</th>
                      <th>Owner</th>
                      <th>Next step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link className="hr-lnk mono" to={caseUrl(c.kind, c.id)}>
                            {c.id}
                          </Link>
                        </td>
                        <td>{KIND[c.kind]}</td>
                        <td>{fmtDay(c.opened_on, true)}</td>
                        <td>
                          <StatusPill cls={stageCls(c.stage, c.closed)} label={c.stage} />
                        </td>
                        <td>{c.owner_name ?? "—"}</td>
                        <td>
                          {c.next_step ? (
                            <>
                              {c.next_step}
                              {c.next_step_due ? <div className={c.overdue ? "sub bad" : "sub"}>{c.overdue ? "Overdue, " : "By "}{fmtDay(c.next_step_due, true)}</div> : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No cases you can see" detail="Cases appear here for the HR Manager and their owner only." />
            )}
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

/** H10 Open a case (HR Manager). */
export function CaseNew() {
  const { user, sessionKey } = useInstitution();
  const reg = useApiResource<HrCaseRegister>("/hr/cases", { enabled: Boolean(user), refreshKey: sessionKey });
  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user), refreshKey: sessionKey });
  const code = useApiResource<HrOffenceList>("/hr/disciplinary/offences", { enabled: Boolean(user), refreshKey: sessionKey });
  const [kind, setKind] = useState<HrCaseKind>("disciplinary");
  const [offence, setOffence] = useState("");
  const [employee, setEmployee] = useState("");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<HrCase | null>(null);
  const staff = people.data?.items ?? [];
  const involvedUser = staff.find((p) => p.id === employee)?.user_id;
  const owners = (reg.data?.owners ?? []).filter((o) => o.user !== involvedUser);
  const ready = employee && owner && description.trim();

  async function open() {
    setBusy(true);
    setErr(null);
    try {
      setMade(
        await apiFetch<HrCase>("/hr/cases", {
          method: "POST",
          body: JSON.stringify({
            kind,
            employee,
            owner,
            description: description.trim(),
            next_step: nextStep.trim() || null,
            next_step_due: due || null,
            ...(kind === "disciplinary" && offence ? { offence } : {}),
            confirm: true,
          }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not opened. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (made)
    return (
      <div className="hr hr-view hr-view--form">
        <Crumbs items={[["Cases", "/hr/cases"], [made.id]]} />
        <div className="hr-head">
          <div>
            <h2>Case opened</h2>
            <p>{made.owner_name} has a task for the first step. Only they and the HR Manager can see it.</p>
          </div>
        </div>
        <NextStep title="Open the case" to={caseUrl(made.kind, made.id)} label={made.id} />
      </div>
    );

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={reg.loading} error={reg.error} onRetry={reg.reload} hasData={Boolean(reg.data)} skeleton="panel">
        {reg.data && !reg.data.can_open ? (
          <EmptyState title="Only an HR Manager can open a case" detail="Ask the HR Manager. Staff can raise a concern in confidence from My HR." />
        ) : (
          <div className="hr hr-view hr-view--form">
            <Crumbs items={[["Cases", "/hr/cases"], ["Open a case"]]} />
            <div className="hr-head">
              <div>
                <h2>Open a case</h2>
                <p>Restricted from the moment it's saved. It stays out of search and Ask Esi.</p>
              </div>
            </div>
            <div className="hr-box">
              <div className="hr-box__b hr-form">
                <div className="hr-radios wide" role="radiogroup" aria-label="Kind of case">
                  {(["grievance", "disciplinary"] as const).map((k) => (
                    <label className="hr-radio" key={k}>
                      <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                      <span>
                        <b>{KIND[k]}</b>
                        <small>{k === "grievance" ? "An employee raises a concern" : "A possible breach of conduct"}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <label className="hr-f">
                  <span>{kind === "grievance" ? "Raised by" : "Person the case is about"}</span>
                  <select className="hr-in" value={employee} onChange={(e) => setEmployee(e.target.value)}>
                    <option value="">Choose…</option>
                    {staff.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.employee_name}
                      </option>
                    ))}
                  </select>
                  <small>Their name appears only inside the case</small>
                </label>
                <label className="hr-f">
                  <span>Owner</span>
                  <select className="hr-in" value={owner} onChange={(e) => setOwner(e.target.value)}>
                    <option value="">Choose…</option>
                    {owners.map((o) => (
                      <option key={o.user} value={o.user}>
                        {o.name ?? o.user}
                      </option>
                    ))}
                  </select>
                  <small>An HR Manager. Can't be one of the people involved</small>
                </label>
                {kind === "disciplinary" ? (
                  <label className="hr-f">
                    <span>Offence (optional)</span>
                    <select className="hr-in" value={offence} onChange={(e) => setOffence(e.target.value)}>
                      <option value="">{(code.data?.items ?? []).some((o) => o.active) ? "Not decided yet" : "No disciplinary code yet (A1)"}</option>
                      {(code.data?.items ?? [])
                        .filter((o) => o.active)
                        .map((o) => (
                          <option key={o.code} value={o.code}>
                            {offenceLabel(o)}
                          </option>
                        ))}
                    </select>
                    <small>From ESWASA's disciplinary code. It's confirmed when the outcome is issued</small>
                  </label>
                ) : null}
                <label className="hr-f wide">
                  <span>What happened</span>
                  <textarea className="hr-in" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Facts, dates, who saw it" />
                </label>
                <label className="hr-f">
                  <span>First step</span>
                  <input className="hr-in" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. Take statements" />
                </label>
                <label className="hr-f">
                  <span>Due</span>
                  <input className="hr-in" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                </label>
              </div>
            </div>
            {err ? (
              <Banner kind="bad" title="Not opened">
                {err}
              </Banner>
            ) : null}
            <div className="hr-actions">
              <Link className="btn ghost" to="/hr/cases">
                Cancel
              </Link>
              <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void open()}>
                {busy ? "Opening…" : "Open case"}
              </button>
            </div>
          </div>
        )}
      </ResourceGate>
    </RequireStaff>
  );
}

/** H10a One case: lock banner, stages, people, notes, next step, outcome and appeal routing. */
export function CaseDetail() {
  const { kind = "", id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  // Stages that close a case of this kind (eswasa_hr.cases.CLOSED), from GET /hr/settings.
  const closedStages = useHrSettings()?.lists.case_closed?.[kind] ?? [];
  const res = useApiResource<HrCase>(caseUrl(kind, id), { enabled: Boolean(user), refreshKey: sessionKey });
  const [c, setC] = useState<HrCase | null>(null);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [due, setDue] = useState("");
  const [outcome, setOutcome] = useState("");
  const [appealOwner, setAppealOwner] = useState("");
  const [offence, setOffence] = useState("");
  const [sanction, setSanction] = useState("");
  const [appealResult, setAppealResult] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (res.data) setC(res.data);
  }, [res.data]);
  useEffect(() => setTo(c?.next[0] ?? ""), [c?.stage, c?.next]);
  useEffect(() => setOffence(c?.offence ?? ""), [c?.offence]);

  async function post(path: string, body: Record<string, unknown>, reset: () => void) {
    setBusy(true);
    setErr(null);
    try {
      setC(await apiFetch<HrCase>(`${caseUrl(kind, id)}/${path}`, { method: "POST", body: JSON.stringify({ ...body, confirm: true }) }));
      reset();
    } catch (e) {
      setErr(errorText(e, "Not saved."));
    } finally {
      setBusy(false);
    }
  }

  const closing = closedStages.includes(to);
  const needsOutcome = to === "Outcome issued" || (closing && to !== "Closed" && to !== "Cancelled");
  // Plan 01: a disciplinary outcome names the offence (once ESWASA's code has any) and the sanction.
  const sanctioning = c?.kind === "disciplinary" && to === "Outcome issued";
  const offences = c?.offences ?? [];
  const closingAppeal = c?.kind === "disciplinary" && c?.stage === "Appeal" && to === "Closed";
  const ready =
    to &&
    note.trim() &&
    (!needsOutcome || outcome.trim()) &&
    (to !== "Appeal" || appealOwner) &&
    (!sanctioning || (sanction && (offence || !offences.length))) &&
    (!closingAppeal || appealResult);
  const pickOffence = (code: string) => {
    setOffence(code);
    const hint = offences.find((o) => o.code === code)?.suggested_sanction;
    if (hint) setSanction(hint);
  };
  const today = new Date().toISOString().slice(0, 10);
  const appealOwners = (c?.owners ?? []).filter((o) => o.user !== c?.decided_by);

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(c)} skeleton="panel">
        {c ? (
          <div className="hr hr-view">
            <Crumbs items={[["Cases", "/hr/cases"], [c.id]]} />
            <div className="hr-head">
              <div>
                <h2>
                  {c.id}: {KIND[c.kind]}
                </h2>
                <p>
                  Opened {fmtDay(c.opened_on, true)}. Owner: {c.owner_name ?? "—"}.
                </p>
              </div>
            </div>
            <Banner kind="lock" title="Restricted">
              {LOCK}
            </Banner>
            {(user?.roles ?? []).includes("HR Manager") && !closedStages.includes(c.stage) ? (
              <ReassignOwner url={caseUrl(kind, id)} c={c} onDone={setC} />
            ) : null}
            <ol className="hr-steps" aria-label="Stages">
              {c.stages.map((s, i) => {
                const at = c.stages.indexOf(c.stage);
                return (
                  <li key={s} className={at > i || (at === i && c.next.length === 0 && at === c.stages.length - 1) ? "done" : at === i ? "now" : ""} aria-current={at === i ? "step" : undefined}>
                    <em>Stage {i + 1}</em>
                    <b>{s}</b>
                  </li>
                );
              })}
            </ol>
            {c.stage === "Invalid" ? <Banner kind="info" title="Closed as invalid" /> : null}
            <div className="hr-grid c2">
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Case</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <dl className="hr-kv">
                    <div>
                      <dt>People involved</dt>
                      <dd>
                        {c.people.map((p) => (
                          <div key={p.employee}>
                            {p.employee_name ?? p.employee} <span className="sub">({p.role.toLowerCase()})</span>
                          </div>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt>Next step</dt>
                      <dd>{c.next_step ? `${c.next_step}${c.next_step_due ? `, by ${fmtDay(c.next_step_due, true)}` : ""}` : "—"}</dd>
                    </div>
                    {c.outcome ? (
                      <div>
                        <dt>Outcome</dt>
                        <dd>
                          {c.outcome}
                          {c.decided_by_name ? <div className="sub">By {c.decided_by_name}</div> : null}
                        </dd>
                      </div>
                    ) : null}
                    {c.offence ? (
                      <div>
                        <dt>Offence</dt>
                        <dd>{c.offence_title ?? c.offence}</dd>
                      </div>
                    ) : null}
                    {c.sanction ? (
                      <div>
                        <dt>Sanction</dt>
                        <dd>
                          {c.sanction}
                          {c.warning_status ? (
                            <div className="sub">
                              <StatusPill cls={warningCls(c.warning_status)} label={`Warning ${c.warning_status.toLowerCase()}`} />{" "}
                              {c.warning_expires_on ? `until ${fmtDay(c.warning_expires_on, true)}` : c.warning_status === "Active" ? "Expiry not set: awaiting ESWASA (A1)" : ""}
                            </div>
                          ) : null}
                          {c.warning_status && c.warning_status !== "Withdrawn" && c.people[0] ? (
                            <div className="sub">
                              <WarningLetterLink employee={c.people[0].employee} caseId={id} letter={c.warning_letter} onMade={res.reload} />
                            </div>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                    {c.appeal_result ? (
                      <div>
                        <dt>Appeal</dt>
                        <dd>{c.appeal_result}</dd>
                      </div>
                    ) : null}
                    {c.appeal_owner_name ? (
                      <div>
                        <dt>Appeal heard by</dt>
                        <dd>{c.appeal_owner_name}</dd>
                      </div>
                    ) : null}
                    {c.talk_first ? (
                      <div>
                        <dt>Asked</dt>
                        <dd>To talk to HR before anything is investigated</dd>
                      </div>
                    ) : null}
                  </dl>
                  {c.description ? <p className="hr-pre">{c.description}</p> : null}
                </div>
              </div>
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Notes</h3>
                    <p>Newest first</p>
                  </div>
                </div>
                <div className="hr-box__b">
                  {c.notes.length ? (
                    <div className="hr-out">
                      {c.notes.map((n, i) => (
                        <div className="hr-out__i" key={i}>
                          <div>
                            <b className="hr-pre">{n.text}</b>
                            <span className="s">
                              {n.by ?? ""}
                              {n.on ? `, ${fmtDay(n.on, true)}` : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hr-note">No notes yet.</p>
                  )}
                  <label className="hr-f">
                    <span>Add a note</span>
                    <textarea className="hr-in" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
                  </label>
                  <button type="button" className="btn ghost sm" disabled={!text.trim() || busy} onClick={() => void post("notes", { text: text.trim() }, () => setText(""))}>
                    Add note
                  </button>
                </div>
              </div>
            </div>
            {c.next.length ? (
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Move the case on</h3>
                  </div>
                </div>
                <div className="hr-box__b hr-form">
                  <div className="hr-radios wide" role="radiogroup" aria-label="Next stage">
                    {c.next.map((s) => (
                      <label className="hr-radio" key={s}>
                        <input type="radio" name="to" checked={to === s} onChange={() => setTo(s)} />
                        <span>
                          <b>{s}</b>
                        </span>
                      </label>
                    ))}
                  </div>
                  <label className="hr-f wide">
                    <span>What happened at this step</span>
                    <textarea className="hr-in" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  {sanctioning ? (
                    <>
                      <label className="hr-f">
                        <span>Offence</span>
                        {offences.length ? (
                          <select className="hr-in" value={offence} onChange={(e) => pickOffence(e.target.value)}>
                            <option value="">Choose…</option>
                            {offences.map((o) => (
                              <option key={o.code} value={o.code}>
                                {offenceLabel(o)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="hr-note">No disciplinary code yet. ESWASA to supply its offences (A1).</span>
                        )}
                      </label>
                      <label className="hr-f">
                        <span>Sanction</span>
                        <select className="hr-in" value={sanction} onChange={(e) => setSanction(e.target.value)}>
                          <option value="">Choose…</option>
                          {(c.sanctions ?? []).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <small>{(sanction && expiryNote(sanction, c.warning_months, today)) || "Suggested by the offence; you can change it"}</small>
                      </label>
                    </>
                  ) : null}
                  {closingAppeal ? (
                    <div className="hr-radios wide" role="radiogroup" aria-label="Appeal result">
                      {(c.appeal_results ?? []).map((r) => (
                        <label className="hr-radio" key={r}>
                          <input type="radio" name="appeal_result" checked={appealResult === r} onChange={() => setAppealResult(r)} />
                          <span>
                            <b>{r}</b>
                            <small>{r === "Overturned" ? "The outcome is set aside; any warning is withdrawn" : "The outcome stands"}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {needsOutcome ? (
                    <label className="hr-f wide">
                      <span>Outcome</span>
                      <textarea className="hr-in" rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
                    </label>
                  ) : null}
                  {to === "Appeal" ? (
                    <label className="hr-f">
                      <span>Appeal heard by</span>
                      <select className="hr-in" value={appealOwner} onChange={(e) => setAppealOwner(e.target.value)}>
                        <option value="">Choose…</option>
                        {appealOwners.map((o) => (
                          <option key={o.user} value={o.user}>
                            {o.name ?? o.user}
                          </option>
                        ))}
                      </select>
                      <small>Never whoever issued the outcome{c.decided_by_name ? ` (${c.decided_by_name})` : ""}</small>
                    </label>
                  ) : null}
                  {!closing ? (
                    <>
                      <label className="hr-f">
                        <span>Next step</span>
                        <input className="hr-in" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
                      </label>
                      <label className="hr-f">
                        <span>Due</span>
                        <input className="hr-in" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            {err ? (
              <Banner kind="bad" title="Not saved">
                {err}
              </Banner>
            ) : null}
            {c.next.length ? (
              <div className="hr-actions">
                <button
                  type="button"
                  className="btn pri"
                  disabled={!ready || busy}
                  onClick={() =>
                    void post(
                      "act",
                      {
                        to_stage: to,
                        note: note.trim(),
                        next_step: closing ? null : nextStep.trim() || null,
                        next_step_due: closing ? null : due || null,
                        outcome: outcome.trim() || null,
                        appeal_owner: to === "Appeal" ? appealOwner : null,
                        ...(sanctioning ? { offence: offence || null, sanction } : {}),
                        ...(closingAppeal ? { appeal_result: appealResult } : {}),
                      },
                      () => {
                        setNote("");
                        setSanction("");
                        setAppealResult("");
                        setNextStep("");
                        setDue("");
                        setOutcome("");
                        setAppealOwner("");
                      },
                    )
                  }
                >
                  {busy ? "Saving…" : `Move to ${to}`}
                </button>
              </div>
            ) : null}
            {c.kind === "disciplinary" && c.stage !== "Appeal" && !closedStages.includes(c.stage) ? (
              <Banner kind="info" title="If there is an appeal">
                It goes to someone other than whoever issued the outcome.
              </Banner>
            ) : null}
            <NextStep title="Back to the register" to="/hr/cases" label="Cases" />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

/** HR Manager hands the case to another named owner; the server refuses anyone involved in it. */
function ReassignOwner({ url, c, onDone }: { url: string; c: HrCase; onDone: (c: HrCase) => void }) {
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const owners = (c.owners ?? []).filter((o) => o.user !== c.owner);

  async function save() {
    setErr(null);
    if (!owner) return setErr("Choose the new owner.");
    if (!note.trim()) return setErr("Say why the case is moving. It goes on the case record.");
    setBusy(true);
    try {
      onDone(await hrSend<HrCase>(`${url}/owner`, { owner, note: note.trim() }));
      setOpen(false);
      setOwner("");
      setNote("");
    } catch (e) {
      setErr(errorText(e, "Not reassigned."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
          Change owner
        </button>
      </div>
    );
  }
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Change owner</h3>
          <p>The new owner gets the next-step task. Nobody involved in the case can own it.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 10 }}>
        <label className="hr-f">
          <span>New owner</span>
          <select className="hr-in" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={busy}>
            <option value="">Choose…</option>
            {owners.map((o) => (
              <option key={o.user} value={o.user}>
                {o.name ?? o.user}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-f">
          <span>Why</span>
          <input className="hr-in" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
        </label>
        {err ? (
          <Banner kind="bad" title="Not reassigned">
            {err}
          </Banner>
        ) : null}
        <div>
          <button type="button" className="btn pri" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Reassign"}
          </button>{" "}
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
