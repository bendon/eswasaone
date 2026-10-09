import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  CrmNotConnected,
  StatePill,
  fmtDay,
  fmtWhen,
  isOpen,
  listMyCases,
  publicCrmConfig,
  useCrm,
} from "@eswasaone/shared-ui/crm";
import { useAuth } from "../../auth/AuthProvider";
import { CasePublicView } from "../complaints/CasePublicView";
import { Skeleton } from "./Skeleton";

/** My account → Cases: complaints, enquiries and reports this person has lodged. */
export function AccountCasesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cfg = publicCrmConfig();
  const res = useCrm(() => listMyCases(user?.email), [user?.email]);
  const items = res.data ?? [];
  const actionNeeded = items.filter((c) => c.state === "Awaiting Customer" || c.state === "Resolved").length;

  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>Cases</h2>
          <p>
            Complaints, enquiries and reports you've sent to ESWASA
            {actionNeeded ? ` · ${actionNeeded} need${actionNeeded === 1 ? "s" : ""} your attention` : ""}
          </p>
        </div>
        <div className="actions">
          <Link className="abtn primary" to="/complaints">
            <Icon name="i-plus" /> New case
          </Link>
        </div>
      </div>
      {res.notConnected ? (
        <CrmNotConnected what="Your cases" audience="public" />
      ) : res.loading && !res.data ? (
        <Skeleton lines={4} />
      ) : items.length === 0 ? (
        <div className="empty">
          <span className="empty__ic">
            <Icon name="i-alert-c" />
          </span>
          <b>No cases yet</b>
          <p>When you raise a complaint, enquiry or report it will appear here with its progress.</p>
          <Link to="/complaints">Complaints &amp; enquiries</Link>
        </div>
      ) : (
        <div className="crm-card crm-card--flush">
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Last update</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.ref} className="is-click" onClick={() => navigate(`/account/cases/${c.ref}`)}>
                    <td>
                      <b>{c.subject}</b>
                      <span className="crm-small crm-mono">{c.ref}</span>
                    </td>
                    <td>{cfg.case_types[c.type].short}</td>
                    <td>
                      <StatePill state={c.state} customer />
                      {c.state === "Awaiting Customer" || c.state === "Resolved" ? (
                        <span className="crm-small" style={{ color: "var(--amber)" }}>
                          Your turn
                        </span>
                      ) : null}
                    </td>
                    <td className="crm-small">{fmtDay(c.created_at)}</td>
                    <td className="crm-small">{isOpen(c) || c.state === "Resolved" ? fmtWhen(c.updated_at) : "Closed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/** My account → Cases → one case (same customer view as public tracking). */
export function AccountCaseDetailPage() {
  const { ref = "" } = useParams();
  const { user } = useAuth();
  const res = useCrm(async () => (await listMyCases(user?.email)).find((c) => c.ref === ref) ?? null, [ref, user?.email]);

  return (
    <section className="panel is-on" role="tabpanel">
      <Link to="/account/cases" className="crm-ws__back" style={{ marginBottom: 12 }}>
        <Icon name="i-cleft" /> All cases
      </Link>
      {res.notConnected ? (
        <CrmNotConnected what="Your cases" audience="public" />
      ) : res.loading && res.data === undefined ? (
        <Skeleton lines={5} />
      ) : !res.data ? (
        <div className="empty">
          <b>Case not found</b>
          <p>It may belong to another account. Use public tracking with your reference and code.</p>
          <Link to={`/complaints/track?ref=${ref}`}>Track a case</Link>
        </div>
      ) : (
        <CasePublicView c={res.data} onChange={() => res.reload()} />
      )}
    </section>
  );
}
