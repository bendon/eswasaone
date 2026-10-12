import { Link, useParams } from "react-router-dom";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrRequisition } from "../../api/types";
import { Crumbs, fmtDay, StatusPill, Track } from "../../me/parts";
import { FUNNEL, STATUS } from "./RequisitionsView";

/**
 * One requisition (H6a after sending): head of department first, then each HR Manager, decided in Approvals
 * (plan 08). Live GET /hr/recruitment/requisitions/{name}; who is being waited on comes from the server.
 */
export function RequisitionDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrRequisition>(`/hr/recruitment/requisitions/${encodeURIComponent(id)}`, { enabled: Boolean(user && id), refreshKey: sessionKey });
  const r = res.data;
  const s = r ? (STATUS[r.status] ?? { cls: "mute", label: r.status }) : null;
  const pending = r?.status === "Pending";

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(r)}>
      {r && s ? (
        <div className="hr-view">
          <Crumbs items={[["Recruitment", "/hr/recruitment"], [r.designation]]} />
          <div className="hr-head">
            <div>
              <h2>{r.designation}</h2>
              <p>
                {[r.department, r.id].filter(Boolean).join(" · ")}
                {r.requested_by ? `. Raised by ${r.requested_by}` : ""}
                {r.posting_date ? ` on ${fmtDay(r.posting_date, true)}` : ""}
                {r.expected_by ? `, wanted by ${fmtDay(r.expected_by, true)}` : ""}.
              </p>
            </div>
            <div className="hr-head__r">
              <StatusPill cls={s.cls} label={s.label} />
            </div>
          </div>
          <div className="hr-box">
            <div className="hr-box__b">
              <Track
                steps={[
                  { title: "Raised", state: "done" },
                  { title: "Head of department approves", detail: pending && r.stage === "Head" ? `Waiting on ${r.waiting_on ?? "the head"} in Approvals` : undefined, state: pending ? (r.stage === "Head" ? "now" : "done") : "done" },
                  { title: "HR approves", detail: pending && r.stage === "HR" ? `Waiting on ${r.waiting_on ?? "HR"} in Approvals` : undefined, state: pending ? (r.stage === "HR" ? "now" : undefined) : "done" },
                  { title: "Advertised", detail: r.opening ? (r.opening.published ? "On the careers page" : "Opening created, not published") : undefined, state: r.opening ? "done" : r.status === "Open & Approved" ? "now" : undefined },
                ]}
              />
            </div>
          </div>
          {r.opening ? (
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Candidates</h3>
                  <p>{r.opening.closes_on ? `Closes ${fmtDay(r.opening.closes_on, true)}` : "No closing date"}</p>
                </div>
                <Link className="btn ghost sm" to={`/hr/recruitment/openings/${encodeURIComponent(r.opening.id)}`}>
                  Open the pipeline
                </Link>
              </div>
              <div className="hr-box__b">
                <div className="hr-funnel">
                  {FUNNEL.map(([label, keys]) => (
                    <span key={label}>
                      <b>{keys.reduce((n, k) => n + (r.applicants[k] ?? 0), 0)}</b>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : r.status === "Open & Approved" ? (
            <div>
              <Link className="btn pri" to={`/hr/recruitment/${encodeURIComponent(r.id)}/publish`}>
                Publish to the careers page
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}
