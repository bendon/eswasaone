import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import { DashboardCharts } from "../charts/DashboardCharts";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import type {
  FinanceDashboard,
  FinanceRevenueResponse,
  FinanceBudgetResponse,
} from "../api/types";

/** Finance Reports — revenue breakdown and budget vs actual tables.

 * Fetches three contract endpoints in parallel: `/finance/revenue`,
 * `/finance/budget`, and `/finance/kpis` (the last only to source the
 * monthly series for the mini trend chart). Tables use the shared
 * `cert-listwrap` + `cert-table` styles; summary cards use `kpis`. */

const KPI_ICONS: IconName[] = ["i-dollar", "i-chart", "i-gauge"];
const KPI_COLORS = ["var(--green)", "var(--blue)", "var(--gold)"];

/** Format a Swazi Lilangeni amount with the `E ` prefix. */
function fmtMoney(n?: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `E ${n.toLocaleString()}`;
}

/** Variance % colour: positive (under budget) = green, negative (over) = red. */
function varianceColor(pct?: number): string {
  if (pct == null || Number.isNaN(pct)) return "var(--muted)";
  return pct >= 0 ? "var(--green)" : "var(--red)";
}

function fmtPct(pct?: number): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function FinanceReportsView() {
  const { openAuth, user, sessionKey } = useInstitution();

  const revenue = useApiResource<FinanceRevenueResponse>("/finance/revenue", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const budget = useApiResource<FinanceBudgetResponse>("/finance/budget", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  // Third fetch — only used to source the monthly series for the mini chart.
  const kpis = useApiResource<FinanceDashboard>("/finance/kpis", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  useEffect(() => {
    if (revenue.authRequired || budget.authRequired || kpis.authRequired) {
      openAuth("Staff sign-in required");
    }
  }, [revenue.authRequired, budget.authRequired, kpis.authRequired, openAuth]);

  const [flash, setFlash] = useState<string | null>(null);

  function exportPdf() {
    // TODO: wire real — POST /reports/finance/export to render a PDF pack.
    setFlash("PDF export — TODO");
  }

  const loading = revenue.loading || budget.loading;
  const error = revenue.error ?? budget.error;
  const reload = () => {
    revenue.reload();
    budget.reload();
  };

  const revenueItems = revenue.data?.items ?? [];
  const budgetItems = budget.data?.items ?? [];

  const revenueTotal = useMemo(
    () => revenueItems.reduce((s, l) => s + (l.amount ?? 0), 0),
    [revenueItems],
  );
  const budgetTotal = useMemo(
    () => budgetItems.reduce((s, l) => s + (l.budget ?? 0), 0),
    [budgetItems],
  );
  const actualTotal = useMemo(
    () => budgetItems.reduce((s, l) => s + (l.actual ?? 0), 0),
    [budgetItems],
  );

  return (
    <RequireStaff reason="Staff sign-in required">
      {loading ? (
        <LoadingState label="Loading finance reports…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <div className="cert-head">
            <div>
              <h2>Finance Reports</h2>
              <p>Revenue breakdown and budget vs actual across cost centres.</p>
            </div>
            <div className="r">
              <button type="button" className="btn ghost" onClick={exportPdf}>
                <Icon name="i-download" />
                Export PDF
              </button>
            </div>
          </div>

          {flash ? (
            <p className="tagpill" style={{ marginBottom: 12, display: "inline-block" }}>
              {flash}
            </p>
          ) : null}

          <section className="kpis">
            <div className="kpi">
              <div className="kpi__top">
                <span className="kpi__label">Revenue Total</span>
                <span className="kpi__ic" style={{ background: KPI_COLORS[0] }}>
                  <Icon name={KPI_ICONS[0]} />
                </span>
              </div>
              <div className="kpi__val">{fmtMoney(revenueTotal)}</div>
            </div>
            <div className="kpi">
              <div className="kpi__top">
                <span className="kpi__label">Budget Total</span>
                <span className="kpi__ic" style={{ background: KPI_COLORS[1] }}>
                  <Icon name={KPI_ICONS[1]} />
                </span>
              </div>
              <div className="kpi__val">{fmtMoney(budgetTotal)}</div>
            </div>
            <div className="kpi">
              <div className="kpi__top">
                <span className="kpi__label">Actual Spend</span>
                <span className="kpi__ic" style={{ background: KPI_COLORS[2] }}>
                  <Icon name={KPI_ICONS[2]} />
                </span>
              </div>
              <div className="kpi__val">{fmtMoney(actualTotal)}</div>
            </div>
          </section>

          {/* Revenue breakdown */}
          <div className="panel" style={{ borderRadius: 14, marginBottom: 16 }}>
            <div className="panel__h">
              <div>
                <h3>Revenue Breakdown</h3>
                <p>Recognised revenue by line, with period.</p>
              </div>
            </div>
            {revenueItems.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                detail="Revenue lines will appear once the backend is populated."
              />
            ) : (
              <div className="cert-listwrap" style={{ borderRadius: 14 }}>
                <table className="cert-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Amount</th>
                      <th>Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueItems.map((line, i) => (
                      <tr key={line.id ?? i}>
                        <td style={{ fontWeight: 700 }}>{line.label}</td>
                        <td>{fmtMoney(line.amount)}</td>
                        <td style={{ color: "var(--muted)" }}>{line.period ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Total</td>
                      <td style={{ fontWeight: 800 }}>{fmtMoney(revenueTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Budget vs actual */}
          <div className="panel" style={{ borderRadius: 14, marginBottom: 16 }}>
            <div className="panel__h">
              <div>
                <h3>Budget vs Actual</h3>
                <p>Category-level budget, actual, and variance.</p>
              </div>
            </div>
            {budgetItems.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                detail="Budget lines will appear once the backend is populated."
              />
            ) : (
              <div className="cert-listwrap" style={{ borderRadius: 14 }}>
                <table className="cert-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Budget</th>
                      <th>Actual</th>
                      <th>Variance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetItems.map((line, i) => (
                      <tr key={line.id ?? i}>
                        <td style={{ fontWeight: 700 }}>{line.label}</td>
                        <td>{fmtMoney(line.budget)}</td>
                        <td>{fmtMoney(line.actual)}</td>
                        <td style={{ color: varianceColor(line.variance_pct), fontWeight: 700 }}>
                          {fmtPct(line.variance_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Total</td>
                      <td style={{ fontWeight: 800 }}>{fmtMoney(budgetTotal)}</td>
                      <td style={{ fontWeight: 800 }}>{fmtMoney(actualTotal)}</td>
                      <td style={{ fontWeight: 800, color: varianceColor(budgetTotal ? (actualTotal - budgetTotal) / budgetTotal * 100 : undefined) }}>
                        {fmtPct(budgetTotal ? (actualTotal - budgetTotal) / budgetTotal * 100 : undefined)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Mini trend chart from /finance/kpis months — if available. */}
          {kpis.error ? (
            <p className="tagpill" style={{ display: "inline-block" }}>
              Trend chart unavailable — {kpis.error}
            </p>
          ) : kpis.loading ? (
            <LoadingState label="Loading trend chart…" />
          ) : (
            <DashboardCharts
              months={kpis.data?.months ?? null}
              variancePct={kpis.data?.variance_pct ?? null}
              showOpsLine={false}
            />
          )}
        </>
      )}
    </RequireStaff>
  );
}