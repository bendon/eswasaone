import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon, NotConnectedPanel } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrAttentionItem, HrLiveOverview, HrOrganisationOverview } from "../api/types";
import { fmtDay, StatusPill } from "../me/parts";

/**
 * Overview (H0) — people cockpit. Counts from GET /hr/organisation/overview; needs attention, establishment,
 * away today, movements and record quality from GET /hr/overview/live (eswasa_hr.overview). No invented
 * numbers: when the live overview can't be reached those panels say so. Payroll is out of scope here.
 * Setup lives in System Administration → HR setup.
 */

function dueLabel(item: HrAttentionItem, today: string): { cls: string; label: string } {
  if (!item.due) return { cls: "mute", label: "Open" };
  if (item.due < today) return { cls: "bad", label: "Overdue" };
  if (item.due === today) return { cls: "leave", label: "Today" };
  return { cls: "info", label: fmtDay(item.due) };
}

function NeedsAttention({ live }: { live: HrLiveOverview }) {
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Needs attention</h3>
          <p>What HR has to act on, soonest first</p>
        </div>
      </div>
      {live.attention.length ? (
        <ul className="hr-attn">
          {live.attention.map((a) => {
            const st = dueLabel(a, live.as_of);
            return (
              <li key={`${a.kind}:${a.title}`}>
                <StatusPill cls={st.cls} label={st.label} />
                <div>
                  <b>{a.title}</b>
                  {a.detail ? <span className="s">{a.detail}</span> : null}
                </div>
                <Link className="hr-lnk" to={a.href}>
                  Open
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="hr-box__b">
          <p className="hr-note" style={{ margin: 0 }}>
            Nothing needs HR right now.
          </p>
        </div>
      )}
    </div>
  );
}

function Establishment({ live }: { live: HrLiveOverview }) {
  const est = live.establishment;
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Establishment by department</h3>
          <p>{est.has_plans && est.totals ? `${est.totals.filled} of ${est.totals.approved} approved posts filled` : "Filled against approved posts"}</p>
        </div>
        <Link to="/hr/structure?tab=establishment" className="hr-lnk">
          Open Structure
        </Link>
      </div>
      <div className="hr-box__b">
        {est.has_plans ? (
          <div className="hr-est">
            {est.departments.map((d) => {
              const pct = d.approved ? Math.min(100, Math.round((d.filled / d.approved) * 100)) : 0;
              return (
                <div className="hr-est__row" key={d.department}>
                  <span>{d.department}</span>
                  <span className="hr-est__track" role="img" aria-label={`${d.filled} of ${d.approved} posts filled`}>
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <span className="hr-est__n">
                    {d.filled} <small>/ {d.approved}</small>
                  </span>
                  <span className={`hr-est__v${d.vacant ? " has" : ""}`}>{d.vacant ? `${d.vacant} vacant` : "None vacant"}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="hr-note" style={{ margin: 0 }}>
            No approved establishment yet. It comes from ESWASA's submitted staffing plans.
          </p>
        )}
      </div>
    </div>
  );
}

function Side({ live }: { live: HrLiveOverview }) {
  return (
    <>
      <div className="hr-box">
        <div className="hr-box__h">
          <div>
            <h3>Away today</h3>
            <p>{live.away_today.length ? `${live.away_today.length} on approved leave` : "No one is on approved leave"}</p>
          </div>
          <Link to="/hr/time-off" className="hr-lnk">
            Time off
          </Link>
        </div>
        {live.away_today.length ? (
          <ul className="hr-attn">
            {live.away_today.map((a) => (
              <li key={`${a.employee}:${a.leave_type}`}>
                <span className="s">{a.leave_type ?? "Leave"}</span>
                <b>{a.employee_name ?? a.employee}</b>
                <span className="s">{a.back_on ? `Back ${fmtDay(a.back_on)}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="hr-box">
        <div className="hr-box__h">
          <div>
            <h3>Movements</h3>
            <p>Last 90 days</p>
          </div>
        </div>
        <div className="hr-box__b">
          <dl className="hr-kv">
            <div>
              <dt>Joined</dt>
              <dd>{live.movements.joiners}</dd>
            </div>
            <div>
              <dt>Left</dt>
              <dd>{live.movements.leavers}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="hr-box">
        <div className="hr-box__h">
          <div>
            <h3>Record quality</h3>
            <p>Active records missing what approvals and self-service need</p>
          </div>
          <Link to="/hr/directory" className="hr-lnk">
            Directory
          </Link>
        </div>
        <div className="hr-box__b">
          {live.record_quality.length ? (
            <dl className="hr-kv">
              {live.record_quality.map((g) => (
                <div key={g.field}>
                  <dt>{g.label}</dt>
                  <dd>{g.count}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="hr-note" style={{ margin: 0 }}>
              Every active record has a department, designation, line manager, leave approver and login.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export function HrSummaryView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const overview = useApiResource<HrOrganisationOverview>("/hr/organisation/overview", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const liveRes = useApiResource<HrLiveOverview>("/hr/overview/live", { enabled: Boolean(user), refreshKey: sessionKey });
  const live = liveRes.data;

  useEffect(() => {
    if (overview.authRequired) openAuth("Staff sign-in required");
  }, [overview.authRequired, openAuth]);

  const data = overview.data;
  const counts = data?.counts;
  const employees = counts?.employees ?? 0;
  const departments = counts?.departments ?? 0;
  const vacancies = live?.establishment.totals?.vacant ?? counts?.vacant_positions ?? 0;
  const filled = counts?.filled_positions ?? employees;
  const approved = live?.establishment.totals?.approved ?? filled + vacancies;
  const estPct = approved > 0 ? Math.round((filled / approved) * 100) : 0;
  const ending = live ? (live.ending_soon.contracts ?? 0) + (live.ending_soon.probations ?? 0) : null;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={overview.loading}
        refreshing={overview.refreshing}
        error={overview.error}
        onRetry={overview.reload}
        hasData={data != null}
        skeleton="dashboard"
        label="Loading organisation overview…"
      >
        {data ? (
          <div className="hr">
            <div className="hr-head">
              <div>
                <h2>People overview</h2>
                <p>
                  {employees > 0
                    ? `${employees} active employee${employees === 1 ? "" : "s"}${
                        departments ? ` in ${departments} department${departments === 1 ? "" : "s"}` : ""
                      }.`
                    : "HR is not set up yet — no employee records are linked."}
                </p>
              </div>
              <div className="hr-head__r">
                <Link to="/hr/directory" className="btn pri">
                  <Icon name="i-plus" />
                  Add employee
                </Link>
              </div>
            </div>

            {employees === 0 ? (
              <div className="hr-box" style={{ marginBottom: 16 }}>
                <div className="hr-box__h">
                  <div>
                    <h3>HR isn&apos;t set up yet</h3>
                    <p>
                      Portal users can sign in, but there are no Employee records. Approvals routing,
                      the Team view, leave and Field Visit guards need those links. Finish master data
                      and the employee import under System Administration.
                    </p>
                  </div>
                  <Link to="/system-admin?tab=hr-setup" className="btn gold sm">
                    Open HR setup
                  </Link>
                </div>
              </div>
            ) : (
              <div className="kpis kpis--5" role="group" aria-label="People KPIs">
                <div className="kpi">
                  <span className="l">Headcount</span>
                  <span className="v">
                    {filled}
                    {approved > filled ? <small> of {approved} posts</small> : null}
                  </span>
                  <span className="d">
                    {approved > 0 && approved !== filled
                      ? `${estPct}% of the approved establishment`
                      : "Active employees"}
                  </span>
                </div>
                <Link to="/hr/recruitment" className="kpi">
                  <span className="l">Vacancies</span>
                  <span className="v">{vacancies}</span>
                  <span className="d">{live?.establishment.has_plans ? "Approved, unfrozen and unfilled" : "From designations / staffing plan"}</span>
                </Link>
                <Link to="/hr/time-off" className="kpi">
                  <span className="l">Away today</span>
                  <span className="v">{live ? live.away_today.length : "—"}</span>
                  <span className="d">{live ? "On approved leave" : "Live overview not reachable"}</span>
                </Link>
                <div className="kpi">
                  <span className="l">Turnover, 12 months</span>
                  <span className="v">{live?.turnover.pct != null ? `${live.turnover.pct}%` : "—"}</span>
                  <span className="d">{live ? `${live.turnover.leavers} left, ${live.turnover.joiners} joined` : "Live overview not reachable"}</span>
                </div>
                <Link to="/hr/directory" className="kpi">
                  <span className="l">Ending in 60 days</span>
                  <span className="v">{ending ?? "—"}</span>
                  <span className="d">Contracts and probations</span>
                </Link>
              </div>
            )}

            <div className="hr-grid c2a">
              <div className="hr-stack">
                {live ? (
                  <>
                    <NeedsAttention live={live} />
                    <Establishment live={live} />
                  </>
                ) : (
                  <NotConnectedPanel
                    what="Needs attention · establishment"
                    detail={
                      liveRes.loading
                        ? "Loading the live overview…"
                        : "The live overview (GET /hr/overview/live) can't be reached, so these panels stay closed rather than show invented numbers."
                    }
                  />
                )}
              </div>
              <div className="hr-stack">
                {live ? <Side live={live} /> : null}
                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Structure</h3>
                      <p>
                        {departments === 0
                          ? "No ESWASA departments loaded yet (ERPNext install fixtures are hidden)."
                          : `${departments} department${departments === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <Link to="/hr/structure" className="hr-lnk">
                      Open Structure
                    </Link>
                  </div>
                  <div className="hr-box__b">
                    <Link to="/system-admin?tab=hr-setup" className="hr-lnk">
                      HR setup checklist
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
