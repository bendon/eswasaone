import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <PageSkeleton label={label} variant="panel" />;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="panel" style={{ padding: 24, textAlign: "center" }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {detail ? <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>{detail}</p> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel" style={{ padding: 24, borderColor: "var(--red)" }}>
      <h3 style={{ margin: 0, color: "var(--red)" }}>Something went wrong</h3>
      <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, extra }: { title: string; subtitle?: string; extra?: ReactNode }) {
  return (
    <div className="panel__h" style={{ marginBottom: 16, padding: 0, border: 0 }}>
      <div>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {subtitle ? <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>{subtitle}</p> : null}
      </div>
      {extra}
    </div>
  );
}

export type SkeletonVariant = "panel" | "list" | "dashboard" | "kpis";

/** Layout-matching placeholder — never a blank white hole. */
export function PageSkeleton({
  label = "Loading…",
  variant = "list",
}: {
  label?: string;
  variant?: SkeletonVariant;
}) {
  if (variant === "kpis") {
    return (
      <div className="sk sk--kpis" aria-busy="true" aria-label={label}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk__kpi">
            <div className="sk__line sk__line--sm" />
            <div className="sk__line sk__line--lg" />
            <div className="sk__line sk__line--md" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "dashboard") {
    return (
      <div className="sk sk--dash" aria-busy="true" aria-label={label}>
        <div className="sk__banner" />
        <PageSkeleton variant="kpis" label={label} />
        <div className="sk__row">
          <div className="sk__panel sk__panel--tall" />
          <div className="sk__panel" />
        </div>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="sk sk--list" aria-busy="true" aria-label={label}>
        <div className="sk__head">
          <div className="sk__line sk__line--title" />
          <div className="sk__line sk__line--md" />
        </div>
        <div className="sk__tiles">
          {[0, 1, 2].map((i) => (
            <div key={i} className="sk__tile" />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="sk__row-item">
            <div className="sk__avatar" />
            <div className="sk__row-copy">
              <div className="sk__line sk__line--md" />
              <div className="sk__line sk__line--sm" />
            </div>
          </div>
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div className="sk sk--panel panel" aria-busy="true" aria-label={label}>
      <div className="sk__line sk__line--title" />
      <div className="sk__line sk__line--md" />
      <div className="sk__line sk__line--lg" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

type ResourceGateProps = {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Soft reload — keep children visible */
  refreshing?: boolean;
  /** True when we already have paintable data (skip full-page skeleton) */
  hasData?: boolean;
  skeleton?: SkeletonVariant;
  label?: string;
  children: ReactNode;
};

/**
 * Enforces skeleton → error → content. Soft refresh never blanks the page.
 */
export function ResourceGate({
  loading,
  error,
  onRetry,
  refreshing = false,
  hasData = false,
  skeleton = "list",
  label = "Loading…",
  children,
}: ResourceGateProps) {
  if (loading && !hasData) {
    return <PageSkeleton label={label} variant={skeleton} />;
  }

  if (error && !hasData) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  return (
    <div className={`resource-gate${refreshing ? " is-refreshing" : ""}`}>
      {refreshing ? (
        <div className="resource-gate__bar" role="status">
          Updating…
        </div>
      ) : null}
      {error && hasData ? (
        <div className="resource-gate__stale" role="status">
          <span>{error}</span>
          {onRetry ? (
            <button type="button" className="btn ghost sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
