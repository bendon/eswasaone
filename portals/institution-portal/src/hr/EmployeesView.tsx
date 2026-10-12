import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, AuthError, RecordDrawer, type DrawerSection, Select } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrEmployeesResponse, HrEmployeeSummary } from "../api/types";
import { initialsFromName } from "./helpers";

/** Directory — live /hr/employees only. */

type StatusFilter = "all" | "active" | "on_leave" | "probation" | "inactive";

function bucketFor(item: HrEmployeeSummary): StatusFilter {
  const s = (item.status ?? "").toLowerCase();
  if (s.includes("inactive") || s.includes("suspended") || s.includes("left") || s.includes("resigned"))
    return "inactive";
  if (s.includes("probation")) return "probation";
  if (s.includes("leave") || s.includes("absent")) return "on_leave";
  return "active";
}

function labelFor(bucket: StatusFilter): string {
  if (bucket === "active") return "Active";
  if (bucket === "on_leave") return "On leave";
  if (bucket === "probation") return "Probation";
  return "Inactive";
}

function stClass(bucket: StatusFilter): string {
  if (bucket === "active") return "ok";
  if (bucket === "on_leave") return "leave";
  if (bucket === "probation") return "probation";
  return "leave";
}

export function EmployeesView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<HrEmployeesResponse>(
    "/hr/employees?limit=200",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [dept, setDept] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [invite, setInvite] = useState(true);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const departments = useMemo(() => {
    const set = new Set(items.map((i) => i.department || "Unassigned").filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (dept !== "all" && (i.department || "Unassigned") !== dept) return false;
      if (statusFilter !== "all" && bucketFor(i) !== statusFilter) return false;
      if (!q) return true;
      return `${i.id} ${i.employee_name} ${i.designation ?? ""}`.toLowerCase().includes(q);
    });
  }, [items, dept, statusFilter, search]);

  const selected = items.find((i) => i.id === openRef) ?? null;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const created = await apiFetch<HrEmployeeSummary>("/hr/employees", {
        method: "POST",
        body: JSON.stringify({
          employee_name: fullName.trim(),
          email: email.trim() || undefined,
          department: department.trim() || undefined,
          designation: designation.trim() || undefined,
          invite,
          confirm: true,
        }),
      });
      setFlash(`Created ${created.employee_name} (${created.id})`);
      setFullName("");
      setEmail("");
      setDepartment("");
      setDesignation("");
      setShowAdd(false);
      reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Could not create employee");
    } finally {
      setBusy(false);
    }
  }

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Job",
          content: (
            <dl className="hr-kv">
              <div>
                <dt>Staff number</dt>
                <dd className="mono">{selected.id}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{labelFor(bucketFor(selected))}</dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd>{selected.designation || "—"}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{selected.department || "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{(selected as { email?: string | null }).email || "—"}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{(selected as { date_of_joining?: string | null }).date_of_joining || "—"}</dd>
              </div>
            </dl>
          ),
        },
        {
          heading: "Personal and pay",
          content: (
            <div className="hr-lock">
              <span>Hidden. Opening these is recorded against your name.</span>
              <button type="button" className="btn ghost sm" disabled title="Coming soon">
                Show details
              </button>
            </div>
          ),
        },
        // TODO: wire real — leave balances, authorisations, documents per employee
        {
          heading: "Leave, 2026/27",
          content: (
            <>
              <div className="hr-bal">
                <span>Annual</span>
                <div className="hr-prog">
                  <i style={{ width: "57%" }} />
                </div>
                <b>12 of 21 left</b>
              </div>
              <div className="hr-bal">
                <span>Sick</span>
                <div className="hr-prog">
                  <i style={{ width: "86%" }} />
                </div>
                <b>12 of 14 left</b>
              </div>
              <div className="hr-bal">
                <span>Study</span>
                <div className="hr-prog">
                  <i style={{ width: "100%" }} />
                </div>
                <b>10 of 10 left</b>
              </div>
            </>
          ),
        },
        {
          heading: "Documents",
          content: (
            <div className="hr-out">
              <div className="hr-out__i">
                <div>
                  <b>Contract of employment</b>
                </div>
                <span className="hr-st ok">On file</span>
              </div>
              <div className="hr-out__i">
                <div>
                  <b>Qualification certificates</b>
                </div>
                <span className="hr-st ok">On file</span>
              </div>
              <div className="hr-out__i">
                <div>
                  <b>Impartiality declaration 2026/27</b>
                </div>
                <span className="hr-st ok">Signed</span>
              </div>
            </div>
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
        label="Loading directory…"
      >
        <div className="hr">
          {flash ? (
            <p style={{ fontSize: 12.5, color: "var(--navy)", margin: "0 0 12px", fontWeight: 600 }}>
              {flash}
            </p>
          ) : null}

          <div className="hr-filters">
            <Select
              value={dept}
              onChange={setDept}
              aria-label="Department"
              options={departments.map((d) => ({ value: d, label: d === "all" ? "All departments" : d }))}
            />
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              aria-label="Status"
              options={[
                { value: "all", label: "All status" },
                { value: "active", label: "Active" },
                { value: "on_leave", label: "On leave" },
                { value: "probation", label: "Probation" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            <div className="hr-search">
              <input
                placeholder="Search name, ID, designation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="btn gold" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add employee"}
            </button>
          </div>

          {showAdd ? (
            <div className="hr-box" style={{ marginBottom: 16 }}>
              <div className="hr-box__h">
                <div>
                  <h3>Add employee</h3>
                  <p>Creates an employee record and optionally sends a portal invite.</p>
                </div>
              </div>
              <div className="hr-box__b">
                <form className="hr-invite" onSubmit={(e) => void onAdd(e)}>
                  <label>
                    Full name
                    <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </label>
                  <label>
                    Work email
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label>
                    Department
                    <input value={department} onChange={(e) => setDepartment(e.target.value)} />
                  </label>
                  <label>
                    Designation
                    <input value={designation} onChange={(e) => setDesignation(e.target.value)} />
                  </label>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={invite}
                      onChange={(e) => setInvite(e.target.checked)}
                    />
                    Also invite as Institution user (welcome email)
                  </label>
                  <button type="submit" className="btn pri" disabled={busy}>
                    {busy ? "Saving…" : "Create employee"}
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No employees match" : "No employees yet"}
              detail={
                items.length
                  ? "Adjust the filter or search above."
                  : "You have portal users, but no employee records yet. Use Add employee to onboard staff into Directory, leave, and payroll."
              }
            />
          ) : (
            <div className="hr-box" style={{ overflowX: "auto" }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Designation</th>
                    <th>Department</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const bucket = bucketFor(item);
                    const joined = (item as { date_of_joining?: string | null }).date_of_joining;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="hr-who">
                            <span className="hr-av">{initialsFromName(item.employee_name)}</span>
                            <div>
                              <b>{item.employee_name}</b>
                              <span className="id">{item.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>{item.designation || "—"}</td>
                        <td>{item.department || "—"}</td>
                        <td>{joined || "—"}</td>
                        <td>
                          <span className={`hr-st ${stClass(bucket)}`}>
                            <span className="d" />
                            {labelFor(bucket)}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button type="button" className="btn ghost sm" onClick={() => setOpenRef(item.id)}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenRef(null)}
            reference={selected?.id}
            title={selected ? selected.employee_name : ""}
            subtitle={selected ? <span className="stagechip">{labelFor(bucketFor(selected))}</span> : null}
            sections={drawerSections}
          />
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
