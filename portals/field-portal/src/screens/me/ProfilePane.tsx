import { useEffect } from "react";
import type { SessionUser } from "@eswasaone/shared-ui";
import { fmtDate } from "./helpers";
import type { HrEmployeeRecord } from "./types";
import { useMeResource } from "./useMeResource";

type Props = {
  user: SessionUser;
  enabled?: boolean;
  refreshKey?: string;
  onAuthRequired: (reason?: string) => void;
};

/** E5 on mobile: your login and your job record (live GET /hr/me/record). Corrections and documents are on desktop My HR. */
export function ProfilePane({ user, enabled = true, refreshKey = "", onAuthRequired }: Props) {
  const rec = useMeResource<HrEmployeeRecord>("/hr/me/record", { enabled, refreshKey });

  useEffect(() => {
    if (rec.authRequired) onAuthRequired(rec.error || undefined);
  }, [rec.authRequired, rec.error, onAuthRequired]);

  const r = rec.data;
  const rows: Array<[string, string | null | undefined]> = r
    ? [
        ["Staff number", r.employee_number],
        ["Post", r.designation],
        ["Department", r.department],
        ["Grade", r.grade],
        ["Location", r.branch],
        ["Line manager", r.reports_to_name],
        ["Employment", r.employment_type],
        ["Contract ends", r.contract_end_date ? fmtDate(r.contract_end_date) : null],
      ]
    : [];

  return (
    <div className="me-pane">
      <h2 className="me-pane__title">Profile</h2>
      <dl className="me-kv">
        <div>
          <dt>Name</dt>
          <dd>{r?.employee_name || user.full_name || user.username}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email || "—"}</dd>
        </div>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>
      {rec.loading && !r ? <p className="field-muted">Loading your record…</p> : null}
      {rec.error && !r && !rec.authRequired ? (
        <p className="me-error" role="alert">
          {/^Employee not found|not linked/i.test(rec.error) ? "Your login isn't linked to an employee record yet. Ask HR to link it." : rec.error}
        </p>
      ) : null}
      {r?.open_items.length ? (
        <>
          <div className="me-sec-h">To do</div>
          <div className="me-card">
            {r.open_items.map((o) => (
              <div className="me-row" key={`${o.kind}-${o.reference ?? o.title}`}>
                <div className="me-row__b">
                  <b>{o.title}</b>
                  {o.due ? <span>Due {fmtDate(o.due)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <p className="field-muted">To correct a detail or upload a document, open My HR → My profile on a computer.</p>
    </div>
  );
}
