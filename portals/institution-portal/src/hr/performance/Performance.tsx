import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrAppraisal, HrPerfCycleDetail, HrPerfCycle, HrPerfDefaults } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill, Track } from "../../me/parts";
import { Criteria, Done, Goals, StepPill } from "./parts";

/**
 * Performance (journey J6; screens H8, H8a, H8b). HR starts a cycle and tracks completion by department; the
 * employee rates themselves in My HR, then the line manager reviews in My team. HR never rates anyone.
 */

function Bar({ n, of }: { n: number; of: number }) {
  return (
    <div className="hr-perf">
      <span>
        {n} of {of}
      </span>
      <div className="hr-prog">
        <i style={{ width: `${of ? (n / of) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** H8 Performance: every cycle with its completion. */
export function PerformanceHome() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ items: HrPerfCycle[] }>("/hr/performance", { enabled: Boolean(user), refreshKey: sessionKey });
  const items = res.data?.items ?? [];
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)} skeleton="panel">
        <div className="hr hr-view">
          <div className="hr-head">
            <div>
              <h2>Performance</h2>
              <p>Staff rate themselves, then their line manager reviews. HR starts each cycle and follows progress.</p>
            </div>
            <div className="hr-head__r">
              <Link className="btn pri" to="/hr/performance/new">
                Start a cycle
              </Link>
            </div>
          </div>
          {items.length ? (
            <div className="hr-box hr-scroll">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Cycle</th>
                    <th>People</th>
                    <th>Objectives set</th>
                    <th>Self-assessments</th>
                    <th>Manager reviews</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <Link className="hr-lnk" to={`/hr/performance/cycles/${encodeURIComponent(c.name)}`}>
                          <b>{c.cycle_name}</b>
                        </Link>
                        <div className="sub">
                          {fmtDay(c.start_date, true)} to {fmtDay(c.end_date, true)}
                          {c.status ? ` · ${c.status}` : ""}
                        </div>
                      </td>
                      <td>{c.people}</td>
                      <td>
                        <Bar n={c.objectives_set} of={c.people} />
                      </td>
                      <td>
                        <Bar n={c.self_done} of={c.people} />
                      </td>
                      <td>
                        <Bar n={c.manager_done} of={c.people} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No appraisal cycles yet" detail="Start one when the appraisal templates are set up (one per post family)." />
          )}
          <NextStep title={items.length ? "Follow a cycle" : "Start the first cycle"} body="Each person gets a self-assessment task; their line manager gets the review after." to="/hr/performance/new" label="Start a cycle" />
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}

const STEPS = ["Period", "Template", "Who is in it", "Review"];

/** H8a Start a cycle. */
export function CycleNew() {
  const { user, sessionKey } = useInstitution();
  const def = useApiResource<HrPerfDefaults>("/hr/performance/defaults", { enabled: Boolean(user), refreshKey: sessionKey });
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [template, setTemplate] = useState("");
  const [depts, setDepts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<HrPerfCycleDetail | null>(null);
  const d = def.data;
  const tpl = d?.templates.find((t) => t.name === template);
  const people = (d?.departments ?? []).filter((x) => !depts.length || depts.includes(x.name)).reduce((n, x) => n + x.people, 0);
  const ok = [Boolean(name.trim() && start && end && end > start), Boolean(template), people > 0, true];

  async function startCycle() {
    setBusy(true);
    setErr(null);
    try {
      setMade(
        await apiFetch<HrPerfCycleDetail>("/hr/performance/cycles", {
          method: "POST",
          body: JSON.stringify({ cycle_name: name.trim(), start_date: start, end_date: end, template, departments: depts, confirm: true }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not started. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (made)
    return (
      <div className="hr hr-view">
        <Crumbs items={[["Performance", "/hr/performance"], [made.cycle_name]]} />
        <div className="hr-head">
          <div>
            <h2>{made.cycle_name} started</h2>
            <p>{made.people.length} people are in it.</p>
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__b">
            <Track
              steps={[
                { title: "Started", detail: "Self-assessment tasks sent", state: "done" },
                { title: "Staff rate themselves", detail: "In My HR", state: "now" },
                { title: "Line managers review", detail: "In My team, after each self-assessment" },
                { title: "Complete", detail: "HR follows progress here" },
              ]}
            />
          </div>
        </div>
        <NextStep title="Follow progress" to={`/hr/performance/cycles/${encodeURIComponent(made.name)}`} label="Open the cycle" />
      </div>
    );

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={def.loading} error={def.error} onRetry={def.reload} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Performance", "/hr/performance"], ["Start a cycle"]]} />
            <div className="hr-head">
              <div>
                <h2>Start an appraisal cycle</h2>
                <p>Everyone in it gets a self-assessment task. Reminders go out {d.reminder_days.join(" and ")} working days before the end date.</p>
              </div>
            </div>
            <ol className="hr-steps" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>
                  <em>Step {i + 1}</em>
                  <b>{s}</b>
                </li>
              ))}
            </ol>
            <div className="hr-box">
              <div className="hr-box__b hr-form">
                {step === 0 ? (
                  <>
                    <label className="hr-f wide">
                      <span>Cycle name</span>
                      <input className="hr-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mid-year review 2026/27" />
                    </label>
                    <label className="hr-f">
                      <span>Starts</span>
                      <input className="hr-in" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                    </label>
                    <label className="hr-f">
                      <span>Ends</span>
                      <input className="hr-in" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
                      <small>Self-assessments and manager reviews are due by then</small>
                    </label>
                  </>
                ) : null}
                {step === 1 ? (
                  d.templates.length ? (
                    <div className="hr-radios wide" role="radiogroup" aria-label="Template">
                      {d.templates.map((t) => (
                        <label className="hr-radio" key={t.name}>
                          <input type="radio" name="template" checked={template === t.name} onChange={() => setTemplate(t.name)} />
                          <span>
                            <b>{t.title}</b>
                            <small>{t.criteria.length ? t.criteria.join(", ") : "No rating items yet"}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="wide">
                      <Banner kind="info" title="Awaiting ESWASA: appraisal templates">
                        One template per post family, with what people are rated on (brief §8). Set them up in HR setup before starting a cycle.
                      </Banner>
                    </div>
                  )
                ) : null}
                {step === 2 ? (
                  <fieldset className="hr-f wide">
                    <legend>Departments (none chosen means everyone active)</legend>
                    <div className="hr-radios">
                      {d.departments.map((x) => (
                        <label className="hr-radio" key={x.name}>
                          <input
                            type="checkbox"
                            checked={depts.includes(x.name)}
                            onChange={(e) => setDepts((cur) => (e.target.checked ? [...cur, x.name] : cur.filter((y) => y !== x.name)))}
                          />
                          <span>
                            <b>{x.name}</b>
                            <small>{x.people} active</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <small>{people} people will be appraised.</small>
                  </fieldset>
                ) : null}
                {step === 3 ? (
                  <dl className="hr-kv wide">
                    <div>
                      <dt>Cycle</dt>
                      <dd>{name}</dd>
                    </div>
                    <div>
                      <dt>Period</dt>
                      <dd>
                        {fmtDay(start, true)} to {fmtDay(end, true)}
                      </dd>
                    </div>
                    <div>
                      <dt>Template</dt>
                      <dd>{tpl?.title}</dd>
                    </div>
                    <div>
                      <dt>People</dt>
                      <dd>
                        {people} ({depts.length ? depts.join(", ") : "all departments"})
                      </dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            </div>
            {err ? (
              <Banner kind="bad" title="Not started">
                {err}
              </Banner>
            ) : null}
            <div className="hr-actions">
              {step > 0 ? (
                <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              ) : (
                <Link className="btn ghost" to="/hr/performance">
                  Cancel
                </Link>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn pri" disabled={!ok[step]} onClick={() => setStep(step + 1)}>
                  Continue
                </button>
              ) : (
                <button type="button" className="btn pri" disabled={busy} onClick={() => void startCycle()}>
                  {busy ? "Starting…" : "Start cycle"}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

/** H8 detail: completion by department, everyone's step, Remind outstanding. */
export function CycleDetail() {
  const { name = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const dept = search.get("department") ?? "";
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrPerfCycleDetail>(`/hr/performance/cycles/${encodeURIComponent(name)}${dept ? `?department=${encodeURIComponent(dept)}` : ""}`, {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const c = res.data;
  async function remind() {
    setNote(null);
    try {
      const r = await apiFetch<{ sent: number }>(`/hr/performance/cycles/${encodeURIComponent(name)}/remind`, { method: "POST", body: JSON.stringify({ department: dept || null, confirm: true }) });
      setNote({ kind: "ok", text: r.sent ? `${r.sent} reminder${r.sent === 1 ? "" : "s"} sent.` : "Everyone with an open step already has a reminder." });
    } catch (e) {
      setNote({ kind: "bad", text: e instanceof Error ? e.message : "Not sent." });
    }
  }
  const open = (c?.people ?? []).filter((p) => p.step !== "done").length;
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(c)} skeleton="panel">
        {c ? (
          <div className="hr hr-view">
            <Crumbs items={[["Performance", "/hr/performance"], [c.cycle_name]]} />
            <div className="hr-head">
              <div>
                <h2>
                  {c.cycle_name}
                  {dept ? `: ${dept}` : ""}
                </h2>
                <p>
                  {fmtDay(c.start_date, true)} to {fmtDay(c.end_date, true)}. {open} with a step still open.
                </p>
              </div>
              <div className="hr-head__r">
                <button type="button" className="btn ghost" disabled={!open} onClick={() => void remind()}>
                  Remind outstanding
                </button>
              </div>
            </div>
            {note ? <Banner kind={note.kind} title={note.text} /> : null}
            <div className="hr-box hr-scroll">
              <div className="hr-box__h">
                <div>
                  <h3>By department</h3>
                </div>
              </div>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>People</th>
                    <th>Objectives set</th>
                    <th>Self-assessments</th>
                    <th>Manager reviews</th>
                  </tr>
                </thead>
                <tbody>
                  {c.departments.map((x) => (
                    <tr key={x.department} className={x.department === dept ? "sel" : undefined}>
                      <td>
                        <button type="button" className="hr-lnk" onClick={() => setSearch(x.department === dept ? {} : { department: x.department })}>
                          <b>{x.department}</b>
                        </button>
                      </td>
                      <td>{x.people}</td>
                      <td>
                        <Bar n={x.objectives_set} of={x.people} />
                      </td>
                      <td>
                        <Bar n={x.self_done} of={x.people} />
                      </td>
                      <td>
                        <Bar n={x.manager_done} of={x.people} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hr-box hr-scroll">
              <div className="hr-box__h">
                <div>
                  <h3>People</h3>
                  <p>{dept || "All departments"}</p>
                </div>
              </div>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Objectives</th>
                    <th>Self-assessment</th>
                    <th>Manager review</th>
                  </tr>
                </thead>
                <tbody>
                  {c.people.map((p) => (
                    <tr key={p.appraisal}>
                      <td>
                        <Link className="hr-lnk" to={`/hr/performance/appraisals/${encodeURIComponent(p.appraisal)}`}>
                          <b>{p.employee_name}</b>
                        </Link>
                        <div className="sub">{[p.designation, p.manager_name ? `reviewed by ${p.manager_name}` : "no line manager set"].filter(Boolean).join(", ")}</div>
                      </td>
                      <td>{p.objectives || <StatusPill cls="leave" label="None" />}</td>
                      <td>
                        <Done done={p.self_done} />
                      </td>
                      <td>
                        <Done done={p.manager_done} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

/** H8b One person's appraisal, read-only for HR. */
export function AppraisalDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrAppraisal>(`/hr/performance/appraisals/${encodeURIComponent(id)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const a = res.data;
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(a)} skeleton="panel">
        {a ? (
          <div className="hr hr-view">
            <Crumbs items={[["Performance", "/hr/performance"], [a.cycle_name, `/hr/performance/cycles/${encodeURIComponent(a.cycle)}`], [a.employee_name]]} />
            <div className="hr-head">
              <div>
                <h2>Appraisal: {a.employee_name}</h2>
                <p>
                  {a.cycle_name}. {[a.designation, a.department].filter(Boolean).join(", ")}. Line manager: {a.manager_name ?? "not set"}.
                </p>
              </div>
              <div className="hr-head__r">
                <StepPill step={a.step} />
              </div>
            </div>
            <Banner kind="lock" title="Read-only for HR">
              The employee rates themselves, then the line manager. HR follows progress.
            </Banner>
            <Goals a={a} />
            <Criteria a={a} />
            {a.reflections ? (
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Reflections</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <p className="hr-pre">{a.reflections}</p>
                </div>
              </div>
            ) : null}
            {a.manager_feedback ? (
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Line manager's comment</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <p className="hr-pre">{a.manager_feedback}</p>
                </div>
              </div>
            ) : null}
            <NextStep title="Back to the cycle" to={`/hr/performance/cycles/${encodeURIComponent(a.cycle)}`} label="Open the cycle" />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
