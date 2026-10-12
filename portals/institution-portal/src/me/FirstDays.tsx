import { useEffect, useState } from "react";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrOnboarding } from "../api/types";
import { Checklist } from "../hr/onboarding/Onboarding";
import { Banner, Crumbs, fmtDay, NextStep } from "./parts";

const DECLARATION = "Sign the impartiality and confidentiality declaration";

/** E10 First days: the new joiner's own checklist while onboarding is open. Live GET /hr/me/onboarding. */
export function FirstDays() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ onboarding: HrOnboarding | null }>("/hr/me/onboarding", { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrOnboarding | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (res.data) setD(res.data.onboarding);
  }, [res.data]);

  async function done(task: string) {
    setErr(null);
    try {
      const next = await apiFetch<HrOnboarding>(`/hr/onboarding/tasks/${encodeURIComponent(task)}/done`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      if (next && "activities" in next) setD(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not saved.");
    }
  }

  const mine = d?.activities.filter((a) => a.mine) ?? [];
  const others = d?.activities.filter((a) => !a.mine) ?? [];
  const nextMine = mine.find((a) => a.status !== "Completed" && a.status !== "Cancelled");

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(res.data)}>
      <div className="hr-view">
        <Crumbs items={[["My HR", "/me"], ["First days"]]} />
        {d ? (
          <>
            <div className="hr-head">
              <div>
                <h2>Welcome to ESWASA, {d.employee_name.split(" ")[0]}</h2>
                <p>
                  {[d.designation, d.department].filter(Boolean).join(", ")}. You start {fmtDay(d.date_of_joining, true)}
                  {d.line_manager ? `; your line manager is ${d.line_manager}` : ""}.
                </p>
              </div>
            </div>
            <h3 style={{ margin: 0 }}>Your checklist</h3>
            <Checklist activities={mine} onDone={(t) => void done(t)} canTick={(a) => a.activity_name !== DECLARATION} links={{ [DECLARATION]: "/me/declaration" }} />
            {err ? (
              <Banner kind="bad" title="Not saved">
                {err}
              </Banner>
            ) : null}
            <h3 style={{ margin: 0 }}>Being set up for you</h3>
            <Checklist activities={others} onDone={() => undefined} canTick={false} />
            {nextMine ? (
              nextMine.activity_name === DECLARATION ? (
                <NextStep title="Sign your declaration first" body="Until you sign, you can't be assigned to audits. About 3 minutes." to="/me/declaration" label="Sign now" />
              ) : (
                <NextStep title={nextMine.activity_name} body="Mark it done when you've finished." />
              )
            ) : (
              <NextStep title="You're all set" body="Anything still open is with the people setting you up." to="/me" label="Back to My HR" />
            )}
          </>
        ) : (
          <EmptyState title="No onboarding open" detail="This page shows your checklist in your first weeks at ESWASA." />
        )}
      </div>
    </ResourceGate>
  );
}
