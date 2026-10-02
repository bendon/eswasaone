import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { ClaimsPane } from "./ClaimsPane";
import { parseMeTab } from "./helpers";
import { LeavePane } from "./LeavePane";
import { PayslipsPane } from "./PayslipsPane";
import { ProfilePane } from "./ProfilePane";
import { ME_TAB_LABELS, ME_TABS, type MeTab } from "./types";

/**
 * Employee self-service — Leave | Payslips | Claims | Profile.
 * Supports `?tab=leave|pay|claims|profile` from Home quick actions.
 */
export function MeScreen() {
  const [params, setParams] = useSearchParams();
  const tab = parseMeTab(params.get("tab"));
  const { user, openAuth } = useAuth();
  const refreshKey = user?.username ?? "guest";

  const setTab = useCallback(
    (t: MeTab) => {
      const next = new URLSearchParams(params);
      next.set("tab", t);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const onAuthRequired = useCallback(
    (reason?: string) => {
      openAuth({ title: "Sign in to Field", reason });
    },
    [openAuth],
  );

  if (!user) {
    return (
      <section className="field-screen me-screen">
        <h1 className="field-screen__title">Me</h1>
        <p className="field-muted">Sign in to view leave, payslips, and claims.</p>
      </section>
    );
  }

  return (
    <section className="field-screen me-screen">
      <div className="me-seg" role="tablist" aria-label="Me sections">
        {ME_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "on" : undefined}
            onClick={() => setTab(t)}
          >
            {ME_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "leave" ? (
        <LeavePane enabled refreshKey={refreshKey} onAuthRequired={onAuthRequired} />
      ) : null}
      {tab === "pay" ? (
        <PayslipsPane enabled refreshKey={refreshKey} onAuthRequired={onAuthRequired} />
      ) : null}
      {tab === "claims" ? <ClaimsPane onAuthRequired={onAuthRequired} /> : null}
      {tab === "profile" ? (
        <ProfilePane
          user={user}
          enabled
          refreshKey={refreshKey}
          onAuthRequired={onAuthRequired}
        />
      ) : null}
    </section>
  );
}
