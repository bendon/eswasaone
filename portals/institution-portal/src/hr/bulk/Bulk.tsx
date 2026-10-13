import { useState, type ComponentProps } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch, StaffPickerDrawer } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type {
  HrBulkAction,
  HrBulkActionList,
  HrBulkKind,
  HrBulkOptions,
  HrBulkPreview,
  HrBulkReminderKind,
  HrBulkReminderResult,
  HrBulkRow,
  HrBulkSelection,
  HrBulkStatus,
  HrEmployeesResponse,
} from "../../api/types";
import { Banner, Crumbs, fmtDay, fmtRange, StatusPill, Track, type TrackStep } from "../../me/parts";
import { errorText, hrSend } from "../api";

/**
 * Bulk actions (HR additions plan 06, H18): office closure leave and yearly leave allocation for a group, through one
 * action. The stepper previews every person (problems highlighted; untick to leave someone out), then sends the action
 * to Approvals, where a named HR Manager other than the preparer (and not someone included) approves it. Approve and
 * send back happen in Approvals only. Once approved it applies in the background, with a result per person.
 * Bulk reminders need no approval. Closure dates and whether they come out of annual leave are ESWASA's (A7); nothing
 * is pre-filled. Bulk termination is out of scope.
 */

const STATUS_CLS: Record<HrBulkStatus, string> = {
  Draft: "mute",
  Waiting: "leave",
  Applying: "info",
  Applied: "ok",
  "Partly applied": "bad",
  "Not approved": "bad",
  "Sent back": "bad",
};
const RESULT_CLS: Record<string, string> = { Done: "ok", Skipped: "mute", Failed: "bad" };
type StaffMember = Parameters<ComponentProps<typeof StaffPickerDrawer>["onPick"]>[0];
const EMPTY_SELECTION: HrBulkSelection = { departments: [], employment_types: [], employees: [] };

export function BulkStatus({ status }: { status: HrBulkStatus }) {
  return <StatusPill cls={STATUS_CLS[status] ?? "info"} label={status === "Waiting" ? "Waiting for approval" : status} />;
}

function dates(a: HrBulkAction | HrBulkPreview): string {
  const p = a.parameters;
  return p.from_date ? fmtRange(p.from_date, p.to_date) : "—";
}

function what(a: HrBulkAction): string {
  const p = a.parameters;
  if (a.kind === "Office closure leave") return `${p.leave_type ?? "Leave"}, ${dates(a)}`;
  return `${p.use_policy ? "Grade leave policy" : `${p.days ?? "—"} days of ${p.leave_type ?? "leave"}`}, ${dates(a)}`;
}

/** H18 list, with the reminders panel. Reached from the Overview header and from Time off ("Office closure"). */
export function BulkActions() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrBulkActionList>("/hr/bulk", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <Crumbs items={[["Overview", "/hr"], ["Bulk actions"]]} />
        <div className="hr-head">
          <div>
            <h2>Bulk actions</h2>
            <p>{d ? `${d.waiting} waiting for approval.` : "One change for a group of people, approved in Approvals."}</p>
          </div>
          <div className="hr-head__r">
            <Link className="btn ghost" to="/hr/bulk/new?kind=closure">
              Office closure
            </Link>
            <Link className="btn pri" to="/hr/bulk/new">
              New bulk action
            </Link>
          </div>
        </div>
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
          {d ? (
            <>
              {d.approver_note ? <p className="hr-note">{d.approver_note}</p> : null}
              {!d.actions.length ? (
                <EmptyState title="No bulk actions yet" detail="Start one for an office closure or the yearly leave allocation." />
              ) : (
                <div className="hr-box hr-scroll">
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Who</th>
                        <th>People</th>
                        <th>Status</th>
                        <th>Who decides</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.actions.map((a) => (
                        <tr key={a.name}>
                          <td>
                            <Link to={`/hr/bulk/${encodeURIComponent(a.name)}`}>{a.kind}</Link>
                            <div className="sub">{what(a)}</div>
                          </td>
                          <td>{a.selection_text ?? "—"}</td>
                          <td>{a.people}</td>
                          <td>
                            <BulkStatus status={a.status} />
                            {a.summary ? <div className="sub">{a.summary}</div> : null}
                          </td>
                          <td>{a.status === "Waiting" ? a.deciders.join(", ") || "—" : a.approved_by ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <RemindersPanel kinds={d.reminder_kinds} />
            </>
          ) : null}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

/** Who: departments and employment types (Active staff), or people picked one by one. */
function WhoPicker({ options, value, onChange }: { options: HrBulkOptions; value: HrBulkSelection; onChange: (s: HrBulkSelection) => void }) {
  const [picking, setPicking] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const toggle = (key: "departments" | "employment_types", v: string, on: boolean) =>
    onChange({ ...value, employees: [], [key]: on ? [...value[key], v] : value[key].filter((x) => x !== v) });
  async function fetchStaff(q: string): Promise<StaffMember[]> {
    const r = await apiFetch<HrEmployeesResponse>(`/hr/employees?limit=50&status=Active${q ? `&q=${encodeURIComponent(q)}` : ""}`, { quiet: true });
    return r.items.map((e) => ({ username: e.id, full_name: e.employee_name ?? e.id, department: e.department ?? null }));
  }
  return (
    <div className="hr-view">
      <fieldset className="hr-box" style={{ padding: 12 }}>
        <legend>Departments (none ticked means every department)</legend>
        {options.departments.length ? (
          options.departments.map((dep) => (
            <label key={dep} className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={value.departments.includes(dep)} onChange={(e) => toggle("departments", dep, e.target.checked)} />
              <span>{dep}</span>
            </label>
          ))
        ) : (
          <p className="hr-note">No departments yet.</p>
        )}
      </fieldset>
      {options.employment_types.length ? (
        <fieldset className="hr-box" style={{ padding: 12 }}>
          <legend>Employment types (none ticked means every type)</legend>
          {options.employment_types.map((t) => (
            <label key={t} className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={value.employment_types.includes(t)} onChange={(e) => toggle("employment_types", t, e.target.checked)} />
              <span>{t}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div>
        <p className="hr-note">
          {value.employees.length
            ? `Picked: ${value.employees.map((e) => names[e] ?? e).join(", ")}. Departments and types are ignored.`
            : "Or pick people one by one."}
        </p>
        <div className="hr-actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="btn ghost" onClick={() => setPicking(true)}>
            Pick people
          </button>
          {value.employees.length ? (
            <button type="button" className="btn ghost" onClick={() => onChange({ ...value, employees: [] })}>
              Clear picked people
            </button>
          ) : null}
        </div>
      </div>
      <StaffPickerDrawer
        open={picking}
        title="Pick a person"
        onClose={() => setPicking(false)}
        fetchStaff={fetchStaff}
        onPick={(s) => {
          setNames((cur) => ({ ...cur, [s.username]: s.full_name }));
          if (!value.employees.includes(s.username)) onChange({ departments: [], employment_types: [], employees: [...value.employees, s.username] });
        }}
      />
    </div>
  );
}

/** The preview table: problems highlighted, every row a checkbox (unticked people are left out). */
export function PreviewTable({ rows, excluded, onToggle }: { rows: HrBulkRow[]; excluded?: string[]; onToggle?: (employee: string, keep: boolean) => void }) {
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            {onToggle ? <th>Include</th> : null}
            <th>Person</th>
            <th>What happens</th>
            <th>Problem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee}>
              {onToggle ? (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Include ${r.employee_name ?? r.employee}`}
                    checked={!excluded?.includes(r.employee)}
                    onChange={(e) => onToggle(r.employee, e.target.checked)}
                  />
                </td>
              ) : null}
              <td>{r.employee_name ?? r.employee}</td>
              <td>{r.planned ?? "—"}</td>
              <td>{r.problem ? <StatusPill cls="bad" label={r.problem} /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Details = { leave_type: string; from_date: string; to_date: string; reason: string; days: string; use_policy: boolean; carry_forward: boolean };
const BLANK: Details = { leave_type: "", from_date: "", to_date: "", reason: "", days: "", use_policy: false, carry_forward: false };

function parametersOf(kind: HrBulkKind, d: Details) {
  if (kind === "Office closure leave") return { leave_type: d.leave_type, from_date: d.from_date, to_date: d.to_date, reason: d.reason.trim() || null };
  return {
    leave_type: d.leave_type || null,
    from_date: d.from_date,
    to_date: d.to_date,
    days: d.use_policy ? null : Number(d.days) || null,
    use_policy: d.use_policy,
    carry_forward: d.carry_forward,
  };
}

/** New bulk action: Kind → Details → Who → Preview → Review → Submit. */
export function NewBulkAction() {
  const { user, sessionKey } = useInstitution();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const opts = useApiResource<HrBulkOptions>("/hr/bulk/options", { enabled: Boolean(user), refreshKey: sessionKey });
  const [step, setStep] = useState(params.get("kind") === "closure" ? 1 : 0);
  const [kind, setKind] = useState<HrBulkKind | "">(params.get("kind") === "closure" ? "Office closure leave" : "");
  const [details, setDetails] = useState<Details>(BLANK);
  const [selection, setSelection] = useState<HrBulkSelection>(EMPTY_SELECTION);
  const [preview, setPreview] = useState<HrBulkPreview | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<HrBulkAction | null>(null);

  const o = opts.data;
  const steps = ["Kind", "Details", "Who", "Preview", "Review", "Submit"];
  const track: TrackStep[] = steps.map((t, i) => ({ title: t, state: i < step ? "done" : i === step ? "now" : undefined }));
  const closure = kind === "Office closure leave";
  const set = (patch: Partial<Details>) => setDetails((cur) => ({ ...cur, ...patch }));
  const detailsOk =
    Boolean(details.from_date && details.to_date && details.to_date >= details.from_date) &&
    (closure ? Boolean(details.leave_type) : details.use_policy || (Boolean(details.leave_type) && Number(details.days) > 0));
  const kept = (preview?.rows ?? []).filter((r) => !excluded.includes(r.employee));

  async function runPreview() {
    if (!kind) return;
    setBusy(true);
    setErr(null);
    try {
      // The dry run writes nothing, so it goes without confirm.
      const p = await apiFetch<HrBulkPreview>("/hr/bulk/preview", { method: "POST", body: JSON.stringify({ kind, parameters: parametersOf(kind, details), selection }), quiet: true });
      setPreview(p);
      setExcluded(p.rows.filter((r) => r.problem).map((r) => r.employee)); // problem rows start unticked
      setStep(3);
    } catch (e) {
      setErr(errorText(e, "No preview."));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!kind) return;
    setBusy(true);
    setErr(null);
    try {
      const a = await hrSend<HrBulkAction>("/hr/bulk", { kind, parameters: parametersOf(kind, details), selection, exclude: excluded, note: note.trim() || null, submit: true });
      setSent(a);
      setStep(5);
    } catch (e) {
      setErr(errorText(e, "Not sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <Crumbs items={[["Bulk actions", "/hr/bulk"], ["New bulk action"]]} />
        <div className="hr-head">
          <div>
            <h2>New bulk action</h2>
            <p>A named HR Manager other than you approves it in Approvals. It applies once approved.</p>
          </div>
        </div>
        <Track steps={track} />
        <ResourceGate loading={opts.loading} error={opts.error} onRetry={opts.reload} hasData={Boolean(o)} skeleton="panel">
          {o ? (
            <div className="hr-box">
              <div className="hr-box__b">
                {step === 0 ? (
                  <div className="hr-view">
                    {o.kinds.map((k) => (
                      <label key={k} className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <input type="radio" name="bulk-kind" checked={kind === k} onChange={() => setKind(k)} />
                        <span>{k}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {step === 1 ? (
                  <div className="hr-view">
                    <p className="hr-note">{closure ? o.closure_note : o.allocation_note}</p>
                    {!closure ? (
                      <label className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={details.use_policy} onChange={(e) => set({ use_policy: e.target.checked })} />
                        <span>Use each person's grade leave policy</span>
                      </label>
                    ) : null}
                    {closure || !details.use_policy ? (
                      <label className="hr-f">
                        <span>{closure ? "Comes out of leave type" : "Leave type"}</span>
                        <select className="hr-in" aria-label="Leave type" value={details.leave_type} onChange={(e) => set({ leave_type: e.target.value })}>
                          <option value="">Choose…</option>
                          {o.leave_types.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="hr-f">
                      <span>{closure ? "First day of the closure" : "Period starts"}</span>
                      <input className="hr-in" type="date" aria-label="From" value={details.from_date} onChange={(e) => set({ from_date: e.target.value })} />
                    </label>
                    <label className="hr-f">
                      <span>{closure ? "Last day of the closure" : "Period ends"}</span>
                      <input className="hr-in" type="date" aria-label="To" value={details.to_date} onChange={(e) => set({ to_date: e.target.value })} />
                    </label>
                    {closure ? (
                      <label className="hr-f">
                        <span>Reason (optional)</span>
                        <input className="hr-in" aria-label="Reason" value={details.reason} onChange={(e) => set({ reason: e.target.value })} />
                      </label>
                    ) : null}
                    {!closure && !details.use_policy ? (
                      <label className="hr-f">
                        <span>Days each</span>
                        <input className="hr-in" type="number" min={0} step="0.5" aria-label="Days" value={details.days} onChange={(e) => set({ days: e.target.value })} />
                      </label>
                    ) : null}
                    {!closure ? (
                      <label className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={details.carry_forward} onChange={(e) => set({ carry_forward: e.target.checked })} />
                        <span>Carry forward last period's balance</span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
                {step === 2 ? <WhoPicker options={o} value={selection} onChange={setSelection} /> : null}
                {step === 3 && preview ? (
                  <div className="hr-view">
                    <p>
                      <b>{preview.selection_text}</b>: {preview.count} {preview.count === 1 ? "person" : "people"}, {preview.problems} with a problem. Untick anyone to leave
                      them out.
                    </p>
                    {preview.rows.length ? <PreviewTable rows={preview.rows} excluded={excluded} onToggle={(e, keep) => setExcluded((cur) => (keep ? cur.filter((x) => x !== e) : [...cur, e]))} /> : null}
                  </div>
                ) : null}
                {step === 4 && preview ? (
                  <div className="hr-view">
                    <p>
                      <b>{kind}</b>: {closure ? `${details.leave_type}, ${fmtRange(details.from_date, details.to_date)}` : details.use_policy ? "grade leave policy" : `${details.days} days of ${details.leave_type}`} for{" "}
                      {kept.length} {kept.length === 1 ? "person" : "people"}.
                    </p>
                    {kept.some((r) => r.problem) ? <p className="hr-note">People kept with a problem are skipped when it applies, unless the problem has gone by then.</p> : null}
                    <label className="hr-f">
                      <span>Note for the approver (optional)</span>
                      <textarea className="hr-in" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                  </div>
                ) : null}
                {step === 5 && sent ? (
                  <Banner kind="ok" title="Sent for approval">
                    Sent to {sent.deciders.join(", ") || "an HR Manager"} in Approvals. <Link to={`/hr/bulk/${encodeURIComponent(sent.name)}`}>Open the action</Link>
                  </Banner>
                ) : null}
              </div>
            </div>
          ) : null}
          {err ? (
            <Banner kind="bad" title="Not done">
              {err}
            </Banner>
          ) : null}
          {step < 5 ? (
            <div className="hr-actions">
              {step > 0 ? (
                <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              ) : (
                <Link className="btn ghost" to="/hr/bulk">
                  Cancel
                </Link>
              )}
              {step === 0 ? (
                <button type="button" className="btn pri" disabled={!kind} onClick={() => setStep(1)}>
                  Next
                </button>
              ) : null}
              {step === 1 ? (
                <button type="button" className="btn pri" disabled={!detailsOk} onClick={() => setStep(2)}>
                  Next
                </button>
              ) : null}
              {step === 2 ? (
                <button type="button" className="btn pri" disabled={busy} onClick={() => void runPreview()}>
                  {busy ? "Checking…" : "Preview"}
                </button>
              ) : null}
              {step === 3 ? (
                <button type="button" className="btn pri" disabled={!kept.length} onClick={() => setStep(4)}>
                  Review
                </button>
              ) : null}
              {step === 4 ? (
                <button type="button" className="btn pri" disabled={busy || !kept.length} onClick={() => void submit()}>
                  {busy ? "Sending…" : "Send for approval"}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="hr-actions">
              <button type="button" className="btn ghost" onClick={() => navigate("/hr/bulk")}>
                Back to bulk actions
              </button>
            </div>
          )}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

/** Detail: per-person results, who decides, and why it only partly applied. */
export function BulkActionDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const [refresh, setRefresh] = useState(0);
  const res = useApiResource<HrBulkAction>(`/hr/bulk/${encodeURIComponent(id)}`, { enabled: Boolean(user && id), refreshKey: `${sessionKey}:${refresh}` });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const a = res.data;

  async function retry() {
    setBusy(true);
    setErr(null);
    try {
      await hrSend<HrBulkAction>(`/hr/bulk/${encodeURIComponent(id)}/retry`);
      setRefresh((n) => n + 1);
    } catch (e) {
      setErr(errorText(e, "Not retried."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <Crumbs items={[["Bulk actions", "/hr/bulk"], [a?.kind ?? id]]} />
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(a)} skeleton="panel">
          {a ? (
            <>
              <div className="hr-head">
                <div>
                  <h2>{a.kind}</h2>
                  <p>
                    {what(a)} · {a.selection_text}
                  </p>
                </div>
                <div className="hr-head__r">
                  <BulkStatus status={a.status} />
                </div>
              </div>
              {a.status === "Waiting" ? (
                <Banner kind="info" title="Waiting for approval">
                  {a.deciders.length ? `${a.deciders.join(" or ")} decides in Approvals.` : "Waiting for an HR Manager in Approvals."}
                </Banner>
              ) : null}
              {a.status === "Applying" ? (
                <Banner kind="info" title="Applying">
                  Approved by {a.approved_by ?? "an HR Manager"}. It is applying in the background; refresh to see the results.
                </Banner>
              ) : null}
              {a.status === "Partly applied" ? (
                <Banner
                  kind="bad"
                  title="Partly applied"
                  action={
                    a.failed ? (
                      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void retry()}>
                        {busy ? "Retrying…" : "Retry failed"}
                      </button>
                    ) : undefined
                  }
                >
                  {a.summary}. Skipped people had a problem when it applied (shown per person). Failed ones hit an error in HRMS; retrying never repeats anyone already
                  done.
                </Banner>
              ) : null}
              {a.status === "Sent back" || a.status === "Not approved" ? (
                <Banner kind="bad" title={a.status}>
                  {a.summary}
                </Banner>
              ) : null}
              {err ? (
                <Banner kind="bad" title="Not done">
                  {err}
                </Banner>
              ) : null}
              <dl className="hr-kv">
                <div>
                  <dt>Prepared by</dt>
                  <dd>{a.prepared_by ?? "—"}</dd>
                </div>
                <div>
                  <dt>Approved by</dt>
                  <dd>{a.approved_by ?? "—"}</dd>
                </div>
                <div>
                  <dt>Decided</dt>
                  <dd>{a.decided_on ? fmtDay(a.decided_on, true) : "—"}</dd>
                </div>
                {a.note ? (
                  <div>
                    <dt>Note</dt>
                    <dd>{a.note}</dd>
                  </div>
                ) : null}
              </dl>
              {a.note_text ? <p className="hr-note">{a.note_text}</p> : null}
              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Planned</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.rows.map((r) => (
                      <tr key={r.employee}>
                        <td>{r.employee_name ?? r.employee}</td>
                        <td>
                          {r.planned ?? "—"}
                          {r.problem ? <div className="sub">{r.problem}</div> : null}
                        </td>
                        <td>
                          {r.result ? <StatusPill cls={RESULT_CLS[r.result] ?? "info"} label={r.result} /> : "—"}
                          {r.ref ? <div className="sub">{r.ref}</div> : null}
                          {r.error ? <div className="sub">{r.error}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

/** Reminders: kind → who → a preview count → Send (confirmed). At most one reminder a day per person. */
export function RemindersPanel({ kinds }: { kinds: HrBulkReminderKind[] }) {
  const { user, sessionKey } = useInstitution();
  const opts = useApiResource<HrBulkOptions>("/hr/bulk/options", { enabled: Boolean(user), refreshKey: sessionKey });
  const [kind, setKind] = useState<HrBulkReminderKind | "">("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [count, setCount] = useState<HrBulkReminderResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<HrBulkReminderResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const byDepartment = kind === "Missing required documents" || kind === "Unacknowledged items" || kind === "Open appraisal step";
  const selection = { ...EMPTY_SELECTION, departments: byDepartment ? departments : [] };

  function reset(next: Partial<{ kind: HrBulkReminderKind | ""; departments: string[] }>) {
    if (next.kind !== undefined) setKind(next.kind);
    if (next.departments) setDepartments(next.departments);
    setCount(null);
    setConfirming(false);
    setDone(null);
    setErr(null);
  }

  async function check() {
    setBusy(true);
    setErr(null);
    try {
      setCount(await apiFetch<HrBulkReminderResult>("/hr/bulk/reminders", { method: "POST", body: JSON.stringify({ kind, selection, dry_run: true }), quiet: true }));
    } catch (e) {
      setErr(errorText(e, "No count."));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      setDone(await hrSend<HrBulkReminderResult>("/hr/bulk/reminders", { kind, selection }));
      setConfirming(false);
    } catch (e) {
      setErr(errorText(e, "Not sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hr-box" aria-label="Reminders">
      <div className="hr-box__h">
        <b>Reminders</b>
        <span className="sub">No approval needed. Each person gets at most one reminder of a kind a day.</span>
      </div>
      <div className="hr-box__b hr-view">
        <label className="hr-f">
          <span>Remind about</span>
          <select className="hr-in" aria-label="Remind about" value={kind} onChange={(e) => reset({ kind: e.target.value as HrBulkReminderKind | "" })}>
            <option value="">Choose…</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {byDepartment && opts.data?.departments.length ? (
          <fieldset className="hr-box" style={{ padding: 12 }}>
            <legend>Departments (none ticked means everyone)</legend>
            {opts.data.departments.map((dep) => (
              <label key={dep} className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={departments.includes(dep)}
                  onChange={(e) => reset({ departments: e.target.checked ? [...departments, dep] : departments.filter((x) => x !== dep) })}
                />
                <span>{dep}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {count ? (
          <p>
            {kind === "Open appraisal step" ? (count.note ?? "") : `${count.count} ${count.count === 1 ? "person owes" : "people owe"} something.`}
            {count.note && kind !== "Open appraisal step" ? ` ${count.note}` : ""}
          </p>
        ) : null}
        {done ? (
          <Banner kind="ok" title="Reminders sent">
            {done.sent} sent, {done.skipped} skipped (no login, or already reminded today).
          </Banner>
        ) : null}
        {err ? (
          <Banner kind="bad" title="Not done">
            {err}
          </Banner>
        ) : null}
        <div className="hr-actions" style={{ justifyContent: "flex-start" }}>
          {!count ? (
            <button type="button" className="btn ghost" disabled={!kind || busy} onClick={() => void check()}>
              {busy ? "Counting…" : "Count"}
            </button>
          ) : confirming ? (
            <>
              <button type="button" className="btn pri" disabled={busy} onClick={() => void send()}>
                {busy ? "Sending…" : "Confirm send"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn pri" disabled={Boolean(done) || (kind !== "Open appraisal step" && !count.count)} onClick={() => setConfirming(true)}>
              Send
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
