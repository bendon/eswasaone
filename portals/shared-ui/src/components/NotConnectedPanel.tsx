/**
 * Shared "not available yet" panel — shown when VITE_DEMO_MODE=false and the
 * feature's Core Engine endpoint isn't wired yet. Every screen that reads from
 * a prototype local store must route through ResourceGate so it can never
 * silently show an empty table or a form that submits into nothing.
 */
import type { ReactNode } from "react";
import { Icon } from "../icons/Icon";
import type { StoreResource } from "../store/localStore";

/* ---------------- panel ---------------- */

export function NotConnectedPanel({
  what = "This screen",
  audience = "staff",
  detail,
}: {
  what?: string;
  audience?: "staff" | "public";
  detail?: string;
}) {
  const staffDetail =
    detail ??
    "This module still needs its live Core Engine endpoint. Certification applications, CRM deals and metrology jobs are wired; cases, clients, field visits and standards work items are not yet.";
  const publicDetail =
    "This service isn't connected to ESWASA's system yet. Please email info@eswasa.co.sz or call (+268) 2518 4633 and we'll help you.";
  return (
    <div className="crm-empty" role="status" aria-live="polite">
      <Icon name="i-link" />
      <b>{what} isn't available yet</b>
      <p>{audience === "staff" ? staffDetail : publicDetail}</p>
    </div>
  );
}

/* ---------------- gate ---------------- */

/**
 * Unified gate for any StoreResource. Renders:
 * 1. Loading skeleton while data is still arriving.
 * 2. NotConnectedPanel when the prototype store is off and no live endpoint exists.
 * 3. Error banner on fetch failure.
 * 4. "Not found" when data resolved to null/undefined without error.
 * 5. children(data) when data is available.
 *
 * Replaces both institution-portal's `Gate` and `CrmGate` — they do the same thing.
 */
export function ResourceGate<T>({
  res,
  what,
  skeleton = "list",
  audience = "staff",
  notConnectedDetail,
  children,
}: {
  res: StoreResource<T>;
  what: string;
  skeleton?: "list" | "dashboard" | "panel" | "kpis";
  audience?: "staff" | "public";
  notConnectedDetail?: string;
  children: (data: NonNullable<T>) => ReactNode;
}) {
  if (res.loading && res.data === undefined) {
    return <LoadingFallback label={`Loading ${what.toLowerCase()}…`} variant={skeleton} />;
  }
  if (res.notConnected) {
    return <NotConnectedPanel what={what} audience={audience} detail={notConnectedDetail} />;
  }
  if (res.error) {
    return (
      <div className="crm-banner crm-banner--err" role="alert">
        {res.error}
      </div>
    );
  }
  if (res.data === undefined || res.data === null) {
    return (
      <div className="crm-banner crm-banner--err" role="alert">
        {what} not found.
      </div>
    );
  }
  return <>{children(res.data as NonNullable<T>)}</>;
}

/* ---------------- lightweight loading fallback ---------------- */

function LoadingFallback({
  label,
  variant,
}: {
  label: string;
  variant: "list" | "dashboard" | "panel" | "kpis";
}) {
  // Inline skeleton — avoids importing the institution-portal PageStates component
  // (which lives in a portal, not shared-ui).
  if (variant === "dashboard" || variant === "kpis") {
    return (
      <div style={{ padding: 24 }} aria-busy="true">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="crm-kpi"
              style={{ opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }}
            >
              <div className="crm-kpi__l">{label}</div>
              <div className="crm-kpi__v">—</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (variant === "panel") {
    return (
      <div className="panel" style={{ padding: 24, textAlign: "center" }} aria-busy="true">
        <p style={{ margin: 0, color: "var(--muted)" }}>{label}</p>
      </div>
    );
  }
  // list
  return (
    <div style={{ padding: 24 }} aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            height: 48,
            marginBottom: 8,
            borderRadius: 6,
            background: "var(--slate-100, #f1f5f9)",
            opacity: 0.6,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- hook for non-gate screens ---------------- */

/**
 * For screens that use res.data ?? [] inline (not through a Gate).
 * Returns { data, notConnected, error } so the screen can check
 * notConnected and render the panel itself before touching data.
 */
export function useResourceState<T>(res: StoreResource<T>): {
  data: T | undefined;
  notConnected: boolean;
  error: string | null;
  loading: boolean;
  NotConnected: ReactNode | null;
} {
  const notConnected = res.notConnected ? (
    <NotConnectedPanel what="This screen" />
  ) : null;
  return {
    data: res.data,
    notConnected: res.notConnected,
    error: res.error,
    loading: res.loading,
    NotConnected: notConnected,
  };
}