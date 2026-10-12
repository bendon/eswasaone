import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrMe } from "../api/types";
import { leaveStatus, fmtRange, StatusPill } from "./parts";

/** E3 My leave — own requests and their status. Live GET /hr/me only. */
export function MyLeave() {
  const { user, sessionKey } = useInstitution();
  const me = useApiResource<HrMe>("/hr/me", { enabled: Boolean(user), refreshKey: sessionKey });
  const leave = me.data?.leave ?? [];

  return (
    <ResourceGate loading={me.loading} error={me.error} onRetry={me.reload} refreshing={me.refreshing} hasData={Boolean(me.data)}>
      <div className="hr-view">
        <div className="hr-head">
          <div>
            <h2>My leave</h2>
            <p>Decided by {me.data?.leave_approver?.name ?? "your leave approver"} in Approvals.</p>
          </div>
          <div className="hr-head__r">
            <Link className="btn pri" to="new">
              <Icon name="i-plus" />
              Apply for leave
            </Link>
          </div>
        </div>
        {leave.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Dates</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leave.map((l) => {
                  const s = leaveStatus(l.status);
                  return (
                    <tr key={l.id}>
                      <td>
                        <b>{l.leave_type}</b>
                      </td>
                      <td>{fmtRange(l.from_date, l.to_date)}</td>
                      <td>
                        <StatusPill cls={s.cls} label={s.label} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No leave requests yet" detail="Requests you send appear here with their status." />
        )}
      </div>
    </ResourceGate>
  );
}
