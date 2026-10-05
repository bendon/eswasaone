import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { FinanceSettings } from "../api/types";

/** Finance department configuration checklist (Company, CoA, Pastel stub). */
export function FinanceSettingsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const settings = useApiResource<FinanceSettings>("/finance/settings", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  useEffect(() => {
    if (settings.authRequired) openAuth("Staff sign-in required for finance");
  }, [settings.authRequired, openAuth]);

  if (settings.loading && !settings.data) {
    return <LoadingState label="Loading finance settings…" />;
  }
  if (settings.error && !settings.data) {
    return <ErrorState message={settings.error} onRetry={settings.reload} />;
  }

  const data = settings.data;
  const steps = data?.steps ?? [];

  return (
    <div className="panel">
      <PageHeader
        title="Finance settings"
        subtitle="Company, chart of accounts, cost centres, and ledger integrations for the Finance department."
      />

      {!data?.company_id ? (
        <>
          <EmptyState
            title="Company profile required"
            detail="Create the organisation Company under System Administration → Company before Finance masters can be configured."
          />
          <p style={{ marginTop: 12 }}>
            <Link className="btn gold" to="/admin?tab=company">
              Open Company profile
            </Link>
          </p>
        </>
      ) : (
        <div className="stat-row" style={{ marginBottom: 20 }}>
          <div className="stat">
            <span className="stat__l">Company</span>
            <strong className="stat__v">{data.company_name || data.company_id}</strong>
          </div>
          <div className="stat">
            <span className="stat__l">Currency</span>
            <strong className="stat__v">{data.default_currency || "—"}</strong>
          </div>
          <div className="stat">
            <span className="stat__l">Country</span>
            <strong className="stat__v">{data.country || "—"}</strong>
          </div>
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
        {steps.map((step) => (
          <li
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <Icon name={step.done ? "i-check-c" : "i-warn"} size={18} />
            <div style={{ flex: 1 }}>
              <strong>{step.label}</strong>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {step.done ? "Configured" : "Not configured yet"}
                {step.id === "pastel" ? " (Sage Pastel ledger link, spec §7.4)" : null}
                {step.id === "payments" ? " (online payments / EFT, spec §7.4)" : null}
              </div>
            </div>
            {step.href ? (
              <Link className="btn ghost sm" to={step.href}>
                Configure
              </Link>
            ) : (
              <span style={{ color: "var(--muted)", fontSize: 12 }}>Coming soon</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
