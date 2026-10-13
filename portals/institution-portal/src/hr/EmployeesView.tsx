import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthError, RecordDrawer, type DrawerSection, Select } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrDepartmentsResponse, HrDesignationsResponse, HrEmployeeOptions, HrEmployeesResponse, HrEmployeeSummary } from "../api/types";
import { errorText, hrSend } from "./api";
import { initialsFromName } from "./helpers";
import { SensitivePanel } from "./sensitive/Sensitive";

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
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [joined, setJoined] = useState("");
  const [invite, setInvite] = useState(true);
  const [addErr, setAddErr] = useState<string | null>(null);
  const depts = useApiResource<HrDepartmentsResponse>("/hr/departments?limit=200", { enabled: showAdd, refreshKey: sessionKey });
  const desigs = useApiResource<HrDesignationsResponse>("/hr/designations?limit=200", { enabled: showAdd, refreshKey: sessionKey });
  const opts = useApiResource<HrEmployeeOptions>("/hr/employee-options", { enabled: showAdd, refreshKey: sessionKey });

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
    setAddErr(null);
    try {
      const created = await hrSend<HrEmployeeSummary>("/hr/employees", {
        employee_name: fullName.trim(),
        gender,
        date_of_birth: dob,
        date_of_joining: joined,
        email: email.trim() || undefined,
        department: department || undefined,
        designation: designation || undefined,
        invite,
      });
      setFlash(`Created ${created.employee_name} (${created.id})`);
      setFullName("");
      setEmail("");
      setDepartment("");
      setDesignation("");
      setGender("");
      setDob("");
      setJoined("");
      setShowAdd(false);
      reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      setAddErr(errorText(err, "Could not create the record."));
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
          content: <SensitivePanel key={selected.id} employee={selected.id} />,
        },
        {
          heading: "Changes",
          content: (
            <div className="hr-view" style={{ gap: 8 }}>
              <p className="hr-note" style={{ margin: 0 }}>
                Each change is prepared here and approved by another HR Manager in Approvals.
              </p>
              <div className="hr-actions" style={{ justifyContent: "flex-start" }}>
                <Link className="btn ghost sm" to={`/hr/directory/${encodeURIComponent(selected.id)}/promote`}>
                  Promote
                </Link>
                <Link className="btn ghost sm" to={`/hr/directory/${encodeURIComponent(selected.id)}/transfer`}>
                  Transfer
                </Link>
                <Link className="btn ghost sm" to={`/hr/directory/${encodeURIComponent(selected.id)}/leave`}>
                  Record a leaver
                </Link>
              </div>
              <Link className="hr-lnk" to={`/hr/directory/${encodeURIComponent(selected.id)}/record`}>
                Open full record
              </Link>
              <Link className="hr-lnk" to={`/hr/directory/${encodeURIComponent(selected.id)}`}>
                History and pending changes
              </Link>
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
                  <p>Name, gender, date of birth and date of joining are required by HRMS. Nothing is filled in for you.</p>
                </div>
              </div>
              <form className="hr-box__b hr-form" onSubmit={(e) => void onAdd(e)}>
                <h4 className="hr-sub wide">Person</h4>
                <label className="hr-f">
                  Full name
                  <input className="hr-in" required value={fullName} placeholder="As on their ID" onChange={(e) => setFullName(e.target.value)} />
                </label>
                <label className="hr-f">
                  <span>Work email <small>Optional</small></span>
                  <input className="hr-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="hr-f">
                  Gender
                  <select className="hr-in" required value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">{opts.loading ? "Loading…" : opts.data?.genders.length ? "Choose…" : "None set up in HRMS"}</option>
                    {(opts.data?.genders ?? []).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hr-f">
                  Date of birth
                  <input className="hr-in" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
                </label>

                <h4 className="hr-sub wide">Job</h4>
                <label className="hr-f">
                  Date of joining
                  <input className="hr-in" type="date" required value={joined} onChange={(e) => setJoined(e.target.value)} />
                </label>
                <label className="hr-f">
                  <span>Department <small>Optional</small></span>
                  <select className="hr-in" value={department} onChange={(e) => setDepartment(e.target.value)}>
                    <option value="">{depts.loading ? "Loading…" : depts.data?.items.length ? "Choose later" : "None set up yet"}</option>
                    {(depts.data?.items ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hr-f">
                  <span>Designation <small>Optional</small></span>
                  <select className="hr-in" value={designation} onChange={(e) => setDesignation(e.target.value)}>
                    <option value="">{desigs.loading ? "Loading…" : desigs.data?.items.length ? "Choose later" : "None set up yet"}</option>
                    {(desigs.data?.items ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="hr-radio wide">
                  <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
                  <span>
                    <b>Also invite as Institution user</b>
                    <small>Sends a welcome email so they can sign in to the portal.</small>
                  </span>
                </label>
                {addErr ? (
                  <p className="page-note wide" role="alert" style={{ whiteSpace: "pre-line", margin: 0 }}>
                    {addErr}
                  </p>
                ) : null}
                <div className="hr-actions wide">
                  <button type="button" className="btn ghost" onClick={() => setShowAdd(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn pri" disabled={busy}>
                    {busy ? "Saving…" : "Create employee"}
                  </button>
                </div>
              </form>
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
