import type { ReactNode } from "react";
import { useEffect } from "react";
import { useInstitution } from "../layout/InstitutionLayout";

/** Soft staff gate — opens AuthModal; shows sign-in panel until session exists. */
export function RequireStaff({
  children,
  reason = "Staff sign-in required for this module",
}: {
  children: ReactNode;
  reason?: string;
}) {
  const { user, openAuth } = useInstitution();

  useEffect(() => {
    if (!user) openAuth(reason);
  }, [user, openAuth, reason]);

  if (!user) {
    return (
      <div className="panel" style={{ padding: 28, maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Sign in required</h3>
        <p style={{ color: "var(--muted)" }}>
          Institution modules use your staff session. Sign in to load live queues and KPIs.
        </p>
        <button type="button" className="btn-primary" onClick={() => openAuth(reason)}>
          Sign in
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
