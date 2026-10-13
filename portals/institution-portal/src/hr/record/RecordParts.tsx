import type { ReactNode } from "react";
import { EmptyState } from "../../components/PageStates";
import { fmtDay, StatusPill } from "../../me/parts";
import { AuthPill } from "../competence/shared";
import type { HrAuthorisationStatus, HrEmployeeRecord } from "../../api/types";

/** Read-only sections of the person's record (GET /hr/employees/{id} or /hr/me/record). Job fields only, no pay. */

function Kv({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="hr-kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v || v === 0 ? v : "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JobSection({ r }: { r: HrEmployeeRecord }) {
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Job and contract</h3>
          <p>Changes go through a promotion, transfer or contract change, so they're approved and kept in the history.</p>
        </div>
      </div>
      <div className="hr-box__b">
        <Kv
          rows={[
            ["Staff number", r.employee_number],
            ["Post", r.designation],
            ["Department", r.department],
            ["Grade", r.grade],
            ["Location", r.branch],
            ["Line manager", r.reports_to_name],
            ["Status", r.status],
            ["Joined", r.date_of_joining ? fmtDay(r.date_of_joining, true) : null],
            ["Employment", r.employment_type],
            ["Probation ends", r.scheduled_confirmation_date ? fmtDay(r.scheduled_confirmation_date, true) : null],
            ["Confirmed", r.final_confirmation_date ? fmtDay(r.final_confirmation_date, true) : null],
            ["Contract ends", r.contract_end_date ? fmtDay(r.contract_end_date, true) : null],
            ["Leaving on", r.relieving_date ? fmtDay(r.relieving_date, true) : null],
            ["Contract change", r.contract.pending],
          ]}
        />
      </div>
    </div>
  );
}

export function LeaveSection({ r }: { r: HrEmployeeRecord }) {
  const l = r.leave;
  const next = l.next as { leave_type?: string; from_date?: string; to_date?: string } | null | undefined;
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Leave</h3>
          <p>{next?.from_date ? `Next: ${next.leave_type ?? "leave"}, ${fmtDay(next.from_date)} to ${fmtDay(next.to_date ?? next.from_date, true)}` : "No leave booked ahead."}</p>
        </div>
      </div>
      <div className="hr-box__b">
        {l.balances.length ? (
          <table className="hr-table">
            <thead>
              <tr>
                <th>Leave type</th>
                <th>Allocated</th>
                <th>Taken</th>
                <th>Left</th>
              </tr>
            </thead>
            <tbody>
              {l.balances.map((b) => (
                <tr key={b.leave_type}>
                  <td>{b.leave_type}</td>
                  <td className="mono">{b.allocated}</td>
                  <td className="mono">{b.used}</td>
                  <td className="mono">
                    <b>{b.balance}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            No leave allocated for this period.
          </p>
        )}
      </div>
    </div>
  );
}

export function CompetenceSection({ r }: { r: HrEmployeeRecord }) {
  return r.authorisations.length ? (
    <div className="hr-box hr-scroll">
      <table className="hr-table" aria-label="Authorisations">
        <thead>
          <tr>
            <th>Competence</th>
            <th>Valid</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {r.authorisations.map((a) => (
            <tr key={a.id}>
              <td>
                <b>{a.skill}</b>
              </td>
              <td>
                {fmtDay(a.valid_from, true)} to {a.valid_to ? fmtDay(a.valid_to, true) : "no end date"}
              </td>
              <td>
                <AuthPill status={a.status as HrAuthorisationStatus} validTo={a.valid_to} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState title="No authorisations" detail="Authorisations to audit, review or calibrate show here once HR records them." />
  );
}

const KIND: Record<string, string> = { promotion: "Promotion", transfer: "Transfer", separation: "Leaving", contract: "Contract change" };

export function HistorySection({ r }: { r: HrEmployeeRecord }) {
  return r.history.length ? (
    <div className="hr-box hr-scroll">
      <table className="hr-table" aria-label="History">
        <thead>
          <tr>
            <th>Change</th>
            <th>Date</th>
            <th>What changed</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {r.history.map((h) => (
            <tr key={h.id}>
              <td>
                <b>{KIND[h.kind] ?? h.kind}</b>
              </td>
              <td>{h.date ? fmtDay(h.date, true) : "—"}</td>
              <td>{h.changes.length ? h.changes.map((c) => `${c.property}: ${c.current ?? "—"} → ${c.new ?? "—"}`).join("; ") : "—"}</td>
              <td>
                <StatusPill cls={/approved|done|submitted/i.test(h.state) ? "ok" : /reject|cancel/i.test(h.state) ? "bad" : "leave"} label={h.state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState title="No changes yet" detail="Promotions, transfers and contract changes show here once approved." />
  );
}

export function OpenItems({ r }: { r: HrEmployeeRecord }) {
  if (!r.open_items.length) return null;
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Open items</h3>
          <p>Things waiting on this record</p>
        </div>
      </div>
      <div className="hr-box__b hr-out">
        {r.open_items.map((o) => (
          <div key={`${o.kind}-${o.reference ?? o.title}`} className="hr-out__i">
            <div>
              <b style={{ fontSize: 13 }}>{o.title}</b>
            </div>
            <span className="r mono">{o.due ? fmtDay(o.due) : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
