import { useEffect } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import { DashboardCharts } from "../charts/DashboardCharts";
import { Icon, type IconName, ModuleHeader, type SummaryTile } from "@eswasaone/shared-ui";
import type { FinanceDashboard } from "../api/types";

/** Finance Dashboard — KPIs, traffic-light plan, and trend chart. */

/** A single annual-plan traffic-light row (derived from the contract). */
type PlanTrafficLight = NonNullable<FinanceDashboard["plan"]>[number];
type PlanStatus = PlanTrafficLight["status"];

const KPI_ICONS: IconName[] = ["i-dollar", "i-chart", "i-gauge"];
const KPI_COLORS = ["var(--green)", "var(--blue)", "var(--gold)"];

const STATUS_COLOR: Record<PlanStatus, string> = {
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
};

/** Convert a 0–100 progress percentage to a width string. Falls back to a
 * status-based heuristic when the contract doesn't carry a numeric ratio. */
function statusWidth(status: PlanStatus): string {
  if (status === "green") return "86%";
  if (status === "red") return "64%";
  return "75%";
}

export function FinanceDashboardView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<FinanceDashboard>(
    "/finance/kpis",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const plan: PlanTrafficLight[] = data?.plan ?? [];

  const tiles: SummaryTile[] = data
    ? [
        { label: "Revenue YTD", value: `E ${data.revenue_ytd_szl.toLocaleString()}`, variant: "ok" },
        { label: "Budget YTD", value: `E ${data.budget_ytd_szl.toLocaleString()}` },
        { label: "Variance", value: `${data.variance_pct.toFixed(1)}%`, variant: data.variance_pct >= 0 ? "ok" : "breach" },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="dashboard"
        label="Loading financials…"
      >
        {data ? (
        <>
          <ModuleHeader
            title="Finance dashboard"
            subtitle="KPIs, annual-plan traffic lights, and the variance trend."
            summary={tiles}
          />

          <section className="kpis">
            <div className="kpi">
              <div className="kpi__top">
                <span className="kpi__label">Revenue YTD</span>
                <span className="kpi__ic" style={{ background: KPI_COLORS[0] }}>
                  <Icon name={KPI_ICONS[0]} />
                </span>
              </div>
              <div className="kpi__val">E {data.revenue_ytd_szl.toLocaleString()}</div>
            </div>
            <div className="kpi">
              <div className="kpi__top">
                <span className="kpi__label">Budget YTD</span>
                <span className="kpi__ic" style={{ background: KPI_COLORS[1] }}>
                  <Icon name={KPI_ICONS[1]} />
                </span>
              </div>
              <div className="kpi__val">E {data.budget_ytd_szl.toLocaleString()}</div>
            </div>
            <div className="kpi">
              <div className="kpi__top">
                <span className="kpi__label">Variance</span>
                <span className="kpi__ic" style={{ background: KPI_COLORS[2] }}>
                  <Icon name={KPI_ICONS[2]} />
                </span>
              </div>
              <div className="kpi__val">{data.variance_pct.toFixed(1)}%</div>
            </div>
          </section>

          <div className="row c2">
            <div className="panel">
              <div className="panel__h">
                <div>
                  <h3>Annual Plan KPIs: Traffic Light</h3>
                  <p>Actual vs target across the strategic plan.</p>
                </div>
              </div>
              {plan.length === 0 ? (
                <p style={{ color: "var(--muted)", padding: 12 }}>
                  {/* TODO: wire real — Core returns plan rows once KPIs are configured. */}
                  No plan KPIs published yet.
                </p>
              ) : (
                <div className="tl">
                  {plan.map((row) => {
                    const color = STATUS_COLOR[row.status];
                    return (
                      <div key={row.key} className="tl__row">
                        <div className="tl__top">
                          <span>
                            {row.label} (Target: {row.target})
                          </span>
                          <span className="v">
                            {row.actual}
                            <span className="s" style={{ background: color }} />
                          </span>
                        </div>
                        <div className="tl__bar">
                          <div
                            className="tl__fill"
                            style={{ width: statusWidth(row.status), background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DashboardCharts months={data.months} variancePct={data.variance_pct} />
        </>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}