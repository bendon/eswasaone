import { useEffect } from "react";
import type { FinanceDashboard } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { DashboardCharts } from "../charts/DashboardCharts";
import { useInstitution } from "../layout/InstitutionLayout";

export function ReportsPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, error, authRequired, reload } = useApiResource<FinanceDashboard>(
    "/finance/kpis",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required for reports");
  }, [authRequired, openAuth]);

  return (
    <RequireStaff reason="Staff sign-in required for reports">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Executive charts. Deeper Insights live in Desk companions"
      />
      {loading ? (
        <LoadingState label="Loading charts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DashboardCharts months={data?.months} variancePct={data?.variance_pct} />
      )}
    </RequireStaff>
  );
}
