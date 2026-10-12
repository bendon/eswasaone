import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import { Icon, RecordDrawer, type DrawerSection, Select } from "@eswasaone/shared-ui";
import type { HrAppraisalsResponse, HrAppraisalSummary } from "../api/types";
import { openDesk } from "./desk";

/** Performance — live appraisals from Core; empty when none. */

type StatusFilter = "all" | "pending" | "in_progress" | "completed";

function bucketFor(item: HrAppraisalSummary): StatusFilter {
  const s = (item.status ?? "").toLowerCase();
  if (s.includes("complete") || s.includes("done") || s.includes("finish") || s.includes("closed"))
    return "completed";
  if (s.includes("progress") || s.includes("ongoing") || s.includes("active") || s.includes("open"))
    return "in_progress";
  return "pending";
}

function labelFor(bucket: StatusFilter): string {
  if (bucket === "completed") return "Completed";
  if (bucket === "in_progress") return "In progress";
  return "Pending";
}

export function AppraisalsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<HrAppraisalsResponse>(
    "/hr/appraisals",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openRef, setOpenRef] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const completed = items.filter((i) => bucketFor(i) === "completed").length;
  const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((i) => bucketFor(i) === statusFilter);
  }, [items, statusFilter]);

  const selected = items.find((i) => i.id === openRef) ?? null;

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Appraisal",
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
                <b>Period</b>
                <span>{selected.cycle || "—"}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span className="stagechip">{labelFor(bucketFor(selected))}</span>
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
        label="Loading performance…"
      >
        <div className="hr">
          <div className="hr-box" style={{ marginBottom: 16 }}>
            <div className="hr-box__h">
              <div>
                <h3>Appraisal cycle</h3>
                <p>Completion from live appraisals</p>
              </div>
              <span className="hr-st leave">
                <span className="d" />
                {pct}% complete
              </span>
            </div>
            <div className="hr-box__b">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>
                  {completed} of {items.length} reviews submitted
                </span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  {pct}%
                </span>
              </div>
              <div className="hr-prog">
                <i style={{ width: `${pct}%` }} />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn pri sm" onClick={() => openDesk("appraisal")}>
                  <Icon name="i-mail" />
                  Remind pending
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => openDesk("appraisal-cycle")}
                >
                  View cycle in Desk
                </button>
              </div>
            </div>
          </div>

          <div className="hr-filters">
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              aria-label="Filter appraisals"
              options={[
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No appraisals"
              detail={
                items.length === 0
                  ? "Appraisals appear once cycles are opened in HRMS."
                  : "Adjust the filter above."
              }
            />
          ) : (
            <div className="hr-box" style={{ overflowX: "auto" }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Cycle</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 700 }}>{item.employee}</td>
                      <td>{item.cycle || "—"}</td>
                      <td>
                        <span className="stagechip">{labelFor(bucketFor(item))}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
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

          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenRef(null)}
            reference={selected?.id}
            title={selected ? selected.employee : ""}
            subtitle={selected ? <span className="stagechip">{labelFor(bucketFor(selected))}</span> : null}
            sections={drawerSections}
          />
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
