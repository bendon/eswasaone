import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrAttentionItem, HrLiveOverview } from "../api/types";
import { fmtDay, StatusPill } from "../me/parts";
import { StaffingOverview } from "./StaffingOverview";

/**
 * Overview (H0) — people cockpit, all from GET /hr/overview/live (eswasa_hr.overview): headcount, department
 * staffing, needs attention, away today, movements and record quality. Windows (movements, turnover, ending soon)
 * come with the data. When it can't be read the page shows the error, never zeros.
 * Setup lives in System Administration → HR setup.
 */

function dueLabel(item: HrAttentionItem, today: string): { cls: string; label: string } | null {
  if (!item.due) return null;
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
                {st ? <StatusPill cls={st.cls} label={st.label} /> : <span />}
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

function NoEstablishment() {
  return (
    <div className="hr-box" style={{ marginBottom: 16 }}>
      <div className="hr-box__h">
        <div>
          <h3>Department staffing</h3>
          <p>No approved establishment yet. It comes from ESWASA's submitted staffing plans.</p>
        </div>
        <Link to="/hr/structure?tab=establishment" className="hr-lnk">
          Open Structure
        </Link>
      </div>
    </div>
  );
}

/** Additions plan 08: service milestones this month and next. Hidden when none fall due; says so while ESWASA
 * hasn't set the years (A8). */
export function MilestonesBox({ live }: { live: HrLiveOverview }) {
  const years = live.milestone_years ?? [];
  const items = live.milestones ?? [];
  if (years.length && !items.length) return null;
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Service milestones</h3>
          <p>{years.length ? "This month and next" : "Milestone years not set (awaiting ESWASA A8)"}</p>
        </div>
      </div>
      {items.length ? (
        <ul className="hr-attn">
          {items.map((m) => (
            <li key={`${m.employee}:${m.years}`}>
              <span className="s">{m.years} years</span>
              <b>{m.name ?? m.employee}</b>
              <span className="s">{fmtDay(m.date)}</span>
            </li>
          ))}
        </ul>
      ) : null}
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
            {live.windows?.movement_days ? <p>Last {live.windows.movement_days} days</p> : null}
          </div>
        </div>
        <div className="hr-box__b">
          <dl className="hr-kv stat">
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
            <dl className="hr-kv stat">
              {live.record_quality.map((g) => (
                <div key={g.field}>
                  <dt>{g.label}</dt>
                  <dd>{g.count}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="hr-note" style={{ margin: 0 }}>
              No gaps in active employee records{live.record_checked_on ? ` (checked ${fmtDay(live.record_checked_on)})` : ""}.
            </p>
          )}
        </div>
      </div>
      <MilestonesBox live={live} />
    </>
  );
}

export function HrSummaryView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const liveRes = useApiResource<HrLiveOverview>("/hr/overview/live", { enabled: Boolean(user), refreshKey: sessionKey });
  const live = liveRes.data;

  useEffect(() => {
    if (liveRes.authRequired) openAuth("Staff sign-in required");
  }, [liveRes.authRequired, openAuth]);

  const employees = live?.headcount ?? 0;
  const departments = live?.departments ?? 0;
  const totals = live?.establishment.totals ?? null;
  const estPct = totals && totals.approved > 0 ? Math.round((totals.filled / totals.approved) * 100) : null;
  const w = live?.windows ?? {};
  const ending =
    live && live.ending_soon.contracts != null && live.ending_soon.probations != null ? live.ending_soon.contracts + live.ending_soon.probations : null;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={liveRes.loading}
        refreshing={liveRes.refreshing}
        error={liveRes.error}
        onRetry={liveRes.reload}
        hasData={live != null}
        skeleton="dashboard"
        label="Loading the people overview…"
      >
        {live ? (
          <div className="hr">
            <div className="hr-head">
              <div>
                <h2>People overview</h2>
                <p>
                  {employees > 0
                    ? `${employees} active employee${employees === 1 ? "" : "s"}${
                        departments ? ` in ${departments} department${departments === 1 ? "" : "s"}` : ""
                      }.`
                    : "No active employee records yet."}
                </p>
              </div>
              <div className="hr-head__r">
                <Link to="/hr/bulk" className="btn ghost">
                  Bulk actions
                </Link>
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
                    <h3>No employees yet</h3>
                    <p>
                      Approvals routing, the Team view, leave and Field Visit guards need Employee records linked to
                      logins. Import them, or add people one by one in the Directory.
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
                    {employees}
                    {totals && totals.approved > employees ? <small> of {totals.approved} posts</small> : null}
                  </span>
                  <span className="d">{estPct != null ? `${estPct}% of the approved establishment` : "Active employees"}</span>
                </div>
                <Link to="/hr/recruitment" className="kpi">
                  <span className="l">Vacancies</span>
                  <span className="v">{totals ? totals.vacant : "—"}</span>
                  <span className="d">{totals ? "Approved, unfrozen and unfilled" : "No submitted staffing plan"}</span>
                </Link>
                <Link to="/hr/time-off" className="kpi">
                  <span className="l">Away today</span>
                  <span className="v">{live.away_today.length}</span>
                  <span className="d">On approved leave</span>
                </Link>
                <div className="kpi">
                  <span className="l">Turnover{w.turnover_days ? `, ${w.turnover_days} days` : ""}</span>
                  <span className="v">{live.turnover.pct != null ? `${live.turnover.pct}%` : "—"}</span>
                  <span className="d">{`${live.turnover.leavers} left, ${live.turnover.joiners} joined`}</span>
                </div>
                <Link to="/hr/directory" className="kpi">
                  <span className="l">Ending soon</span>
                  <span className="v">{ending ?? "—"}</span>
                  <span className="d">
                    {w.contract_notice_days && w.probation_notice_days
                      ? `Contracts in ${w.contract_notice_days} days, probations in ${w.probation_notice_days}`
                      : "Contracts and probations"}
                  </span>
                </Link>
              </div>
            )}

            {employees > 0 ? live.establishment.has_plans ? <StaffingOverview live={live} /> : <NoEstablishment /> : null}

            <div className="hr-grid c2a">
              <div className="hr-stack">
                <NeedsAttention live={live} />
              </div>
              <div className="hr-stack">
                <Side live={live} />
                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Structure</h3>
                      <p>
                        {departments === 0
                          ? "No departments with active staff yet."
                          : `${departments} department${departments === 1 ? "" : "s"} with active staff`}
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
