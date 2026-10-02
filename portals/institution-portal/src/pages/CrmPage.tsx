import { useEffect } from "react";
import type { CrmDealsResponse, CrmLeadsResponse, CrmPipeline } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";

export function CrmPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const pipeline = useApiResource<CrmPipeline>("/crm/pipeline", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const leads = useApiResource<CrmLeadsResponse>("/crm/leads", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const deals = useApiResource<CrmDealsResponse>("/crm/deals", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  useEffect(() => {
    if (pipeline.authRequired || leads.authRequired || deals.authRequired) {
      openAuth("Staff sign-in required for CRM");
    }
  }, [pipeline.authRequired, leads.authRequired, deals.authRequired, openAuth]);

  const loading = pipeline.loading || leads.loading || deals.loading;
  const error = pipeline.error || leads.error || deals.error;
  const retry = () => {
    pipeline.reload();
    leads.reload();
    deals.reload();
  };

  return (
    <RequireStaff reason="Staff sign-in required for CRM">
      {loading ? (
        <LoadingState label="Loading CRM…" />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !pipeline.data ? (
        <EmptyState title="No pipeline data" />
      ) : (
        <>
          <PageHeader
            title="CRM & Commercial"
            subtitle={`${pipeline.data.companies} companies in register`}
          />
          {!pipeline.data.stages?.length ? (
            <EmptyState title="No pipeline stages" />
          ) : (
            <section className="kpis" style={{ marginBottom: 24 }}>
              {pipeline.data.stages.map((s) => (
                <div key={s.name} className="kpi">
                  <div className="kpi__label">{s.name}</div>
                  <div className="kpi__val">{s.count}</div>
                </div>
              ))}
            </section>
          )}

          <div className="sec-label">Leads</div>
          {(leads.data?.items ?? []).length === 0 ? (
            <EmptyState title="No leads" detail="Leads will appear when Core returns them." />
          ) : (
            <div className="panel" style={{ marginBottom: 24 }}>
              <div className="act">
                {(leads.data?.items ?? []).map((lead) => (
                  <div key={lead.id} className="act__i">
                    <span className="act__d" style={{ background: "var(--gold)" }} />
                    <div>
                      <p>{lead.title}</p>
                      <span>
                        {lead.status}
                        {lead.organization ? ` · ${lead.organization}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sec-label">Deals</div>
          {(deals.data?.items ?? []).length === 0 ? (
            <EmptyState title="No deals" detail="Deals will appear when Core returns them." />
          ) : (
            <div className="panel">
              <div className="act">
                {(deals.data?.items ?? []).map((deal) => (
                  <div key={deal.id} className="act__i">
                    <span className="act__d" style={{ background: "var(--green)" }} />
                    <div>
                      <p>{deal.title}</p>
                      <span>
                        {deal.status}
                        {deal.amount != null ? ` · SZL ${deal.amount.toLocaleString()}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </RequireStaff>
  );
}
