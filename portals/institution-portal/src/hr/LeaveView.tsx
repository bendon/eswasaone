import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, RecordDrawer, type DrawerSection, Select } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrLeaveRequest, HrLeaveRequests } from "../api/types";
import { LeaveCalendar } from "./LeaveCalendar";
import { initialsFromName } from "./helpers";

/**
 * H4 Time off: who is away, what is waiting, what is owed. Read-only: leave is decided by the named
 * approver in Approvals (an HR Manager only on escalation). Live GET /hr/leave/requests, /hr/leave/calendar,
 * /hr/leave/balances, /hr/holidays.
 */

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "cancelled";

type LeaveRow = HrLeaveRequest;

function bucketFor(item: LeaveRow): StatusFilter {
  const s = (item.status ?? "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("approve") || s.includes("granted") || s.includes("accepted")) return "approved";
  if (s.includes("reject") || s.includes("denied") || s.includes("declined")) return "rejected";
  return "pending";
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** HRMS's working-day count for the request (holidays and half days included); "—" when it didn't send one. */
function dayCount(item: LeaveRow): string {
  return typeof item.days === "number" ? String(item.days) : "—";
}

export function LeaveView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<HrLeaveRequests>(
    "/hr/leave/requests",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );
  const balancesRes = useApiResource<{ items: Array<{ leave_type: string; allocated: number; used: number; balance: number }>; awaiting?: string | null }>(
    "/hr/leave/balances",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );
  const holidaysRes = useApiResource<{ items: Array<{ date: string; description?: string | null }> }>(
    "/hr/holidays",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [openRef, setOpenRef] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired || balancesRes.authRequired || holidaysRes.authRequired) {
      openAuth("Staff sign-in required");
    }
  }, [authRequired, balancesRes.authRequired, holidaysRes.authRequired, openAuth]);

  const items: LeaveRow[] = data?.items ?? [];

  const pending = items.filter((i) => bucketFor(i) === "pending");
  const overdue = pending.filter((i) => i.overdue).length;
  const escalated = pending.filter((i) => i.overdue && i.escalated).length;
  const approved = items.filter((i) => bucketFor(i) === "approved").length;
  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((i) => bucketFor(i) === statusFilter);
  }, [items, statusFilter]);

  const selected = items.find((i) => i.id === openRef) ?? null;

  const balanceRows = useMemo(() => {
    const live = balancesRes.data?.items ?? [];
    return live.map((b) => {
      const alloc = Number(b.allocated) || 0;
      const bal = Number(b.balance) || 0;
      const used = Number(b.used) || 0;
      const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0;
      return {
        label: b.leave_type,
        value: `${bal} / ${alloc} days`,
        pct: Math.min(100, Math.max(0, pct)),
        color: "var(--navy)",
      };
    });
  }, [balancesRes.data]);

  const holidayRows = useMemo(() => {
    return (holidaysRes.data?.items ?? []).map((h) => ({
      name: h.description || h.date,
      when: fmtDate(h.date),
    }));
  }, [holidaysRes.data]);

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Request",
          content: (
            <>
              <div className="kv">
                <b>Reference</b>
                <span className="mono">{selected.id}</span>
              </div>
              <div className="kv">
                <b>Employee</b>
                <span>{selected.employee_name || selected.employee}</span>
              </div>
              <div className="kv">
                <b>Department</b>
                <span>{selected.department || "—"}</span>
              </div>
              <div className="kv">
                <b>Leave type</b>
                <span>{selected.leave_type}</span>
              </div>
              <div className="kv">
                <b>Dates</b>
                <span>
                  {fmtDate(selected.from_date)} → {fmtDate(selected.to_date)} ({dayCount(selected)} days)
                </span>
              </div>
            </>
          ),
        },
        {
          heading: "Decision",
          content: (
            <>
              <div className="kv">
                <b>Status</b>
                <span className="stagechip">{selected.status}</span>
              </div>
              <div className="kv">
                <b>Decides</b>
                <span>{selected.approver_name || selected.approver || "No approver set"}</span>
              </div>
              {selected.certificate_required || selected.has_certificate ? (
                <div className="kv">
                  <b>Medical certificate</b>
                  <span>{selected.has_certificate ? "Attached. HR checks it in the person's documents." : "Needed, not sent yet"}</span>
                </div>
              ) : null}
              {selected.sla_date ? (
                <div className="kv">
                  <b>Due</b>
                  <span>
                    {fmtDate(selected.sla_date)}
                    {selected.overdue ? " (overdue)" : ""}
                    {selected.escalated ? ", escalated to HR" : ""}
                  </span>
                </div>
              ) : null}
              <p className="page-note">
                Leave is decided in <Link to="/approvals">Approvals</Link> by the person named here.
              </p>
            </>
          ),
        },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading time off…"
      >
        <div className="hr">

          <div className="hr-head">
            <div>
              <h2>Time off</h2>
              <p>Who is away, what is waiting, and what leave the organisation owes.</p>
            </div>
            <div className="hr-head__r">
              <Link to="/hr/bulk/new?kind=closure" className="btn ghost">
                Office closure
              </Link>
            </div>
          </div>

          <div className="kpis" role="group" aria-label="Time off KPIs">
            <div className="kpi">
              <span className="l">Requests waiting</span>
              <span className="v">{pending.length}</span>
              <span className={`d ${pending.length ? "warn" : ""}`}>
                {pending.length ? "Named approvers decide in Approvals" : "Queue clear"}
              </span>
            </div>
            <div className="kpi">
              <span className="l">Past the decision date</span>
              <span className="v">{overdue}</span>
              <span className="d">{overdue ? (escalated ? `${escalated} with the HR Managers` : "Waiting on the approver") : "None overdue"}</span>
            </div>
            <div className="kpi">
              <span className="l">Approved</span>
              <span className="v">{approved}</span>
              <span className="d">Requests on record</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <LeaveCalendar enabled={Boolean(user)} refreshKey={sessionKey} holidays={holidaysRes.data?.items} />
          </div>

          <div className="hr-box" style={{ marginBottom: 16 }}>
            <div className="hr-box__h">
              <div>
                <h3>Requests</h3>
                <p>
                  Each request is decided by its named approver in <Link to="/approvals">Approvals</Link>.{" "}
                  <Link to="/hr/time-off/policy">Leave policy</Link>
                </p>
              </div>
              <span className="hr-st leave">
                <span className="d" />
                {pending.length} pending
              </span>
            </div>
            <div className="hr-box__b" style={{ paddingTop: 8 }}>
              <div className="hr-filters" style={{ marginBottom: 8 }}>
                <Select
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as StatusFilter)}
                  aria-label="Filter leave"
                  options={[
                    { value: "pending", label: "Pending" },
                    { value: "all", label: "All" },
                    { value: "approved", label: "Approved" },
                    { value: "rejected", label: "Rejected" },
                    { value: "cancelled", label: "Cancelled" },
                  ]}
                />
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  title={items.length ? "No leave requests" : "No leave requests yet"}
                  detail={
                    items.length
                      ? "Nothing matches this filter."
                      : "Leave Applications appear once Employees are onboarded and submit leave."
                  }
                />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Decides</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="hr-who">
                              <span className="hr-av">
                                {initialsFromName(item.employee_name || item.employee || "")}
                              </span>
                              <div>
                                <b>{item.employee_name || item.employee}</b>
                                {item.department ? <small style={{ display: "block", color: "var(--muted)" }}>{item.department}</small> : null}
                              </div>
                            </div>
                          </td>
                          <td>{item.leave_type}</td>
                          <td>
                            {fmtDate(item.from_date)}
                            {item.to_date && item.to_date !== item.from_date
                              ? ` – ${fmtDate(item.to_date)}`
                              : ""}
                          </td>
                          <td className="mono">{dayCount(item)}</td>
                          <td>{item.approver_name || item.approver || "Not set"}</td>
                          <td>
                            <span className="stagechip">{item.status}</span>
                            {item.overdue ? <small style={{ display: "block", color: "var(--bad, #b42318)" }}>Overdue{item.escalated ? ", with HR" : ""}</small> : null}
                            {item.certificate_required && !item.has_certificate ? <small style={{ display: "block" }}>Certificate needed</small> : null}
                            {item.has_certificate ? <small style={{ display: "block" }}>Medical certificate attached</small> : null}
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button type="button" className="btn ghost sm" onClick={() => setOpenRef(item.id)}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="hr-grid c2">
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Your leave balances</h3>
                  <p>From the leave ledger. Each person sees their own on My HR.</p>
                </div>
              </div>
              <div className="hr-box__b">
                {balanceRows.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    {balancesRes.error
                        ? "Balances couldn't be loaded."
                        : "No leave allocated to you for this period."}
                  </p>
                ) : (
                  <div className="hr-tl">
                    {balanceRows.map((b) => (
                      <div key={b.label} className="hr-tl__row">
                        <div className="hr-tl__top">
                          <span>{b.label}</span>
                          <span className="v mono">{b.value}</span>
                        </div>
                        <div className="hr-tl__bar">
                          <div
                            className="hr-tl__fill"
                            style={{ width: `${b.pct}%`, background: b.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Upcoming holidays</h3>
                  <p>From Holiday List</p>
                </div>
              </div>
              <div className="hr-box__b hr-out">
                {holidayRows.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    No upcoming holidays on the calendar.
                  </p>
                ) : (
                  holidayRows.map((h) => (
                    <div key={`${h.name}-${h.when}`} className="hr-out__i">
                      <Icon name="i-cal" />
                      <div>
                        <b style={{ fontSize: 13 }}>{h.name}</b>
                      </div>
                      <span className="r mono">{h.when}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenRef(null)}
            reference={selected?.id}
            title={selected ? selected.employee_name || selected.employee || "" : ""}
            subtitle={selected?.leave_type ? <span className="stagechip">{selected.leave_type}</span> : null}
            sections={drawerSections}
          />
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
