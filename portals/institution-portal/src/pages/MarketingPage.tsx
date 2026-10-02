import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { MarketingCampaignsResponse } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";

/** Marketing rail — campaigns from Core `/marketing/campaigns`. */
export function MarketingPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  // Contract path exists; Core BFF may still be landing — fail loudly on 502.
  const campaigns = useApiResource<MarketingCampaignsResponse>("/marketing/campaigns", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  useEffect(() => {
    if (campaigns.authRequired) openAuth("Staff sign-in required for marketing");
  }, [campaigns.authRequired, openAuth]);

  return (
    <RequireStaff reason="Staff sign-in required for marketing">
      <PageHeader title="Marketing" subtitle="Campaigns, outreach, and public messaging" />

      {campaigns.loading ? (
        <LoadingState label="Loading campaigns…" />
      ) : campaigns.error ? (
        <ErrorState message={campaigns.error} onRetry={campaigns.reload} />
      ) : (campaigns.data?.items ?? []).length === 0 ? (
        <EmptyState
          title="No campaigns"
          detail="Campaign list is empty. Create campaigns in Desk when ready."
        />
      ) : (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="act">
            {(campaigns.data?.items ?? []).map((c) => (
              <div key={c.id} className="act__i">
                <span className="act__d" style={{ background: "var(--gold)" }} />
                <div>
                  <p>{c.title}</p>
                  <span>
                    {c.id} · {c.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>Related rails</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <Link className="btn-primary" to="/crm" style={{ textDecoration: "none" }}>
            Open CRM pipeline
          </Link>
          <Link className="btn-ghost" to="/standards" style={{ textDecoration: "none" }}>
            Standards catalogue
          </Link>
          <Link className="btn-ghost" to="/lms" style={{ textDecoration: "none" }}>
            Training / LMS
          </Link>
        </div>
      </div>
    </RequireStaff>
  );
}
