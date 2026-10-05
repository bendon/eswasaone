import { useEffect, useMemo, useState } from "react";
import { apiFetch, AuthError, Icon, RecordDrawer, useDialogs, type DrawerSection } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrLeaveResponse, HrLeaveSummary } from "../api/types";
import { initialsFromName } from "./helpers";

/** Time off — live leave queue + balances + holidays from HRMS. */

type StatusFilter = "all" | "pending" | "approved" | "rejected";

type LeaveRow = HrLeaveSummary & { days?: number; balance?: number; initials?: string };

function bucketFor(item: HrLeaveSummary): StatusFilter {
  const s = (item.status ?? "").toLowerCase();
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

function dayCount(item: LeaveRow): number {
  if (typeof item.days === "number") return item.days;
  if (!item.from_date || !item.to_date) return 1;
  const a = Date.parse(item.from_date);
  const b = Date.parse(item.to_date);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function LeaveView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const dialogs = useDialogs();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<HrLeaveResponse>(
    "/hr/leave",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );
  const balancesRes = useApiResource<{ items: Array<{ leave_type: string; allocated: number; used: number; balance: number }> }>(
    "/hr/leave/balances",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );
  const holidaysRes = useApiResource<{ items: Array<{ date: string; description?: string | null }> }>(
    "/hr/holidays",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired || balancesRes.authRequired || holidaysRes.authRequired) {
      openAuth("Staff sign-in required");
    }
  }, [authRequired, balancesRes.authRequired, holidaysRes.authRequired, openAuth]);

  const items: LeaveRow[] = data?.items ?? [];

  const pending = items.filter((i) => bucketFor(i) === "pending");
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
      const used = Number(b.used) || Math.max(0, alloc - bal);
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

  async function actLeave(id: string, decision: "approve" | "reject", employee: string) {
    const ok = await dialogs.confirm({
      title: decision === "approve" ? "Approve leave" : "Reject leave",
      message: `${decision === "approve" ? "Approve" : "Reject"} leave for ${employee}?`,
      confirmLabel: decision === "approve" ? "Approve" : "Reject",
      danger: decision === "reject",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await apiFetch<HrLeaveSummary>(`/hr/leave/${encodeURIComponent(id)}/act`, {
        method: "POST",
        body: JSON.stringify({ decision, confirm: true }),
      });
      await dialogs.alert({
        message: `${decision === "approve" ? "Approved" : "Rejected"}: ${employee}`,
        kind: "success",
      });
      reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Leave action failed",
          kind: "error",
        });
    } finally {
      setBusyId(null);
    }
  }

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
                <span>{selected.employee}</span>
              </div>
              <div className="kv">
                <b>Leave type</b>
                <span>{selected.leave_type}</span>
              </div>
              <div className="kv">
                <b>Dates</b>
                <span>
                  {fmtDate(selected.from_date)} → {fmtDate(selected.to_date)}
                </span>
              </div>
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
          {dialogs.host}

          <div className="hr-box" style={{ marginBottom: 16 }}>
            <div className="hr-box__h">
              <div>
                <h3>Leave requests</h3>
                <p>Pending approval queue</p>
              </div>
              <span className="hr-st leave">
                <span className="d" />
                {pending.length} pending
              </span>
            </div>
            <div className="hr-box__b" style={{ paddingTop: 8 }}>
              <div className="hr-filters" style={{ marginBottom: 8 }}>
                <select
                  className="hr-sel"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  aria-label="Filter leave"
                >
                  <option value="pending">Pending</option>
                  <option value="all">All</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
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
                        <th>Balance</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="hr-who">
                              <span className="hr-av">
                                {item.initials ?? initialsFromName(item.employee)}
                              </span>
                              <div>
                                <b>{item.employee}</b>
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
                          <td className="mono">
                            {item.balance != null ? `${item.balance} days` : "—"}
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {bucketFor(item) === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  className="btn pri sm"
                                  disabled={busyId === item.id}
                                  onClick={() => void actLeave(item.id, "approve", item.employee)}
                                >
                                  <Icon name="i-check-c" />
                                  {busyId === item.id ? "…" : "Approve"}
                                </button>{" "}
                                <button
                                  type="button"
                                  className="btn ghost sm"
                                  disabled={busyId === item.id}
                                  onClick={() => void actLeave(item.id, "reject", item.employee)}
                                >
                                  Reject
                                </button>{" "}
                                <button type="button" className="btn ghost sm" onClick={() => setOpenRef(item.id)}>
                                  View
                                </button>
                              </>
                            ) : (
                              <button type="button" className="btn ghost sm" onClick={() => setOpenRef(item.id)}>
                                View
                              </button>
                            )}
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
                  <h3>Leave balances</h3>
                  <p>Allocated leave balances for your staff</p>
                </div>
              </div>
              <div className="hr-box__b">
                {balanceRows.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    No allocations visible yet. Ensure Leave Allocation records exist and your role can read them.
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
            title={selected ? selected.employee : ""}
            subtitle={selected ? <span className="stagechip">{selected.leave_type}</span> : null}
            sections={drawerSections}
          />
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
