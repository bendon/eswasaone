import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Select } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrExpenseClaim, HrExpenseClaims } from "../api/types";
import { Crumbs, fmtDay } from "../me/parts";
import { claimPill } from "../me/MyExpenses";
import { money } from "./useHrSettings";

/**
 * Expense claims for HR and Finance (reimbursement only, not payroll). Read-only: the named expense approver decides
 * in Approvals; Finance pays. Live GET /hr/expense-claims (HR and Accounts Manager see all; others own and routed to
 * them) and /hr/expense-claims/{id}.
 */


type Filter = "all" | "Draft" | "Approved" | "Rejected";

export function ExpensesView() {
  const { user, sessionKey } = useInstitution();
  const [filter, setFilter] = useState<Filter>("Draft");
  const res = useApiResource<HrExpenseClaims>(`/hr/expense-claims${filter === "all" ? "" : `?status=${filter}`}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const items = useMemo(() => res.data?.items ?? [], [res.data]);
  const overdue = items.filter((c) => c.overdue).length;

  return (
    <div className="hr-view">
      <div className="hr-head">
        <div>
          <h2>Expense claims</h2>
          <p>Each claim is decided by the person's named expense approver in Approvals. Finance pays approved claims.</p>
        </div>
        <div className="hr-head__r">
          <Select
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            aria-label="Filter claims"
            options={[
              { value: "Draft", label: "Waiting for approval" },
              { value: "Approved", label: "Approved" },
              { value: "Rejected", label: "Not approved" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)}>
        {overdue ? <p className="hr-note">{overdue} past the decision date. The approver and Finance get an alert for each.</p> : null}
        {items.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table" aria-label="Expense claims">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Claim</th>
                  <th>Date</th>
                  <th className="num">Total</th>
                  <th>Decides</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.employee_name ?? c.employee}</b>
                      {c.department ? <small style={{ display: "block", color: "var(--muted)" }}>{c.department}</small> : null}
                    </td>
                    <td>
                      <Link className="hr-lnk" to={`/hr/expenses/${encodeURIComponent(c.id)}`}>
                        {c.description || c.id}
                      </Link>
                    </td>
                    <td>{c.posting_date ? fmtDay(c.posting_date, true) : "—"}</td>
                    <td className="num">{money(c.total, c.currency)}</td>
                    <td>{c.approver || "Not set"}</td>
                    <td>{claimPill(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No claims" detail={filter === "Draft" ? "Nothing is waiting for a decision." : "No claims match this filter."} />
        )}
      </ResourceGate>
    </div>
  );
}

export function ExpenseDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrExpenseClaim>(`/hr/expense-claims/${encodeURIComponent(id)}`, { enabled: Boolean(user && id), refreshKey: sessionKey });
  const c = res.data;
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(c)}>
      {c ? (
        <div className="hr-view">
          <Crumbs items={[["Expense claims", "/hr/expenses"], [c.id]]} />
          <div className="hr-head">
            <div>
              <h2>
                {c.employee_name ?? c.employee}: {money(c.total, c.currency)}
              </h2>
              <p>
                {c.description || "No note"}. {c.approval_status === "Draft" ? `${c.approver ?? "The expense approver"} decides it in Approvals.` : ""}
              </p>
            </div>
            <div className="hr-head__r">{claimPill(c)}</div>
          </div>
          <div className="hr-box hr-scroll">
            <table className="hr-table" aria-label="Claim lines">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>What for</th>
                  <th>Amount</th>
                  <th>Approved</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {(c.lines ?? []).map((l, i) => {
                  const att = (c.attachments ?? []).find((a) => a.file_name === l.receipt);
                  return (
                    <tr key={i}>
                      <td>{l.expense_type}</td>
                      <td>{fmtDay(l.expense_date, true)}</td>
                      <td>{l.description || "—"}</td>
                      <td className="mono">{money(l.amount, c.currency)}</td>
                      <td className="mono">{l.sanctioned != null ? money(l.sanctioned, c.currency) : "—"}</td>
                      <td>
                        {att ? (
                          <a className="hr-lnk" href={att.url} target="_blank" rel="noreferrer">
                            {att.file_name}
                          </a>
                        ) : (
                          l.receipt || "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {c.sla_date && c.approval_status === "Draft" ? (
            <p className="hr-note">
              Decision due {fmtDay(c.sla_date, true)}
              {c.overdue ? " (overdue)" : ""}.
            </p>
          ) : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}
