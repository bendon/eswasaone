import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrEmployeesResponse, HrOnboarding, HrOnboardingActivity, HrOnboardingDefaults } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill } from "../../me/parts";

const DONE = new Set(["Completed", "Cancelled"]);

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="hr-prog" style={{ height: 10 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${done} of ${total} done`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Joiners and their onboarding progress (H7 list). Live GET /hr/onboarding. */
export function OnboardingList() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ items: HrOnboarding[] }>("/hr/onboarding", { enabled: Boolean(user), refreshKey: sessionKey });
  const items = res.data?.items ?? [];
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <div className="hr-head">
          <div>
            <h2>Joiners</h2>
            <p>Onboarding progress for people hired through Recruitment.</p>
          </div>
        </div>
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)}>
          {items.length ? (
            <div className="hr-box hr-scroll">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Joiner</th>
                    <th>Starts</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="hr-lnk" to={`/hr/onboarding/${encodeURIComponent(o.id)}`}>
                          {o.employee_name}
                        </Link>
                        <div className="sub">{[o.designation, o.department].filter(Boolean).join(", ")}</div>
                      </td>
                      <td>{fmtDay(o.date_of_joining, true)}</td>
                      <td style={{ minWidth: 140 }}>
                        <Progress done={o.done} total={o.total} />
                        <div className="sub">
                          {o.done} of {o.total} done
                        </div>
                      </td>
                      <td>
                        <StatusPill cls={o.boarding_status === "Completed" ? "ok" : "info"} label={o.boarding_status ?? "Pending"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No one is onboarding" detail="Onboarding starts after a hire is created from an accepted offer." />
          )}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

/** Start onboarding: the default checklist with an owner for every task (never a role pool). */
export function StartOnboarding() {
  const [params] = useSearchParams();
  const employee = params.get("employee") ?? "";
  const { user, sessionKey } = useInstitution();
  const def = useApiResource<HrOnboardingDefaults>(`/hr/onboarding/defaults?employee=${encodeURIComponent(employee)}`, { enabled: Boolean(user && employee), refreshKey: sessionKey });
  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user), refreshKey: sessionKey });
  const [rows, setRows] = useState<HrOnboardingActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [started, setStarted] = useState<HrOnboarding | null>(null);

  useEffect(() => {
    if (def.data) setRows(def.data.activities.map((a) => ({ activity_name: a.activity_name, user: a.user ?? "", group: a.group })));
  }, [def.data]);

  const staff = (people.data?.items ?? []).filter((p) => p.user_id);
  const missing = rows.filter((r) => !r.user).length;

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      setStarted(
        await apiFetch<HrOnboarding>("/hr/onboarding", {
          method: "POST",
          body: JSON.stringify({ employee, activities: rows.map((r) => ({ activity_name: r.activity_name, user: r.user })), confirm: true }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not started. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (started) {
    return (
      <div className="hr hr-view hr-view--form">
        <Crumbs items={[["Joiners", "/hr/onboarding"], [started.employee_name]]} />
        <div className="hr-head">
          <div>
            <h2>Onboarding started</h2>
            <p>
              {started.employee_name}. {started.total} tasks, each in its owner's Approvals.
            </p>
          </div>
        </div>
        <NextStep title="Owners tick their tasks off" body="You'll see progress here. The joiner sees their own tasks in My HR." to={`/hr/onboarding/${encodeURIComponent(started.id)}`} label="Open checklist" />
      </div>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={def.loading || people.loading} error={def.error || people.error} onRetry={() => { def.reload(); people.reload(); }} hasData={Boolean(def.data)} skeleton="panel">
        {def.data ? (
          <div className="hr hr-view hr-view--form">
            <Crumbs items={[["Joiners", "/hr/onboarding"], ["Start onboarding"]]} />
            <div className="hr-head">
              <div>
                <h2>Start onboarding: {def.data.employee_name}</h2>
                <p>Starts {fmtDay(def.data.date_of_joining, true)}. Give every task a named owner; each gets it in their Approvals.</p>
              </div>
            </div>
            {!def.data.job_offer ? (
              <Banner kind="lock" title="No accepted offer">Onboarding starts from an accepted offer. This person wasn't hired through Recruitment.</Banner>
            ) : null}
            {!def.data.has_login ? (
              <Banner kind="warn" title={`${def.data.employee_name} has no portal login yet`}>
                Link one in Directory first, or give their tasks to someone else for now.
              </Banner>
            ) : null}
            <div className="hr-box hr-scroll">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Area</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.activity_name}>
                      <td>
                        <b>{r.activity_name}</b>
                      </td>
                      <td className="sub">{r.group}</td>
                      <td>
                        <select
                          className="hr-in"
                          aria-label={`Owner for ${r.activity_name}`}
                          value={r.user ?? ""}
                          onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))}
                        >
                          <option value="">Choose…</option>
                          {staff.map((p) => (
                            <option key={p.id} value={p.user_id!}>
                              {p.employee_name}
                            </option>
                          ))}
                          {r.user && !staff.some((p) => p.user_id === r.user) ? <option value={r.user}>{r.user}</option> : null}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err ? (
              <Banner kind="bad" title="Not started">
                {err}
              </Banner>
            ) : null}
            <div className="hr-actions">
              <Link className="btn ghost" to="/hr/onboarding">
                Cancel
              </Link>
              <button type="button" className="btn pri" disabled={busy || missing > 0 || !def.data.job_offer} onClick={() => void start()}>
                {busy ? "Starting…" : missing ? `${missing} task${missing === 1 ? "" : "s"} need an owner` : "Start onboarding"}
              </button>
            </div>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

/** H7 One joiner's checklist. HR or a task's owner marks it done. */
export function OnboardingDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrOnboarding>(`/hr/onboarding/${encodeURIComponent(id)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrOnboarding | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (res.data) setD(res.data);
  }, [res.data]);

  async function done(task: string) {
    setErr(null);
    try {
      const next = await apiFetch<HrOnboarding>(`/hr/onboarding/tasks/${encodeURIComponent(task)}/done`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      if (next && "activities" in next) setD(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not saved.");
    }
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Joiners", "/hr/onboarding"], [d.employee_name]]} />
            <div className="hr-head">
              <div>
                <h2>Onboarding: {d.employee_name}</h2>
                <p>
                  {[d.designation, d.department].filter(Boolean).join(", ")}. Starts {fmtDay(d.date_of_joining, true)}.
                </p>
              </div>
            </div>
            <Progress done={d.done} total={d.total} />
            <p className="hr-note">
              {d.done} of {d.total} done. Each task is in its owner's Approvals, under Tasks.
            </p>
            {err ? (
              <Banner kind="bad" title="Not saved">
                {err}
              </Banner>
            ) : null}
            <Checklist activities={d.activities} onDone={(t) => void done(t)} canTick />
            {d.boarding_status === "Completed" ? (
              <Banner kind="ok" title="Onboarding complete">Probation tracking continues from the employee record.</Banner>
            ) : (
              <NextStep title={`Waiting on ${d.total - d.done} task${d.total - d.done === 1 ? "" : "s"}`} body="Owners get reminders; overdue tasks show on HR Overview." />
            )}
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

export function Checklist({
  activities,
  onDone,
  canTick,
  links,
}: {
  activities: HrOnboardingActivity[];
  onDone: (task: string) => void;
  canTick: boolean | ((a: HrOnboardingActivity) => boolean);
  links?: Record<string, string>;
}) {
  return (
    <div className="hr-box">
      <div className="hr-box__b">
        <div className="hr-out">
          {activities.map((a) => {
            const isDone = DONE.has(a.status ?? "");
            const tick = typeof canTick === "function" ? canTick(a) : canTick;
            const link = links?.[a.activity_name];
            return (
              <div className="hr-out__i" key={a.activity_name}>
                <div>
                  <b style={isDone ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{a.activity_name}</b>
                  <span className="s">{a.user_name ?? a.user ?? "No owner"}</span>
                </div>
                <span className="r">
                  {isDone ? (
                    <StatusPill cls="ok" label="Done" />
                  ) : link ? (
                    <Link className="btn pri sm" to={link}>
                      Start
                    </Link>
                  ) : tick && a.task ? (
                    <button type="button" className="btn ghost sm" onClick={() => onDone(a.task!)}>
                      Mark done
                    </button>
                  ) : (
                    <StatusPill cls="leave" label="To do" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
