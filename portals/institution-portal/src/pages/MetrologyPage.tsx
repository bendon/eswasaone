import { useEffect } from "react";
import type { MetrologyJobSummary } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";

type JobsResponse = { items?: MetrologyJobSummary[] };

export function MetrologyPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, error, authRequired, reload } = useApiResource<JobsResponse>(
    "/metrology/jobs",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required for metrology");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  return (
    <RequireStaff reason="Staff sign-in required for metrology">
      {loading ? (
        <LoadingState label="Loading metrology jobs…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !items.length ? (
        <EmptyState title="No calibration jobs" detail="LIMS queue is empty." />
      ) : (
        <>
          <PageHeader title="Metrology & LIMS" subtitle={`${items.length} jobs`} />
          <div className="panel">
            <div className="act">
              {items.map((j) => (
                <div key={j.id} className="act__i">
                  <span className="act__d" style={{ background: "var(--teal)" }} />
                  <div>
                    <p>
                      {j.instrument} ({j.id})
                    </p>
                    <span>
                      {j.status}
                      {j.customer ? ` · ${j.customer}` : ""}
                      {j.due_date ? ` · due ${j.due_date}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </RequireStaff>
  );
}
