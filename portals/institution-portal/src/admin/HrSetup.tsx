import { Link } from "react-router-dom";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrSetupStatus, HrSetupStepState } from "../api/types";
import { deskUrl } from "../hr/desk";
import { Banner, StatusPill } from "../me/parts";
import { ImportEmployees, MasterDataLoad } from "./HrImport";

/**
 * HR setup (H14, System Administration). Each step is worked out from live counts by eswasa_hr.overview:
 * done, partly done, to do, waiting for an ESWASA input (Confirmation Pack / brief §0.5), or excluded
 * (payroll, until ESWASA answers H15). Each step links to the screen that does the work; nothing here
 * invents ESWASA's departments, posts or policies.
 */

const STATE: Record<HrSetupStepState, { cls: string; label: string }> = {
  done: { cls: "ok", label: "Done" },
  partial: { cls: "leave", label: "Partly done" },
  todo: { cls: "info", label: "To do" },
  awaiting: { cls: "mute", label: "Awaiting ESWASA" },
  excluded: { cls: "mute", label: "Excluded" },
};

function StepLink({ href, desk }: { href?: string | null; desk: boolean }) {
  if (!href) return null;
  if (!desk) {
    return (
      <Link className="hr-lnk" to={href}>
        Open
      </Link>
    );
  }
  const url = deskUrl(href);
  return url ? (
    <a className="hr-lnk" href={url} target="_blank" rel="noreferrer">
      Open in Desk
    </a>
  ) : (
    <span className="hr-note">In Desk (ask the system administrator)</span>
  );
}

export function HrSetup() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrSetupStatus>("/hr/setup/status", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
      {d ? (
        <div className="hr hr-view">
          <div className="hr-head">
            <div>
              <h2>HR setup</h2>
              <p>
                {d.done} of {d.total} steps done. Steps waiting for ESWASA can't be finished until ESWASA supplies them; nothing is filled in on
                ESWASA's behalf.
              </p>
            </div>
            <div className="hr-head__r">
              <Link className="btn ghost" to="/hr">
                Open HR & People
              </Link>
            </div>
          </div>
          <div className="hr-box">
            <div className="hr-prog" style={{ margin: "14px 18px 6px" }} role="progressbar" aria-valuenow={d.pct} aria-valuemin={0} aria-valuemax={100} aria-label="HR setup progress">
              <i style={{ width: `${d.pct}%` }} />
            </div>
            <ol className="hr-attn">
              {d.steps.map((s, i) => {
                const st = STATE[s.state];
                return (
                  <li key={s.id}>
                    <StatusPill cls={st.cls} label={st.label} />
                    <div>
                      <b>
                        {i + 1}. {s.title}
                      </b>
                      <span className="s">
                        {s.detail}
                        {s.awaiting ? ` ESWASA input: ${s.awaiting}.` : ""}
                      </span>
                    </div>
                    <StepLink href={s.href} desk={s.desk} />
                  </li>
                );
              })}
            </ol>
          </div>
          <ImportEmployees />
          {(user?.roles ?? []).some((r) => r === "System Manager" || r === "Administrator") ? <MasterDataLoad /> : null}
          {d.steps.some((s) => s.id === "payroll" && s.state === "excluded") ? (
            <Banner kind="info" title="Payroll is out of scope for now">
              Whether payroll runs in EswasaOne or stays in the current system waits on ESWASA (Confirmation Pack H15); statutory tables come from
              Finance (H16).
            </Banner>
          ) : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}
