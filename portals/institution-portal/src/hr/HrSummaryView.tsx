import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon, NotConnectedPanel } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrOrganisationOverview } from "../api/types";

/**
 * Overview — people cockpit (SoT mock + brief §12).
 * Live GET /hr/organisation/overview for counts. Needs-attention / establishment /
 * movements wait on GET /hr/overview (Orchestrator). No invented sample numbers.
 * Setup checklist lives in System Administration → HR setup.
 */

export function HrSummaryView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const overview = useApiResource<HrOrganisationOverview>("/hr/organisation/overview", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  useEffect(() => {
    if (overview.authRequired) openAuth("Staff sign-in required");
  }, [overview.authRequired, openAuth]);

  const data = overview.data;
  const counts = data?.counts;
  const employees = counts?.employees ?? 0;
  const departments = counts?.departments ?? 0;
  const vacancies = counts?.vacant_positions ?? 0;
  const filled = counts?.filled_positions ?? employees;
  const approved = filled + vacancies;
  const estPct = approved > 0 ? Math.round((filled / approved) * 100) : 0;

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
                    {approved > 0
                      ? `${estPct}% of the approved establishment`
                      : "Active employees"}
                  </span>
                </div>
                <Link to="/hr/recruitment" className="kpi">
                  <span className="l">Vacancies</span>
                  <span className="v">{vacancies}</span>
                  <span className="d">From designations / staffing plan</span>
                </Link>
                <Link to="/hr/time-off" className="kpi">
                  <span className="l">Away today</span>
                  <span className="v">—</span>
                  <span className="d">Needs GET /hr/overview</span>
                </Link>
                <div className="kpi">
                  <span className="l">Turnover, 12 months</span>
                  <span className="v">—</span>
                  <span className="d">Needs GET /hr/overview</span>
                </div>
                <Link to="/hr/directory" className="kpi">
                  <span className="l">Ending in 60 days</span>
                  <span className="v">—</span>
                  <span className="d">Contracts and probations</span>
                </Link>
              </div>
            )}

            <div className="hr-grid c2a">
              <div className="hr-stack">
                <NotConnectedPanel
                  what="Needs attention"
                  detail="Ordered work queue (cover gaps, payroll changes, probation, authorisations) needs GET /hr/overview from Core. Until then this panel stays closed so invented numbers never appear live."
                />
                <NotConnectedPanel
                  what="Establishment by department"
                  detail="Filled vs approved posts come from Staffing Plan once GET /hr/establishment is wired. Structure still shows live departments."
                />
              </div>
              <div className="hr-stack">
                <NotConnectedPanel
                  what="Away today · payroll · movements · record quality"
                  detail="These cards need GET /hr/overview (away, payroll run step, joiners/leavers, integrity counts). Use Time off, Payroll and Directory for what is already live."
                />
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
