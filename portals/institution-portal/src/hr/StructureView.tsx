import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, AuthError, Icon, useDialogs, Select } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type {
  HrCostCentre,
  HrCostCentreCreate,
  HrCostCentresResponse,
  HrDepartment,
  HrDepartmentCreate,
  HrDepartmentsResponse,
  HrDesignation,
  HrDesignationCreate,
  HrDesignationsResponse,
  HrGradeBand,
  HrGradeBandCreate,
  HrGradeBandsResponse,
  HrLocation,
  HrLocationCreate,
  HrLocationsResponse,
} from "../api/types";

type StructureTab = "departments" | "designations" | "locations" | "cost-centres" | "grades";

const TABS: { id: StructureTab; label: string }[] = [
  { id: "departments", label: "Departments" },
  { id: "designations", label: "Designations" },
  { id: "locations", label: "Locations" },
  { id: "cost-centres", label: "Cost centres" },
  { id: "grades", label: "Grades" },
];

function parseTab(raw: string | null): StructureTab {
  if (raw && TABS.some((t) => t.id === raw)) return raw as StructureTab;
  return "departments";
}

/** Structure — live CRUD for org units (confirm-before-commit). */
export function StructureView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const dialogs = useDialogs();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));

  const depts = useApiResource<HrDepartmentsResponse>("/hr/departments?limit=200", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const designations = useApiResource<HrDesignationsResponse>("/hr/designations?limit=200", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const locations = useApiResource<HrLocationsResponse>("/hr/locations", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const costCentres = useApiResource<HrCostCentresResponse>("/hr/cost-centres", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const grades = useApiResource<HrGradeBandsResponse>("/hr/grade-bands", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const loading =
    depts.loading || designations.loading || locations.loading || costCentres.loading || grades.loading;
  const refreshing =
    depts.refreshing ||
    designations.refreshing ||
    locations.refreshing ||
    costCentres.refreshing ||
    grades.refreshing;
  const error =
    depts.error || designations.error || locations.error || costCentres.error || grades.error;
  const authRequired =
    depts.authRequired ||
    designations.authRequired ||
    locations.authRequired ||
    costCentres.authRequired ||
    grades.authRequired;

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  function setTab(next: StructureTab) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  }

  function reloadAll() {
    depts.reload();
    designations.reload();
    locations.reload();
    costCentres.reload();
    grades.reload();
  }

  const hasData =
    depts.data != null ||
    designations.data != null ||
    locations.data != null ||
    costCentres.data != null ||
    grades.data != null;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reloadAll}
        hasData={hasData}
        skeleton="list"
        label="Loading structure…"
      >
        <div className="hr">
          {dialogs.host}

          <div className="hr-box" style={{ marginBottom: 16 }}>
            <div className="hr-box__h">
              <div>
                <h3>Organisation structure</h3>
                <p>Departments, designations, locations, cost centres, and grade bands</p>
              </div>
            </div>
            <div className="hr-box__b" style={{ paddingTop: 8 }}>
              <nav className="hr-struct-tabs" aria-label="Structure sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={tab === t.id ? "on" : undefined}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {tab === "departments" ? (
            <DepartmentsPanel
              items={depts.data?.items ?? []}
              onReload={depts.reload}
              openAuth={openAuth}
              dialogs={dialogs}
            />
          ) : null}
          {tab === "designations" ? (
            <DesignationsPanel
              items={designations.data?.items ?? []}
              departments={depts.data?.items ?? []}
              grades={grades.data?.items ?? []}
              onReload={designations.reload}
              openAuth={openAuth}
              dialogs={dialogs}
            />
          ) : null}
          {tab === "locations" ? (
            <LocationsPanel
              items={locations.data?.items ?? []}
              onReload={locations.reload}
              openAuth={openAuth}
              dialogs={dialogs}
            />
          ) : null}
          {tab === "cost-centres" ? (
            <CostCentresPanel
              items={costCentres.data?.items ?? []}
              onReload={costCentres.reload}
              openAuth={openAuth}
              dialogs={dialogs}
            />
          ) : null}
          {tab === "grades" ? (
            <GradesPanel
              items={grades.data?.items ?? []}
              onReload={grades.reload}
              openAuth={openAuth}
              dialogs={dialogs}
            />
          ) : null}
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}

type Dialogs = ReturnType<typeof useDialogs>;

function DepartmentsPanel({
  items,
  onReload,
  openAuth,
  dialogs,
}: {
  items: HrDepartment[];
  onReload: () => void;
  openAuth: (reason?: string) => void;
  dialogs: Dialogs;
}) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const ok = await dialogs.confirm({
      title: "Create department",
      message: `Create department “${name.trim()}”?`,
      confirmLabel: "Create",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body: HrDepartmentCreate = {
        name: name.trim(),
        code: code.trim() || undefined,
        confirm: true,
      };
      await apiFetch<HrDepartment>("/hr/departments", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await dialogs.alert({ message: `Created department “${name.trim()}”`, kind: "success" });
      setName("");
      setCode("");
      setShow(false);
      onReload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Could not create department",
          kind: "error",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hr-filters">
        <button type="button" className="btn gold sm" onClick={() => setShow((v) => !v)}>
          <Icon name="i-plus" />
          Add department
        </button>
      </div>
      {show ? (
        <div className="hr-box hr-invite" style={{ marginBottom: 16 }}>
          <div className="hr-box__h">
            <div>
              <h3>New department</h3>
              <p>Name the unit and save to add it to the organisation.</p>
            </div>
          </div>
          <div className="hr-box__b">
            <form onSubmit={(e) => void onCreate(e)}>
              <label>
                Name
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Code
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional" />
              </label>
              <button type="submit" className="btn pri" disabled={busy}>
                {busy ? "Saving…" : "Create department"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <div className="hr-box">
        <div className="hr-box__b" style={{ paddingTop: 8, overflowX: "auto" }}>
          {items.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>No departments yet.</p>
          ) : (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Head</th>
                  <th>Designations</th>
                  <th>Filled</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b style={{ fontWeight: 700 }}>{d.name}</b>
                    </td>
                    <td className="mono">{d.code || "—"}</td>
                    <td>{d.head?.name || "—"}</td>
                    <td>{d.designation_count}</td>
                    <td>
                      {d.filled_count}
                      {d.total_positions ? ` / ${d.total_positions}` : ""}
                    </td>
                    <td>
                      <span className={`hr-st ${d.status === "active" ? "ok" : "leave"}`}>
                        <span className="d" />
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function DesignationsPanel({
  items,
  departments,
  grades,
  onReload,
  openAuth,
  dialogs,
}: {
  items: HrDesignation[];
  departments: HrDepartment[];
  grades: HrGradeBand[];
  onReload: () => void;
  openAuth: (reason?: string) => void;
  dialogs: Dialogs;
}) {
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [busy, setBusy] = useState(false);

  const deptOptions = useMemo(() => departments.slice().sort((a, b) => a.name.localeCompare(b.name)), [departments]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const ok = await dialogs.confirm({
      title: "Create designation",
      message: `Create designation “${title.trim()}”?`,
      confirmLabel: "Create",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body: HrDesignationCreate = {
        title: title.trim(),
        code: code.trim() || undefined,
        department_id: departmentId || undefined,
        grade_band_id: gradeId || undefined,
        approved_headcount: headcount ? Number(headcount) : undefined,
        confirm: true,
      };
      await apiFetch<HrDesignation>("/hr/designations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await dialogs.alert({ message: `Created designation “${title.trim()}”`, kind: "success" });
      setTitle("");
      setCode("");
      setDepartmentId("");
      setGradeId("");
      setHeadcount("");
      setShow(false);
      onReload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Could not create designation",
          kind: "error",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hr-filters">
        <button type="button" className="btn gold sm" onClick={() => setShow((v) => !v)}>
          <Icon name="i-plus" />
          Add designation
        </button>
      </div>
      {show ? (
        <div className="hr-box hr-invite" style={{ marginBottom: 16, maxWidth: 520 }}>
          <div className="hr-box__h">
            <div>
              <h3>New designation</h3>
              <p>Define the job title and link it to a department.</p>
            </div>
          </div>
          <div className="hr-box__b">
            <form onSubmit={(e) => void onCreate(e)}>
              <label>
                Title
                <input required value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                Code
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional" />
              </label>
              <label>
                Department
                <Select
                  block
                  value={departmentId}
                  onChange={setDepartmentId}
                  options={[{ value: "", label: "Unassigned" }, ...deptOptions.map((d) => ({ value: d.id, label: d.name }))]}
                />
              </label>
              <label>
                Grade band
                <Select
                  block
                  value={gradeId}
                  onChange={setGradeId}
                  options={[
                    { value: "", label: "None" },
                    ...grades.map((g) => ({ value: g.id, label: `${g.code}${g.name ? `: ${g.name}` : ""}` })),
                  ]}
                />
              </label>
              <label>
                Approved headcount
                <input
                  type="number"
                  min={0}
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <button type="submit" className="btn pri" disabled={busy}>
                {busy ? "Saving…" : "Create designation"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <div className="hr-box">
        <div className="hr-box__b" style={{ paddingTop: 8, overflowX: "auto" }}>
          {items.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>No designations yet.</p>
          ) : (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Grade</th>
                  <th>Filled</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b style={{ fontWeight: 700 }}>{row.title}</b>
                      {row.code ? (
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
                          {row.code}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.department?.name || "—"}</td>
                    <td>{row.grade_band?.code || row.grade_band?.name || "—"}</td>
                    <td>
                      {row.filled}
                      {row.total != null ? ` / ${row.total}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function LocationsPanel({
  items,
  onReload,
  openAuth,
  dialogs,
}: {
  items: HrLocation[];
  onReload: () => void;
  openAuth: (reason?: string) => void;
  dialogs: Dialogs;
}) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"" | "hq" | "lab" | "satellite">("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const ok = await dialogs.confirm({
      title: "Create location",
      message: `Create location “${name.trim()}”?`,
      confirmLabel: "Create",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body: HrLocationCreate = {
        name: name.trim(),
        code: code.trim() || undefined,
        type: type || undefined,
        confirm: true,
      };
      await apiFetch<HrLocation>("/hr/locations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await dialogs.alert({ message: `Created location “${name.trim()}”`, kind: "success" });
      setName("");
      setCode("");
      setType("");
      setShow(false);
      onReload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Could not create location",
          kind: "error",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hr-filters">
        <button type="button" className="btn gold sm" onClick={() => setShow((v) => !v)}>
          <Icon name="i-plus" />
          Add location
        </button>
      </div>
      {show ? (
        <div className="hr-box hr-invite" style={{ marginBottom: 16 }}>
          <div className="hr-box__h">
            <div>
              <h3>New location</h3>
              <p>Add a site where staff can be based.</p>
            </div>
          </div>
          <div className="hr-box__b">
            <form onSubmit={(e) => void onCreate(e)}>
              <label>
                Name
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Code
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional" />
              </label>
              <label>
                Type
                <Select
                  block
                  value={type}
                  onChange={(v) => setType(v as "" | "hq" | "lab" | "satellite")}
                  options={[
                    { value: "", label: "Unspecified" },
                    { value: "hq", label: "HQ" },
                    { value: "lab", label: "Lab" },
                    { value: "satellite", label: "Satellite" },
                  ]}
                />
              </label>
              <button type="submit" className="btn pri" disabled={busy}>
                {busy ? "Saving…" : "Create location"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <div className="hr-box">
        <div className="hr-box__b" style={{ paddingTop: 8, overflowX: "auto" }}>
          {items.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>No locations yet.</p>
          ) : (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Staff</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((loc) => (
                  <tr key={loc.id}>
                    <td>
                      <b style={{ fontWeight: 700 }}>{loc.name}</b>
                    </td>
                    <td className="mono">{loc.code || "—"}</td>
                    <td>{loc.type || "—"}</td>
                    <td>{loc.employee_count}</td>
                    <td>
                      <span className={`hr-st ${loc.status === "active" ? "ok" : "leave"}`}>
                        <span className="d" />
                        {loc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function CostCentresPanel({
  items,
  onReload,
  openAuth,
  dialogs,
}: {
  items: HrCostCentre[];
  onReload: () => void;
  openAuth: (reason?: string) => void;
  dialogs: Dialogs;
}) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const ok = await dialogs.confirm({
      title: "Create cost centre",
      message: `Create cost centre “${name.trim()}”?`,
      confirmLabel: "Create",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body: HrCostCentreCreate = {
        name: name.trim(),
        code: code.trim() || undefined,
        status: "active",
        confirm: true,
      };
      await apiFetch<HrCostCentre>("/hr/cost-centres", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await dialogs.alert({ message: `Created cost centre “${name.trim()}”`, kind: "success" });
      setName("");
      setCode("");
      setShow(false);
      onReload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Could not create cost centre",
          kind: "error",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hr-filters">
        <button type="button" className="btn gold sm" onClick={() => setShow((v) => !v)}>
          <Icon name="i-plus" />
          Add cost centre
        </button>
      </div>
      {show ? (
        <div className="hr-box hr-invite" style={{ marginBottom: 16 }}>
          <div className="hr-box__h">
            <div>
              <h3>New cost centre</h3>
              <p>Register a budget line for payroll and finance.</p>
            </div>
          </div>
          <div className="hr-box__b">
            <form onSubmit={(e) => void onCreate(e)}>
              <label>
                Name
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Code
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional" />
              </label>
              <button type="submit" className="btn pri" disabled={busy}>
                {busy ? "Saving…" : "Create cost centre"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <div className="hr-box">
        <div className="hr-box__b" style={{ paddingTop: 8, overflowX: "auto" }}>
          {items.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>No cost centres yet.</p>
          ) : (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Staff</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((cc) => (
                  <tr key={cc.id}>
                    <td>
                      <b style={{ fontWeight: 700 }}>{cc.name}</b>
                    </td>
                    <td className="mono">{cc.code || "—"}</td>
                    <td>{cc.employee_count}</td>
                    <td>
                      <span className={`hr-st ${cc.status === "active" ? "ok" : "leave"}`}>
                        <span className="d" />
                        {cc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function GradesPanel({
  items,
  onReload,
  openAuth,
  dialogs,
}: {
  items: HrGradeBand[];
  onReload: () => void;
  openAuth: (reason?: string) => void;
  dialogs: Dialogs;
}) {
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const ok = await dialogs.confirm({
      title: "Create grade band",
      message: `Create grade “${code.trim()}”?`,
      confirmLabel: "Create",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body: HrGradeBandCreate = {
        code: code.trim(),
        name: name.trim() || undefined,
        level: level ? Number(level) : undefined,
        currency: "SZL",
        confirm: true,
      };
      await apiFetch<HrGradeBand>("/hr/grade-bands", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await dialogs.alert({ message: `Created grade “${code.trim()}”`, kind: "success" });
      setCode("");
      setName("");
      setLevel("");
      setShow(false);
      onReload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Could not create grade band",
          kind: "error",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hr-filters">
        <button type="button" className="btn gold sm" onClick={() => setShow((v) => !v)}>
          <Icon name="i-plus" />
          Add grade band
        </button>
      </div>
      {show ? (
        <div className="hr-box hr-invite" style={{ marginBottom: 16 }}>
          <div className="hr-box__h">
            <div>
              <h3>New grade band</h3>
              <p>Define a grade band used by designations and pay.</p>
            </div>
          </div>
          <div className="hr-box__b">
            <form onSubmit={(e) => void onCreate(e)}>
              <label>
                Code
                <input required value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
              </label>
              <label>
                Level
                <input
                  type="number"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <button type="submit" className="btn pri" disabled={busy}>
                {busy ? "Saving…" : "Create grade band"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <div className="hr-box">
        <div className="hr-box__b" style={{ paddingTop: 8, overflowX: "auto" }}>
          {items.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>No grade bands yet.</p>
          ) : (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Level</th>
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.id}>
                    <td className="mono">{g.code}</td>
                    <td>{g.name || "—"}</td>
                    <td>{g.level ?? "—"}</td>
                    <td>
                      {g.min_salary != null || g.max_salary != null
                        ? `${g.currency || "SZL"} ${g.min_salary ?? "—"} – ${g.max_salary ?? "—"}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
