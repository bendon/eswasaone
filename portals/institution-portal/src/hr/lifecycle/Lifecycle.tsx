import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrChanges, HrContractDefaults, HrEmployeesResponse, HrOffboardingDetail, HrOnboarding, HrOnboardingActivity, HrPickItem, HrSeparationDefaults } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill, Track } from "../../me/parts";
import { Checklist } from "../onboarding/Onboarding";
import { ItemsOutBox } from "../items/Items";
import { AccessLogSection, SensitivePanel } from "../sensitive/Sensitive";
import { LetterLink, LetterLinks } from "../letters/Letters";

/**
 * Lifecycle (journeys J8, J9; screens H2a, H7b). HR prepares a promotion, transfer or separation; another
 * HR Manager approves it in Approvals. Changes take effect on their date; on a leaver's last day the login
 * is disabled and their open tasks move to the line manager. A fixed-term contract is renewed or made permanent
 * the same way (another HR Manager approves); letting it end is a leaver.
 */

const KIND_LABEL = { promotion: "Promotion", transfer: "Transfer", separation: "Leaving", contract: "Contract" } as const;

// HR additions plan 03: an approved promotion, transfer or contract change can have its letter made here.
const LETTER_KINDS = new Set(["promotion", "transfer", "contract"]);

export function EmployeeChanges() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const [views, setViews] = useState(0);
  const res = useApiResource<HrChanges>(`/hr/employees/${encodeURIComponent(id)}/changes`, { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const base = `/hr/directory/${encodeURIComponent(id)}`;
  const leaving = d?.items.find((i) => i.kind === "separation");
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Directory", "/hr/directory"], [d.employee_name]]} />
            <div className="hr-head">
              <div>
                <h2>{d.employee_name}</h2>
                <p>Promotions, transfers and leaving. {d.status ? `Status: ${d.status}.` : ""}</p>
              </div>
              {d.status === "Active" ? (
                <div className="hr-head__r">
                  <Link className="btn ghost" to={`${base}/promote`}>
                    Promote
                  </Link>
                  <Link className="btn ghost" to={`${base}/transfer`}>
                    Transfer
                  </Link>
                  <Link className="btn ghost" to={`${base}/contract`}>
                    Contract
                  </Link>
                  {!leaving ? (
                    <Link className="btn ghost" to={`${base}/leave`}>
                      Record a leaver
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
            {d.items.length ? (
              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Date</th>
                      <th>What</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <b>{KIND_LABEL[i.kind]}</b>
                          <div className="sub mono">{i.id}</div>
                        </td>
                        <td>{fmtDay(i.date, true)}</td>
                        <td>
                          {i.changes.map((c) => (
                            <div key={c.property}>
                              {c.property}: {c.current ? `${c.current} → ` : ""}
                              <b>{c.new}</b>
                            </div>
                          ))}
                        </td>
                        <td>
                          <StatusPill cls={i.state === "Done" ? "ok" : i.state.startsWith("Waiting") ? "leave" : i.state === "Sent back" ? "bad" : "info"} label={i.state} />
                          {i.state === "Done" && LETTER_KINDS.has(i.kind) ? (
                            <div>
                              <LetterLink employee={id} sourceName={i.id} />
                            </div>
                          ) : null}
                          {i.kind === "separation" && !i.state.startsWith("Waiting") ? (
                            <div>
                              <Link className="hr-lnk" to={`/hr/offboarding/${encodeURIComponent(i.id)}`}>
                                Offboarding checklist
                              </Link>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No changes yet" detail="Promotions, transfers and leaving appear here with their approval state." />
            )}
            <section className="hr-sec" aria-label="Personal and pay">
              <h3 className="hr-sub">Personal and pay</h3>
              <div className="hr-box">
                <div className="hr-box__b">
                  <SensitivePanel employee={id} onViewed={() => setViews((n) => n + 1)} />
                </div>
              </div>
            </section>
            <AccessLogSection employee={id} refreshKey={views} />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

function usePicks(path: string) {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ items: HrPickItem[] }>(path, { enabled: Boolean(user), refreshKey: sessionKey });
  return (res.data?.items ?? []).map((x) => ({ value: x.id, label: x.title ?? x.name ?? x.employee_name ?? x.id }));
}

function Pick({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string }) {
  return (
    <label className="hr-f">
      <span>{label}</span>
      <select className="hr-in" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No change</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Sent({ id, name, kind }: { id: string; name: string; kind: string }) {
  return (
    <div className="hr hr-view">
      <Crumbs items={[["Directory", "/hr/directory"], [name, `/hr/directory/${encodeURIComponent(id)}`], ["Sent"]]} />
      <div className="hr-head">
        <div>
          <h2>{kind} sent for approval</h2>
        </div>
      </div>
      <div className="hr-box">
        <div className="hr-box__b">
          <Track
            steps={[
              { title: "Prepared", detail: "By you", state: "done" },
              { title: "Another HR Manager approves", detail: "In Approvals. You can't approve your own.", state: "now" },
              { title: "Takes effect", detail: "On its date; the record and history update then" },
            ]}
          />
        </div>
      </div>
      <NextStep title="Waiting for approval" to={`/hr/directory/${encodeURIComponent(id)}`} label="Back to the record" />
    </div>
  );
}

/** H2a Promotion or transfer: only the fields that change are sent. */
export function ChangeForm({ kind }: { kind: "promotion" | "transfer" }) {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const ch = useApiResource<HrChanges>(`/hr/employees/${encodeURIComponent(id)}/changes`, { enabled: Boolean(user), refreshKey: sessionKey });
  const designations = usePicks("/hr/designations");
  const departments = usePicks("/hr/departments");
  const grades = usePicks("/hr/grade-bands");
  const branches = usePicks("/hr/locations");
  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user), refreshKey: sessionKey });
  const managers = (people.data?.items ?? []).filter((p) => p.id !== id).map((p) => ({ value: p.id, label: p.employee_name }));

  const [effective, setEffective] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: string) => (v: string) => setVals((cur) => ({ ...cur, [k]: v }));
  const anyChange = Object.values(vals).some(Boolean);
  const title = kind === "promotion" ? "Promotion" : "Transfer";
  const name = ch.data?.employee_name ?? id;

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { effective, note: note.trim() || null, confirm: true };
      for (const [k, v] of Object.entries(vals)) if (v) body[k] = v;
      await apiFetch(`/hr/employees/${encodeURIComponent(id)}/${kind}`, { method: "POST", body: JSON.stringify(body) });
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <Sent id={id} name={name} kind={title} />;

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view hr-view--form">
        <Crumbs items={[["Directory", "/hr/directory"], [name, `/hr/directory/${encodeURIComponent(id)}`], [title]]} />
        <div className="hr-head">
          <div>
            <h2>
              {title}: {name}
            </h2>
            <p>Choose only what changes. Another HR Manager approves it; it takes effect on its date.</p>
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__b hr-form">
            <label className="hr-f">
              <span>Takes effect</span>
              <input className="hr-in" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </label>
            {kind === "transfer" ? <Pick label="New department" value={vals.department ?? ""} onChange={set("department")} options={departments} /> : null}
            <Pick label="New post" value={vals.designation ?? ""} onChange={set("designation")} options={designations} hint="A post with a vacancy in the establishment" />
            {kind === "promotion" ? <Pick label="New grade band" value={vals.grade ?? ""} onChange={set("grade")} options={grades} hint="Pay follows through payroll" /> : null}
            {kind === "transfer" ? <Pick label="New location" value={vals.branch ?? ""} onChange={set("branch")} options={branches} /> : null}
            <Pick label="New line manager" value={vals.reports_to ?? ""} onChange={set("reports_to")} options={managers} />
            <label className="hr-f wide">
              <span>Why</span>
              <textarea className="hr-in" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
        </div>
        {err ? (
          <Banner kind="bad" title="Not sent">
            {err}
          </Banner>
        ) : null}
        <div className="hr-actions">
          <Link className="btn ghost" to={`/hr/directory/${encodeURIComponent(id)}`}>
            Cancel
          </Link>
          <button type="button" className="btn pri" disabled={!effective || !anyChange || busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Send for approval"}
          </button>
        </div>
      </div>
    </RequireStaff>
  );
}

export const PromotionForm = () => <ChangeForm kind="promotion" />;
export const TransferForm = () => <ChangeForm kind="transfer" />;

/** H2a Record a leaver, with the offboarding checklist (named owners). */
export function LeaverForm() {
  const { id = "" } = useParams();
  const [search] = useSearchParams();
  const { user, sessionKey } = useInstitution();
  const def = useApiResource<HrSeparationDefaults>(`/hr/employees/${encodeURIComponent(id)}/separation-defaults`, { enabled: Boolean(user), refreshKey: sessionKey });
  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user), refreshKey: sessionKey });
  const [reason, setReason] = useState(search.get("reason") ?? "");
  const [notice, setNotice] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<HrOnboardingActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (def.data) setRows(def.data.activities.map((a) => ({ activity_name: a.activity_name, user: a.user ?? "", group: a.group })));
  }, [def.data]);
  const staff = (people.data?.items ?? []).filter((p) => p.user_id && p.id !== id);
  const missing = rows.filter((r) => !r.user).length;
  const ready = reason && lastDay && !missing;
  const name = def.data?.employee_name ?? id;

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/hr/employees/${encodeURIComponent(id)}/separation`, {
        method: "POST",
        body: JSON.stringify({ reason, last_day: lastDay, notice_date: notice || null, note: note.trim() || null, activities: rows.map((r) => ({ activity_name: r.activity_name, user: r.user })), confirm: true }),
      });
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <Sent id={id} name={name} kind="Leaver" />;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={def.loading} error={def.error} onRetry={def.reload} hasData={Boolean(def.data)} skeleton="panel">
        {def.data ? (
          <div className="hr hr-view hr-view--form">
            <Crumbs items={[["Directory", "/hr/directory"], [name, `/hr/directory/${encodeURIComponent(id)}`], ["Record a leaver"]]} />
            <div className="hr-head">
              <div>
                <h2>Record a leaver: {name}</h2>
                <p>Another HR Manager approves it. On the last day the login is disabled and open tasks move to the line manager.</p>
              </div>
            </div>
            <div className="hr-box">
              <div className="hr-box__b hr-form">
                <label className="hr-f">
                  <span>Reason</span>
                  <select className="hr-in" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Choose…</option>
                    {def.data.reasons.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  {reason === "Dismissal" ? <small>Only after a closed disciplinary case.</small> : null}
                </label>
                <label className="hr-f">
                  <span>Notice given on</span>
                  <input className="hr-in" type="date" value={notice} onChange={(e) => setNotice(e.target.value)} />
                </label>
                <label className="hr-f">
                  <span>Last working day</span>
                  <input className="hr-in" type="date" value={lastDay} min={notice || undefined} onChange={(e) => setLastDay(e.target.value)} />
                </label>
                <label className="hr-f wide">
                  <span>Notes</span>
                  <textarea className="hr-in" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="hr-box hr-scroll">
              <div className="hr-box__h">
                <div>
                  <h3>Offboarding checklist</h3>
                  <p>Every task needs a named owner</p>
                </div>
              </div>
              <table className="hr-table">
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.activity_name}>
                      <td>
                        <b>{r.activity_name}</b>
                        <div className="sub">{r.group}</div>
                      </td>
                      <td>
                        <select
                          className="hr-in"
                          aria-label={`Owner for ${r.activity_name}`}
                          value={r.user ?? ""}
                          onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))}
                        >
                          <option value="">Choose…</option>
                          {staff.map((p) => (
                            <option key={p.id} value={p.user_id!}>
                              {p.employee_name}
                            </option>
                          ))}
                          {r.user && !staff.some((p) => p.user_id === r.user) ? <option value={r.user}>{r.user}</option> : null}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err ? (
              <Banner kind="bad" title="Not sent">
                {err}
              </Banner>
            ) : null}
            <div className="hr-actions">
              <Link className="btn ghost" to={`/hr/directory/${encodeURIComponent(id)}`}>
                Cancel
              </Link>
              <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
                {busy ? "Sending…" : missing ? `${missing} task${missing === 1 ? "" : "s"} need an owner` : "Send for approval"}
              </button>
            </div>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

const CONTRACT_CHOICES = [
  { value: "Renew", title: "Renew the fixed-term contract", detail: "Same post, new end date" },
  { value: "Make permanent", title: "Make permanent", detail: "Needs a permanent post with a vacancy" },
  { value: "End", title: "Let it end", detail: "Record a leaver and start offboarding" },
] as const;

/** H2a Contract: renew to a new end date or make permanent; another HR Manager approves. Letting it end is a leaver. */
export function ContractForm() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const def = useApiResource<HrContractDefaults>(`/hr/employees/${encodeURIComponent(id)}/contract`, { enabled: Boolean(user), refreshKey: sessionKey });
  const [kind, setKind] = useState<(typeof CONTRACT_CHOICES)[number]["value"]>("Renew");
  const [newEnd, setNewEnd] = useState("");
  const [newType, setNewType] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const d = def.data;
  const name = d?.employee_name ?? id;
  const record = `/hr/directory/${encodeURIComponent(id)}`;
  const types = (d?.employment_types ?? []).filter((t) => t !== d?.employment_type);
  const ready = Boolean(reason.trim()) && (kind === "Renew" ? Boolean(newEnd) : Boolean(newType));

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/hr/employees/${encodeURIComponent(id)}/contract`, {
        method: "POST",
        body: JSON.stringify({ kind, reason: reason.trim(), new_end: kind === "Renew" ? newEnd : null, new_type: kind === "Make permanent" ? newType : null, confirm: true }),
      });
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <Sent id={id} name={name} kind="Contract change" />;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={def.loading} error={def.error} onRetry={def.reload} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view hr-view--form">
            <Crumbs items={[["Directory", "/hr/directory"], [name, record], ["Contract"]]} />
            <div className="hr-head">
              <div>
                <h2>Contract: {name}</h2>
                <p>
                  {d.employment_type ?? "Employment type not set"}
                  {d.contract_end_date ? `, ends ${fmtDay(d.contract_end_date, true)}` : ", no end date"}. Another HR Manager approves the change.
                </p>
              </div>
            </div>
            <LetterLinks employee={id} types={["Contract renewal", "Permanent appointment"]} title="Contract letters" />
            {d.pending ? (
              <Banner kind="info" title="Already waiting for approval">
                A contract change for {name} is with another HR Manager in Approvals. It shows on the record until it's decided.
              </Banner>
            ) : (
              <>
                <div className="hr-box">
                  <div className="hr-box__b hr-form">
                    <div className="hr-radios wide" role="radiogroup" aria-label="What happens to the contract">
                      {CONTRACT_CHOICES.map((c) => (
                        <label className="hr-radio" key={c.value}>
                          <input type="radio" name="contract_kind" checked={kind === c.value} onChange={() => setKind(c.value)} />
                          <span>
                            <b>{c.title}</b>
                            <small>{c.detail}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {kind === "Renew" ? (
                      <label className="hr-f">
                        <span>New end date</span>
                        <input className="hr-in" type="date" value={newEnd} min={d.contract_end_date ?? undefined} onChange={(e) => setNewEnd(e.target.value)} />
                      </label>
                    ) : null}
                    {kind === "Make permanent" ? (
                      <label className="hr-f">
                        <span>Employment type</span>
                        <select className="hr-in" value={newType} onChange={(e) => setNewType(e.target.value)}>
                          <option value="">Choose…</option>
                          {types.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        {!types.length ? <small>No other employment types are set up yet. Add them in HR setup.</small> : null}
                      </label>
                    ) : null}
                    {kind !== "End" ? (
                      <label className="hr-f wide">
                        <span>Reason</span>
                        <textarea className="hr-in" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                      </label>
                    ) : null}
                  </div>
                </div>
                {err ? (
                  <Banner kind="bad" title="Not sent">
                    {err}
                  </Banner>
                ) : null}
                <div className="hr-actions">
                  <Link className="btn ghost" to={record}>
                    Cancel
                  </Link>
                  {kind === "End" ? (
                    <Link className="btn pri" to={`${record}/leave?reason=${encodeURIComponent("End of fixed-term contract")}`}>
                      Record a leaver
                    </Link>
                  ) : (
                    <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
                      {busy ? "Sending…" : "Send for approval"}
                    </button>
                  )}
                </div>
              </>
            )}
            <NextStep title="Back to the record" to={record} label="Open the record" />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

/** H7b Offboarding checklist. */
export function OffboardingDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrOffboardingDetail>(`/hr/offboarding/${encodeURIComponent(id)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const [d, setD] = useState<HrOffboardingDetail | null>(null);
  const canWriteOff = (user?.roles ?? []).some((r) => r === "HR Manager" || r === "System Manager");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (res.data) setD(res.data);
  }, [res.data]);
  async function done(task: string) {
    setErr(null);
    try {
      const next = await apiFetch<HrOnboarding>(`/hr/onboarding/tasks/${encodeURIComponent(task)}/done`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      if (next && "activities" in next) res.reload(); // reload: the detail also carries the items still out
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not saved.");
    }
  }
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Directory", "/hr/directory"], [d.employee_name, d.employee ? `/hr/directory/${encodeURIComponent(d.employee)}` : "/hr/directory"], ["Offboarding"]]} />
            <div className="hr-head">
              <div>
                <h2>Offboarding: {d.employee_name}</h2>
                <p>
                  {d.reason ?? "Leaving"}. Last day {fmtDay(d.last_day, true)}. {d.done} of {d.total} done.
                </p>
              </div>
            </div>
            {err ? (
              <Banner kind="bad" title="Not saved">
                {err}
              </Banner>
            ) : null}
            <ItemsOutBox items={d.items_out ?? []} canWriteOff={canWriteOff} onChanged={res.reload} />
            <Checklist activities={d.activities} onDone={(t) => void done(t)} canTick />
            <Banner kind="info" title="On the last day">
              The login is disabled and open approvals and tasks move to the line manager, with the reason logged.
            </Banner>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
