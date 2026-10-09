import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrOrganisationOverview, HrSetupProgress } from "../api/types";
import { HeadcountChart } from "./HeadcountChart";
import {
  ATTENTION,
  AWAY_TODAY,
  ESTABLISHMENT,
  HEADCOUNT_SERIES,
  MOVEMENTS,
} from "./overviewMock";

/**
 * Overview — people cockpit (SoT: docs/mocks/eswasaone-hr.html).
 * Live GET /hr/organisation/overview drives KPI counts + setup banner;
 * attention / establishment / trends use typed mocks until contract endpoints exist.
 * // TODO: wire real — attention queue, away-today, payroll run snapshot, movements.
 */

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
  const navigate = useNavigate();
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

  const filled = counts?.employees ?? counts?.filled_positions ?? 86;
  const approved = useMemo(() => {
    const fromDepts = ESTABLISHMENT.reduce((s, d) => s + d.approved, 0);
    const vacant = counts?.vacant_positions ?? 10;
    const live = (counts?.filled_positions ?? filled) + vacant;
    return live > 0 ? live : fromDepts;
  }, [counts, filled]);
  const vacancies = Math.max(0, approved - filled);
  const estPct = approved > 0 ? Math.round((filled / approved) * 100) : 0;
  const maxPosts = Math.max(...ESTABLISHMENT.map((d) => d.approved));

  const asOf = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [],
  );

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
                  As at {asOf}. {filled} employees
                  {(counts?.departments ?? 0) > 0
                    ? ` in ${counts?.departments} departments`
                    : org?.legal_name
                      ? ` · ${org.legal_name}`
                      : ""}
                  .
                </p>
              </div>
              <div className="hr-head__r">
                <button type="button" className="btn ghost" disabled title="Coming soon">
                  Board HR pack
                </button>
                <Link to="/hr/directory" className="btn pri">
                  <Icon name="i-plus" />
                  Add employee
                </Link>
              </div>
            </div>

            {incomplete ? (
              <div className="hr-box hr-setup-banner" style={{ marginBottom: 16 }}>
                <div className="hr-box__h">
                  <div>
                    <h3>Structure setup incomplete</h3>
                    <p>
                      {setup
                        ? `${setup.steps_completed} of ${setup.steps_total} steps · ${Math.round(setup.completion_pct)}%`
                        : "Awaiting setup data"}
                      . Finish Structure before the cockpit numbers fully reflect the establishment.
                    </p>
                    <ul className="hr-setup-list" style={{ marginTop: 10 }}>
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
                  <Link to="/hr/structure" className="btn gold sm">
                    <Icon name="i-plus" />
                    Open Structure
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="kpis kpis--5" role="group" aria-label="People KPIs">
              <button type="button" className="kpi" onClick={() => navigate("/hr/structure")}>
                <span className="l">Headcount</span>
                <span className="v">
                  {filled} <small>of {approved} posts</small>
                </span>
                <span className="d">{estPct}% of the approved establishment</span>
              </button>
              <button type="button" className="kpi" onClick={() => navigate("/hr/recruitment")}>
                <span className="l">Vacancies</span>
                <span className="v">{vacancies}</span>
                <span className="d">4 in recruitment, 2 frozen, 4 not started</span>
              </button>
              <button type="button" className="kpi" onClick={() => navigate("/hr/time-off")}>
                <span className="l">Away today</span>
                <span className="v">{AWAY_TODAY.length}</span>
                <span className="d">3 on leave, 2 on field work</span>
              </button>
              <button type="button" className="kpi" onClick={() => navigate("/hr/directory")}>
                <span className="l">Turnover, 12 months</span>
                <span className="v">8.4%</span>
                <span className="d">7 leavers, 12 joiners</span>
              </button>
              <button type="button" className="kpi" onClick={() => navigate("/hr/directory")}>
                <span className="l">Ending in 60 days</span>
                <span className="v">5</span>
                <span className="d warn">3 contracts, 2 probations</span>
              </button>
            </div>

            <div className="hr-grid c2a">
              <div className="hr-stack">
                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Needs attention</h3>
                      <p>Ordered by the date something stops working</p>
                    </div>
                  </div>
                  <div className="hr-box__b flush">
                    <ul className="hr-attn">
                      {ATTENTION.map((item) => (
                        <li key={item.id}>
                          <span className={`hr-st ${item.tone}`}>
                            <span className="d" />
                            {item.when}
                          </span>
                          <div>
                            <b>{item.title}</b>
                            <span className="s">{item.detail}</span>
                          </div>
                          <button
                            type="button"
                            className="hr-lnk"
                            onClick={() => navigate(`/hr/${item.jump}`)}
                          >
                            {item.jumpLabel}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Establishment by department</h3>
                      <p>Filled posts against approved posts</p>
                    </div>
                    <Link to="/hr/structure" className="hr-lnk">
                      Open Structure
                    </Link>
                  </div>
                  <div className="hr-box__b">
                    <div className="hr-est">
                      {ESTABLISHMENT.map((d) => {
                        const vac = d.approved - d.filled;
                        return (
                          <div key={d.name} className="hr-est__row">
                            <span>{d.name}</span>
                            <div className="hr-est__bar">
                              <div
                                className="hr-est__track"
                                style={{ width: `${(d.approved / maxPosts) * 100}%` }}
                              >
                                <i style={{ width: `${(d.filled / d.approved) * 100}%` }} />
                              </div>
                            </div>
                            <span className="hr-est__n">
                              {d.filled} <small>of {d.approved}</small>
                            </span>
                            <span className={`hr-est__v${vac ? " has" : ""}`}>
                              {vac ? `${vac} vacant` : "Full"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="hr-key">
                      <span>
                        <i style={{ background: "var(--navy)" }} />
                        Filled
                      </span>
                      <span>
                        <i style={{ background: "var(--line)" }} />
                        Approved but vacant
                      </span>
                    </div>
                  </div>
                </div>

                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Headcount, last 12 months</h3>
                      <p>Employees on the payroll at month end</p>
                    </div>
                  </div>
                  <div className="hr-box__b">
                    <HeadcountChart series={HEADCOUNT_SERIES} />
                    <details className="hr-tblview">
                      <summary>Show as table</summary>
                      <table>
                        <tbody>
                          {HEADCOUNT_SERIES.map((p) => (
                            <tr key={p.label}>
                              <th>{p.label}</th>
                              <td>{p.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </div>
                </div>
              </div>

              <div className="hr-stack">
                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Away today</h3>
                      <p>
                        {AWAY_TODAY.length} of {filled}
                      </p>
                    </div>
                    <Link to="/hr/time-off" className="hr-lnk">
                      Calendar
                    </Link>
                  </div>
                  <div className="hr-box__b hr-out">
                    {AWAY_TODAY.map((p) => (
                      <div key={p.name} className="hr-out__i">
                        <span className="hr-av">{p.initials}</span>
                        <div>
                          <b>{p.name}</b>
                          <span className="s">{p.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>October payroll</h3>
                      <p>Pays Fri 23 Oct</p>
                    </div>
                    <span className="hr-st leave">
                      <span className="d" />
                      Step 2 of 6
                    </span>
                  </div>
                  <div className="hr-box__b hr-out">
                    <div className="hr-out__i">
                      <div>
                        <b>Changes to approve</b>
                        <span className="s">1 joiner, 1 promotion, 1 leaver</span>
                      </div>
                      <span className="r">3 waiting</span>
                    </div>
                    <div className="hr-out__i">
                      <div>
                        <b>Estimated gross</b>
                        <span className="s">1.7% above September</span>
                      </div>
                      <span className="r mono">E 2,412,600</span>
                    </div>
                    <div className="hr-out__i">
                      <div>
                        <b>Cut-off</b>
                        <span className="s">Changes after this go to November</span>
                      </div>
                      <span className="r">Tue 20 Oct</span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Link to="/hr/payroll" className="hr-lnk">
                        Open Payroll
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Movements in October</h3>
                      <p>Joiners, leavers and changes</p>
                    </div>
                  </div>
                  <div className="hr-box__b hr-out">
                    {MOVEMENTS.map((m) => (
                      <div key={m.name} className="hr-out__i">
                        <span className={`hr-st ${m.tone}`}>{m.label}</span>
                        <div>
                          <b>{m.name}</b>
                          <span className="s">{m.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Record quality</h3>
                      <p>What the other modules rely on</p>
                    </div>
                  </div>
                  <div className="hr-box__b hr-out">
                    <div className="hr-out__i">
                      <div>
                        <b>Linked to a portal login</b>
                        <span className="s">Without the link, approvals can&apos;t route to the person</span>
                      </div>
                      <span className="r">
                        {filled} of {filled}
                      </span>
                    </div>
                    <div className="hr-out__i">
                      <div>
                        <b>Line manager set</b>
                        <span className="s">Drives leave approval and the Team view</span>
                      </div>
                      <span className="r">
                        {filled} of {filled}
                      </span>
                    </div>
                    <div className="hr-out__i">
                      <div>
                        <b>Required documents on file</b>
                        <span className="s">ID, contract, qualifications</span>
                      </div>
                      <span className="r">
                        {Math.max(0, filled - 9)} of {filled}
                      </span>
                    </div>
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
