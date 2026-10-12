import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrRequisition, HrVacancy } from "../../api/types";
import { fmtDay, NextStep, StatusPill } from "../../me/parts";

const STATUS: Record<HrRequisition["status"], { cls: string; label: string }> = {
  Pending: { cls: "leave", label: "With HR Managers in Approvals" },
  "Open & Approved": { cls: "ok", label: "Approved" },
  Rejected: { cls: "bad", label: "Not approved" },
  "On Hold": { cls: "mute", label: "On hold" },
  Filled: { cls: "info", label: "Filled" },
  Cancelled: { cls: "mute", label: "Cancelled" },
};

/** Applicant counts by HRMS status, in pipeline order. */
const FUNNEL: Array<[string, string[]]> = [
  ["Applied", ["Open", "Replied", "Hold"]],
  ["Shortlist", ["Shortlisted"]],
  ["Offer", ["Accepted"]],
];

/**
 * H6 Recruitment — requisitions, their advert and applicant counts (journey J2).
 * Live GET /hr/recruitment and /hr/recruitment/vacancies. Only approved, vacant posts can be requisitioned.
 */
export function RequisitionsView() {
  const { user, sessionKey } = useInstitution();
  const reqs = useApiResource<{ items: HrRequisition[] }>("/hr/recruitment", { enabled: Boolean(user), refreshKey: sessionKey });
  const vac = useApiResource<{ items: HrVacancy[] }>("/hr/recruitment/vacancies", { enabled: Boolean(user), refreshKey: sessionKey });
  const items = reqs.data?.items ?? [];
  const notStarted = (vac.data?.items ?? []).reduce((n, v) => n + v.vacant, 0);
  const toPublish = items.filter((r) => r.status === "Open & Approved" && !r.opening);

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <div className="hr-head">
          <div>
            <h2>Recruitment</h2>
            <p>
              {vac.data ? `${notStarted} vacant post${notStarted === 1 ? "" : "s"} not started. ` : ""}A person can only be hired
              into an approved post.
            </p>
          </div>
          <div className="hr-head__r">
            <Link className="btn ghost" to="/hr/recruitment/applicants">
              Applicants
            </Link>
            <Link className="btn pri" to="/hr/recruitment/new">
              <Icon name="i-plus" />
              Raise a requisition
            </Link>
          </div>
        </div>

        <ResourceGate loading={reqs.loading} error={reqs.error} onRetry={reqs.reload} refreshing={reqs.refreshing} hasData={Boolean(reqs.data)}>
          {items.length ? (
            <div className="hr-box hr-scroll">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Status</th>
                    <th>Advert</th>
                    <th>Candidates</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const s = STATUS[r.status] ?? { cls: "mute", label: r.status };
                    return (
                      <tr key={r.id}>
                        <td>
                          <b>{r.designation}</b>
                          <div className="sub">
                            {r.department ?? ""} · <span className="mono">{r.id}</span>
                          </div>
                        </td>
                        <td>
                          <StatusPill cls={s.cls} label={s.label} />
                          {r.requested_by ? <div className="sub">Raised by {r.requested_by}</div> : null}
                        </td>
                        <td>
                          {r.opening ? (
                            <>
                              {r.opening.published ? "On the careers page" : "Not published"}
                              {r.opening.closes_on ? <div className="sub">Closes {fmtDay(r.opening.closes_on, true)}</div> : null}
                            </>
                          ) : (
                            <span className="sub">Not advertised</span>
                          )}
                        </td>
                        <td>
                          <div className="hr-funnel">
                            {FUNNEL.map(([label, keys]) => (
                              <span key={label}>
                                <b>{keys.reduce((n, k) => n + (r.applicants[k] ?? 0), 0)}</b>
                                {label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {r.status === "Open & Approved" && !r.opening ? (
                            <Link className="btn pri sm" to={`/hr/recruitment/${encodeURIComponent(r.id)}/publish`}>
                              Publish
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No requisitions yet" detail="Raise one for an approved post with a vacancy." />
          )}
        </ResourceGate>

        {toPublish.length ? (
          <NextStep
            title={`Advertise ${toPublish[0].designation}`}
            body="It's approved. Publishing puts it on the careers page, where people apply online."
            to={`/hr/recruitment/${encodeURIComponent(toPublish[0].id)}/publish`}
            label="Publish"
          />
        ) : notStarted ? (
          <NextStep
            title={`${notStarted} vacant post${notStarted === 1 ? "" : "s"} with no requisition`}
            body="Raise a requisition to start filling one. HR Managers approve it in Approvals."
            to="/hr/recruitment/new"
            label="Raise a requisition"
          />
        ) : null}
      </div>
    </RequireStaff>
  );
}
