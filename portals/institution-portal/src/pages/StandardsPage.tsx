import { useEffect } from "react";
import type { StandardSummary } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";

type StandardsResponse = { items?: StandardSummary[] };

export function StandardsPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, error, authRequired, reload } = useApiResource<StandardsResponse>(
    "/standards",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required for standards");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  return (
    <RequireStaff reason="Staff sign-in required for standards">
      {loading ? (
        <LoadingState label="Loading standards…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !items.length ? (
        <EmptyState title="No standards found" detail="Catalogue is empty or filtered out." />
      ) : (
        <>
          <PageHeader title="Standards development" subtitle={`${items.length} records`} />
          <div className="panel">
            <div className="act">
              {items.map((s) => (
                <div key={s.code} className="act__i">
                  <span className="act__d" style={{ background: "var(--navy)" }} />
                  <div>
                    <p>
                      {s.code}: {s.title}
                    </p>
                    <span>
                      {[s.sector, s.status].filter(Boolean).join(" · ") || "—"}
                      {s.buy_url ? " · e-store linked" : ""}
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
