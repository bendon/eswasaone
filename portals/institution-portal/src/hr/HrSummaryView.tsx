import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrOrganisationOverview, HrSetupProgress } from "../api/types";

/** Overview — live GET /hr/organisation/overview only (no fixture fallbacks). */

const SETUP_STEPS: { key: keyof HrSetupProgress; label: string }[] = [
  { key: "has_profile", label: "Organisation profile" },
  { key: "has_departments", label: "Departments" },
  { key: "has_designations", label: "Designations" },
  { key: "has_locations", label: "Locations" },
  { key: "has_grades", label: "Grade bands" },
  { key: "has_cost_centres", label: "Cost centres" },
  { key: "has_employees", label: "First employee" },
];

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
  const org = data?.organisation ?? null;
  const setup = data?.setup;
  const counts = data?.counts;
  const incomplete =
    !org ||
    !setup ||
    setup.completion_pct < 100 ||
    (counts?.departments ?? 0) === 0 ||
    (counts?.employees ?? 0) === 0;

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
            <section className="hr-org-hero" aria-label="Organisation profile">
              <div className="hr-org-hero__main">
                <div className="hr-org-hero__mark" aria-hidden>
                  <Icon name="i-layers" />
                </div>
                <div>
                  <p className="hr-org-hero__eyebrow">Organisation</p>
                  <h3>{org?.legal_name ?? "Organisation not configured"}</h3>
                  <p>
                    {org
                      ? [
                          org.sector,
                          org.registration_number ? `Reg. ${org.registration_number}` : null,
                          org.founded_year ? `Est. ${org.founded_year}` : null,
                          org.primary_location?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ") ||
                        org.registered_address ||
                        "Profile on file. Continue structure setup below."
                      : "Create the Company profile and structure before onboarding people. Numbers stay at zero until records exist."}
                  </p>
                </div>
              </div>
              <div className="hr-setup-card">
                <div className="hr-setup-card__top">
                  <div>
                    <h4>Setup progress</h4>
                    <p>
                      {setup
                        ? `${setup.steps_completed} of ${setup.steps_total} steps`
                        : "Awaiting setup data"}
                    </p>
                  </div>
                  <span className={`hr-st ${setup && setup.completion_pct >= 100 ? "ok" : "leave"}`}>
                    <span className="d" />
                    {setup ? `${Math.round(setup.completion_pct)}%` : "0%"}
                  </span>
                </div>
                <div className="hr-prog" aria-hidden>
                  <i style={{ width: `${Math.min(100, Math.max(0, setup?.completion_pct ?? 0))}%` }} />
                </div>
                <ul className="hr-setup-list">
                  {SETUP_STEPS.map((step) => {
                    const done = Boolean(setup?.[step.key]);
                    return (
                      <li key={step.key} className={done ? "done" : undefined}>
                        <span className="hr-setup-list__mark" aria-hidden>
                          {done ? "✓" : "·"}
                        </span>
                        {step.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            {incomplete ? (
              <div className="hr-box hr-setup-banner" style={{ marginBottom: 16 }}>
                <div className="hr-box__h">
                  <div>
                    <h3>Structure setup incomplete</h3>
                    <p>
                      Counts reflect what is set up so far. Add departments and
                      designations first, then locations, grades, and your first employee record.
                    </p>
                  </div>
                  <Link to="/hr/structure" className="btn gold sm">
                    <Icon name="i-plus" />
                    Open Structure
                  </Link>
                </div>
              </div>
            ) : null}

            <section className="kpis kpis--5" aria-label="Organisation KPIs">
              <div className="kpi">
                <div className="l">Departments</div>
                <div className="v">{(counts?.departments ?? 0).toLocaleString()}</div>
                <div className="d">{(counts?.departments ?? 0) ? "active units" : "none yet"}</div>
              </div>
              <div className="kpi">
                <div className="l">Designations</div>
                <div className="v">{(counts?.designations ?? 0).toLocaleString()}</div>
                <div className="d">
                  {(counts?.vacant_positions ?? 0) > 0
                    ? `${counts?.vacant_positions} vacant slots`
                    : (counts?.designations ?? 0)
                      ? "roles defined"
                      : "none yet"}
                </div>
              </div>
              <div className="kpi">
                <div className="l">Employee records</div>
                <div className="v">{(counts?.employees ?? 0).toLocaleString()}</div>
                <div className="d">
                  {(counts?.filled_positions ?? 0) > 0
                    ? `${counts?.filled_positions} positions filled`
                    : "none onboarded yet"}
                </div>
              </div>
              <div className="kpi">
                <div className="l">Locations</div>
                <div className="v">{(counts?.locations ?? 0).toLocaleString()}</div>
                <div className="d">
                  {(counts?.cost_centres ?? 0) > 0
                    ? `${counts?.cost_centres} cost centres`
                    : "branches / sites"}
                </div>
              </div>
              <div className="kpi">
                <div className="l">Payroll readiness</div>
                <div
                  className="v"
                  style={{
                    fontSize: data.payroll.ready ? 22 : 16,
                    color: data.payroll.ready ? "var(--green)" : "var(--amber)",
                  }}
                >
                  {data.payroll.label || (data.payroll.ready ? "Ready" : "Not ready")}
                </div>
                <div className={`d ${data.payroll.ready ? "up" : "warn"}`}>
                  {data.payroll.reason || (data.payroll.ready ? "structure + people in place" : "setup incomplete")}
                </div>
              </div>
            </section>

            <div className="hr-box" style={{ marginBottom: 16 }}>
              <div className="hr-box__h">
                <div>
                  <h3>Departments</h3>
                  <p>
                    {(counts?.departments ?? 0) === 0
                      ? "No departments yet. Add the first unit in Structure"
                      : `${counts?.departments} department${counts?.departments === 1 ? "" : "s"}`}
                  </p>
                </div>
                <Link to="/hr/structure?tab=departments" className="btn ghost sm">
                  Manage
                </Link>
              </div>
              <div className="hr-box__b">
                {data.departments.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    No departments yet. Add one under Structure to organise the Authority.
                  </p>
                ) : (
                  <div className="hr-dept-grid">
                    {data.departments.map((d) => (
                      <article key={d.id} className="hr-dept-card">
                        <header>
                          <b>{d.name}</b>
                          {d.code ? <span className="mono">{d.code}</span> : null}
                        </header>
                        <dl>
                          <div>
                            <dt>Head</dt>
                            <dd>{d.head?.name || "Unassigned"}</dd>
                          </div>
                          <div>
                            <dt>Designations</dt>
                            <dd>{d.designation_count}</dd>
                          </div>
                          <div>
                            <dt>Filled / positions</dt>
                            <dd>
                              {d.filled_count}
                              {d.total_positions ? ` / ${d.total_positions}` : ""}
                            </dd>
                          </div>
                          {d.cost_centre ? (
                            <div>
                              <dt>Cost centre</dt>
                              <dd>{d.cost_centre.name}</dd>
                            </div>
                          ) : null}
                        </dl>
                        <span className={`hr-st ${d.status === "active" ? "ok" : "leave"}`}>
                          <span className="d" />
                          {d.status}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="hr-box" style={{ marginBottom: 16 }}>
              <div className="hr-box__h">
                <div>
                  <h3>Designations</h3>
                  <p>
                    Preview of {data.designations_preview.length}
                    {data.designations_total > data.designations_preview.length
                      ? ` (of ${data.designations_total})`
                      : ""}{" "}
                    roles
                  </p>
                </div>
                <Link to="/hr/structure?tab=designations" className="btn ghost sm">
                  View all
                </Link>
              </div>
              <div className="hr-box__b" style={{ paddingTop: 0, overflowX: "auto" }}>
                {data.designations_preview.length === 0 ? (
                  <p style={{ margin: "14px 0 0", color: "var(--muted)", fontSize: 13 }}>
                    No designations yet. Add roles under Structure → Designations.
                  </p>
                ) : (
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Department</th>
                        <th>Grade</th>
                        <th>Filled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.designations_preview.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <b style={{ fontWeight: 700 }}>{row.title}</b>
                            {row.code ? (
                              <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
                                {row.code}
                              </div>
                            ) : null}
                          </td>
                          <td>{row.department?.name || "—"}</td>
                          <td>{row.grade_band?.code || row.grade_band?.name || "—"}</td>
                          <td>
                            {row.filled}
                            {row.total != null ? ` / ${row.total}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="hr-grid c2" style={{ marginBottom: 16 }}>
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Locations</h3>
                    <p>{(counts?.locations ?? 0) === 0 ? "No branches yet" : `${counts?.locations} sites`}</p>
                  </div>
                </div>
                <div className="hr-box__b hr-out">
                  {data.locations.length === 0 ? (
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                      Add HQ or lab locations in Structure.
                    </p>
                  ) : (
                    data.locations.map((loc) => (
                      <div key={loc.id} className="hr-out__i">
                        <span className="hr-av" aria-hidden>
                          <Icon name="i-pin" />
                        </span>
                        <div>
                          <b style={{ display: "block", fontSize: 13.5 }}>{loc.name}</b>
                          <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
                            {[loc.type, loc.code].filter(Boolean).join(" · ") || loc.address || "—"}
                          </span>
                        </div>
                        <span className="r">{loc.employee_count} staff</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Cost centres</h3>
                    <p>
                      {(counts?.cost_centres ?? 0) === 0
                        ? "None configured"
                        : `${counts?.cost_centres} centres`}
                    </p>
                  </div>
                </div>
                <div className="hr-box__b hr-out">
                  {data.cost_centres.length === 0 ? (
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                      Cost centres unlock payroll allocation and department linking.
                    </p>
                  ) : (
                    data.cost_centres.map((cc) => (
                      <div key={cc.id} className="hr-out__i">
                        <span className="hr-av" aria-hidden>
                          <Icon name="i-bank" />
                        </span>
                        <div>
                          <b style={{ display: "block", fontSize: 13.5 }}>{cc.name}</b>
                          <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
                            {cc.code || cc.finance_account_code || cc.status}
                          </span>
                        </div>
                        <span className="r">{cc.employee_count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Next steps</h3>
                  <p>Finish structure before scaling Directory and payroll</p>
                </div>
              </div>
              <div className="hr-box__b">
                <ol className="hr-next-steps">
                  {!setup?.has_grades ? (
                    <li>
                      <Link to="/hr/structure?tab=grades">Define grade bands</Link>
                      <span>Salary bands for designations and payroll readiness.</span>
                    </li>
                  ) : null}
                  {!setup?.has_cost_centres ? (
                    <li>
                      <Link to="/hr/structure?tab=cost-centres">Add cost centres</Link>
                      <span>Link departments to finance for reporting.</span>
                    </li>
                  ) : null}
                  {!setup?.has_employees ? (
                    <li>
                      <Link to="/hr/directory">Create the first employee</Link>
                      <span>Portal logins are not the same as employee records until you onboard staff.</span>
                    </li>
                  ) : null}
                  {!setup?.has_departments ? (
                    <li>
                      <Link to="/hr/structure?tab=departments">Add a department</Link>
                      <span>Org units are the backbone of designations and people.</span>
                    </li>
                  ) : null}
                  {!setup?.has_designations ? (
                    <li>
                      <Link to="/hr/structure?tab=designations">Add a designation</Link>
                      <span>Roles with optional approved headcount.</span>
                    </li>
                  ) : null}
                  {setup?.has_grades &&
                  setup.has_cost_centres &&
                  setup.has_employees &&
                  setup.has_departments &&
                  setup.has_designations ? (
                    <li>
                      <Link to="/hr/directory">Review Directory</Link>
                      <span>Structure is in place. Manage people and leave next.</span>
                    </li>
                  ) : null}
                </ol>
              </div>
            </div>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
