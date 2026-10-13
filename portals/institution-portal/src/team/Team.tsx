import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrSettings, HrTeam, HrTeamCalendar, HrTeamMemberDetail } from "../api/types";
import { AuthPill } from "../hr/competence/shared";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill, Track } from "../me/parts";
import { useHrSettings } from "../hr/useHrSettings";
import { LetterLink } from "../hr/letters/Letters";

/**
 * My team (screens T1–T4): a line manager's direct and indirect reports. Live /hr/team only; job fields,
 * never personal or pay. Decisions (leave, authorisations) stay in Approvals; probation is reviewed here.
 */

export function TeamHome() {
  const { user, sessionKey } = useInstitution();
  const rules = useHrSettings();
  const res = useApiResource<HrTeam>("/hr/team", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const due = (d?.members ?? []).filter((m) => m.direct && m.probation_review_due);
  const ending = (d?.members ?? []).filter((m) => m.contract_ends);

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="dashboard">
      {d ? (
        <div className="hr-view">
          <div className="hr-head">
            <div>
              <h2>My team</h2>
              <p>
                {d.summary.people ? `${d.summary.direct} report directly to you, ${d.summary.people} in all.` : "Nobody reports to you."}
              </p>
            </div>
            {d.summary.people ? (
              <div className="hr-head__r">
                <Link className="btn ghost" to="/team/calendar">
                  Team calendar
                </Link>
                <Link className="btn ghost" to="/team/training">
                  Team training
                </Link>
                <Link className="btn ghost" to="/hr/reports?team=1">
                  Reports
                </Link>
              </div>
            ) : null}
          </div>

          {!d.summary.people ? (
            <EmptyState title="Nobody reports to you" detail="If that's wrong, ask HR to set the line manager on your team's records." />
          ) : (
            <>
              <div className="hr-cards">
                <Link className="hr-card" to="/approvals">
                  <span className="l">Waiting for you</span>
                  <span className="v">{d.summary.waiting_for_you ?? "—"}</span>
                  <span className="d">Decisions and tasks in Approvals</span>
                </Link>
                <Link className="hr-card" to="/team/calendar">
                  <span className="l">Away today</span>
                  <span className="v">{d.summary.away_today ?? "—"}</span>
                  <span className="d">On approved leave</span>
                </Link>
                <div className="hr-card">
                  <span className="l">Probation reviews due</span>
                  <span className="v">{d.summary.probation_reviews_due ?? "—"}</span>
                  <span className="d">{rules ? `Within ${rules.probation_notice_days} days` : "Coming up"}</span>
                </div>
                <div className="hr-card">
                  <span className="l">Contracts ending</span>
                  <span className="v">{d.summary.contracts_ending ?? "—"}</span>
                  <span className="d">{rules ? `Within ${rules.contract_notice_days} days; HR decides with you` : "HR decides with you"}</span>
                </div>
              </div>

              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Post</th>
                      <th>Today</th>
                      <th>Coming up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.members.map((m) => (
                      <tr key={m.employee}>
                        <td>
                          <Link className="hr-lnk" to={`/team/${encodeURIComponent(m.employee)}`}>
                            {m.employee_name}
                          </Link>
                          <div className="sub">{m.direct ? "Reports to you" : "In your area"}</div>
                        </td>
                        <td>
                          {m.designation ?? "—"}
                          {m.department ? <div className="sub">{m.department}</div> : null}
                        </td>
                        <td>{m.away_today ? <StatusPill cls="leave" label={`Away: ${m.away_today}`} /> : <span className="sub">In</span>}</td>
                        <td className="sub">
                          {m.probation_review_due ? `Probation review by ${fmtDay(m.probation_review_due)}` : ""}
                          {m.probation_review_due && m.contract_ends ? "; " : ""}
                          {m.contract_ends ? `Contract ends ${fmtDay(m.contract_ends)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {due.length ? (
                <NextStep
                  title={`Review ${due[0].employee_name}'s probation by ${fmtDay(due[0].probation_review_due, true)}`}
                  body="Confirm, extend, or recommend ending. If nothing is done, HR follows up."
                  to={`/team/${encodeURIComponent(due[0].employee)}/probation`}
                  label="Start review"
                />
              ) : ending.length ? (
                <NextStep title={`${ending[0].employee_name}'s contract ends ${fmtDay(ending[0].contract_ends, true)}`} body="Tell HR whether to renew, convert to permanent, or let it end." />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </ResourceGate>
  );
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wd = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - wd);
  return x;
}

/** T2 Team calendar: two weeks of leave and field work. */
export function TeamCalendar() {
  const { user, sessionKey } = useInstitution();
  // Working days come from the company Holiday List's weekly offs (GET /hr/settings working_week, ISO 1 = Monday);
  // when settings can't be read every day is shown rather than assuming a week.
  const rulesRes = useApiResource<HrSettings>("/hr/settings", { enabled: Boolean(user), refreshKey: sessionKey, quiet: true });
  const week = rulesRes.data?.working_week;
  const weekKnown = !rulesRes.loading;
  const [start, setStart] = useState(() => mondayOf(new Date()));
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const x = new Date(start);
      x.setUTCDate(start.getUTCDate() + i);
      if (!week || week.includes(x.getUTCDay() || 7)) out.push(x);
    }
    return out;
  }, [start, week]);
  const from = iso(days[0]);
  const to = iso(days[days.length - 1]);
  const res = useApiResource<HrTeamCalendar>(`/hr/team/calendar?from_date=${from}&to_date=${to}`, { enabled: Boolean(user) && weekKnown, refreshKey: sessionKey });
  const d = res.data;

  function cell(employee: string, day: string) {
    const e = d?.entries.find((x) => x.employee === employee && x.from_date <= day && x.to_date >= day);
    if (!e) return null;
    const letter = e.kind === "field" ? "F" : e.label.charAt(0).toUpperCase();
    return { letter, title: `${e.label}${e.approved ? "" : " (requested)"}`, pending: !e.approved };
  }

  function shift(weeks: number) {
    const x = new Date(start);
    x.setUTCDate(x.getUTCDate() + weeks * 7);
    setStart(x);
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="panel">
      <div className="hr-view">
        <Crumbs items={[["My team", "/team"], ["Calendar"]]} />
        <div className="hr-head">
          <div>
            <h2>Team calendar</h2>
            <p>
              {fmtDay(from)} to {fmtDay(to, true)}
            </p>
          </div>
          <div className="hr-head__r">
            <button type="button" className="btn ghost sm" onClick={() => shift(-2)}>
              Earlier
            </button>
            <button type="button" className="btn ghost sm" onClick={() => shift(2)}>
              Later
            </button>
          </div>
        </div>
        {d && d.people.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table" aria-label="Team calendar">
              <thead>
                <tr>
                  <th>Person</th>
                  {days.map((x) => (
                    <th key={iso(x)} className="c" style={{ textAlign: "center" }}>
                      {fmtDay(iso(x))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.people.map((p) => (
                  <tr key={p.employee}>
                    <td>
                      <b>{p.employee_name}</b>
                    </td>
                    {days.map((x) => {
                      const c = cell(p.employee, iso(x));
                      return (
                        <td key={iso(x)} style={{ textAlign: "center" }} title={c?.title}>
                          {c ? (
                            <span
                              aria-label={c.title}
                              style={{
                                display: "inline-grid",
                                placeItems: "center",
                                width: 28,
                                height: 24,
                                borderRadius: 6,
                                fontWeight: 800,
                                fontSize: 12,
                                background: c.pending ? "transparent" : "var(--navy-l, #eceefc)",
                                border: c.pending ? "1.5px dashed var(--navy)" : "0",
                              }}
                            >
                              {c.letter}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nobody to show" detail="Your team's leave and field work appear here." />
        )}
        <p className="hr-note">Letters are the leave type; F is field work from Field Operations, not leave. Dashed means requested, not yet approved.</p>
      </div>
    </ResourceGate>
  );
}

/** T3 Team member: job, leave, authorisations. Personal and pay details are not shown to line managers. */
export function TeamMember() {
  const { employee = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrTeamMemberDetail>(`/hr/team/${encodeURIComponent(employee)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const m = res.data;
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(m)} skeleton="panel">
      {m ? (
        <div className="hr-view">
          <Crumbs items={[["My team", "/team"], [m.employee_name]]} />
          <div className="hr-head">
            <div>
              <h2>{m.employee_name}</h2>
              <p>
                {[m.designation, m.department].filter(Boolean).join(", ")}. Reports to {m.line_manager ?? "—"}.
              </p>
            </div>
          </div>
          <div className="hr-grid c2">
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Job</h3>
                </div>
              </div>
              <div className="hr-box__b">
                <dl className="hr-kv">
                  <div>
                    <dt>Started</dt>
                    <dd>{fmtDay(m.date_of_joining, true)}</dd>
                  </div>
                  <div>
                    <dt>Probation</dt>
                    <dd>
                      {m.on_probation ? `Review by ${fmtDay(m.scheduled_confirmation_date, true)}` : "Not on probation"}
                      {!m.on_probation ? (
                        <div className="sub">
                          <LetterLink employee={m.employee} sourceName={m.employee} letterType="Probation confirmation" />
                        </div>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Contract</dt>
                    <dd>{m.contract_ends ? `Ends ${fmtDay(m.contract_ends, true)}` : "No end date"}</dd>
                  </div>
                  <div>
                    <dt>Today</dt>
                    <dd>{m.away_today ? `Away: ${m.away_today}` : "In"}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Leave</h3>
                  <p>This leave year</p>
                </div>
              </div>
              <div className="hr-box__b">
                {m.balances.length ? (
                  m.balances.map((b) => (
                    <div className="hr-bal" key={b.leave_type}>
                      <span>{b.leave_type}</span>
                      <div className="hr-prog">
                        <i style={{ width: `${b.allocated ? Math.min(100, (b.balance / b.allocated) * 100) : 0}%` }} />
                      </div>
                      <b>
                        {b.balance} of {b.allocated} left
                      </b>
                    </div>
                  ))
                ) : (
                  <p className="hr-note">No leave allocated this year.</p>
                )}
              </div>
            </div>
          </div>
          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>Authorisations</h3>
                <p>The work they can be assigned to</p>
              </div>
            </div>
            <div className="hr-box__b">
              {m.authorisations.length ? (
                <div className="hr-out">
                  {m.authorisations.map((a) => (
                    <div className="hr-out__i" key={a.id}>
                      <div>
                        <b>{a.skill}</b>
                        <span className="s">{a.valid_to ? `Valid to ${fmtDay(a.valid_to, true)}` : "No end date"}</span>
                      </div>
                      <span className="r">
                        <AuthPill status={a.status} validTo={a.valid_to} />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hr-note">None.</p>
              )}
            </div>
          </div>
          <Banner kind="lock" title="Personal and pay details aren't shown to line managers">
            Ask HR if you need them for a specific reason.
          </Banner>
          <div className="hr-actions">
            <Link className="btn ghost" to={`/team/${encodeURIComponent(m.employee)}/review`}>
              Appraisal
            </Link>
          </div>
          {m.direct && m.on_probation ? (
            <NextStep title="Probation review" body={`Due by ${fmtDay(m.scheduled_confirmation_date, true)}.`} to={`/team/${encodeURIComponent(m.employee)}/probation`} label="Start review" />
          ) : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}

/** T4 Probation review by the direct line manager. */
export function ProbationReview() {
  const { employee = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrTeamMemberDetail>(`/hr/team/${encodeURIComponent(employee)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const m = res.data;
  const [outcome, setOutcome] = useState("");
  const [summary, setSummary] = useState("");
  const [extendTo, setExtendTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ready = outcome && summary.trim().length >= 10 && (outcome !== "extend" || extendTo);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/hr/team/${encodeURIComponent(employee)}/probation`, {
        method: "POST",
        body: JSON.stringify({ outcome, summary: summary.trim(), extend_to: outcome === "extend" ? extendTo : null, confirm: true }),
      });
      setDone(outcome);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done && m) {
    const text: Record<string, [string, string]> = {
      confirm: [`${m.employee_name} is confirmed`, "The record shows the confirmation date. HR has nothing more to do."],
      extend: [`Probation extended to ${fmtDay(extendTo, true)}`, "You'll get a review task again before the new date."],
      end: ["Sent to HR", "Ending employment is decided by the HR Manager with the Executive Director. Nothing changes until then."],
    };
    return (
      <div className="hr-view">
        <Crumbs items={[["My team", "/team"], [m.employee_name, `/team/${encodeURIComponent(employee)}`], ["Probation review"]]} />
        <div className="hr-head">
          <div>
            <h2>{text[done][0]}</h2>
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__b">
            <Track
              steps={[
                { title: "Reviewed", detail: "By you", state: "done" },
                done === "end"
                  ? { title: "HR Manager and Executive Director decide", state: "now" }
                  : { title: done === "confirm" ? "Confirmed on the record" : "New review date set", state: "done" },
              ]}
            />
          </div>
        </div>
        <NextStep title="Back to your team" body={text[done][1]} to="/team" label="My team" />
      </div>
    );
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(m)} skeleton="panel">
      {m ? (
        <div className="hr-view">
          <Crumbs items={[["My team", "/team"], [m.employee_name, `/team/${encodeURIComponent(employee)}`], ["Probation review"]]} />
          <div className="hr-head">
            <div>
              <h2>Probation review: {m.employee_name}</h2>
              <p>
                {m.designation}. Started {fmtDay(m.date_of_joining, true)}. Review due {fmtDay(m.scheduled_confirmation_date, true)}.
              </p>
            </div>
          </div>
          {!m.on_probation ? <Banner kind="lock" title="Not on probation">There's nothing to review.</Banner> : null}
          {m.on_probation && !m.direct ? <Banner kind="lock" title="Only the direct line manager reviews probation" /> : null}
          {m.on_probation && m.direct ? (
            <>
              <div className="hr-box">
                <div className="hr-box__b hr-view" style={{ gap: 12 }}>
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="hr-f">Outcome</legend>
                    <div className="hr-radios">
                      {[
                        ["confirm", "Confirm", "Probation ends; the employee is confirmed"],
                        ["extend", "Extend", "Set a new review date and what must improve"],
                        ["end", "Recommend ending employment", "The HR Manager and Executive Director decide"],
                      ].map(([v, label, hint]) => (
                        <label key={v} className="hr-radio">
                          <input type="radio" name="outcome" checked={outcome === v} onChange={() => setOutcome(v)} />
                          <span>
                            <b>{label}</b>
                            <small>{hint}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {outcome === "extend" ? (
                    <label className="hr-f">
                      <span>New review date</span>
                      <input className="hr-in" type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} />
                    </label>
                  ) : null}
                  <label className="hr-f">
                    <span>How it went</span>
                    <textarea className="hr-in" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
                    <small>Strengths and what to develop. It goes on the record.</small>
                  </label>
                </div>
              </div>
              {err ? (
                <Banner kind="bad" title="Not saved">
                  {err}
                </Banner>
              ) : null}
              <div className="hr-actions">
                <Link className="btn ghost" to={`/team/${encodeURIComponent(employee)}`}>
                  Cancel
                </Link>
                <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
                  {busy ? "Saving…" : "Submit review"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}
