/**
 * Supervisor team view (A8), delegations (A7) and my done history — gap 02.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, Select } from "@eswasaone/shared-ui";
import { CrmBanner, CrmDrawer } from "@eswasaone/shared-ui/crm";
import { fmtDate, fmtStamp } from "@eswasaone/shared-ui/record";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import {
  createDelegation,
  DEMO_STAFF,
  endDelegation,
  isActiveDelegation,
  isManager,
  listDelegations,
  listTasks,
  reassignTask,
  taskSla,
  taskStore,
  teamLoad,
  type Task,
} from "@eswasaone/shared-ui/tasks";
import { useInstitution } from "../layout/InstitutionLayout";
import { roleLabel } from "../staff";
import { actorFrom } from "./live";
import { ReassignDialog } from "./TaskDrawer";

/** Staff as grouped Select options (by team), optionally with job title. */
function staffOptions(list: typeof DEMO_STAFF, withTitle = false) {
  return [...list]
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.name, label: withTitle ? `${s.name} — ${s.title}` : s.name, group: s.team }));
}

function heat(n: number, warn = 1, bad = 3) {
  return n >= bad ? "l2" : n >= warn ? "l1" : "";
}

export function TeamView() {
  const navigate = useNavigate();
  const { user } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const res = useStoreResource([taskStore], () => ({ load: teamLoad(), tasks: listTasks(actor, { queue: "team" }) }), [actor.name]);
  const [who, setWho] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reassign, setReassign] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"load" | "pool">("load");
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!isManager(actor)) {
    return (
      <CrmBanner tone="lock">
        The team view is for supervisors and managers. Ask your manager if you need to rebalance work.
      </CrmBanner>
    );
  }
  if (!res.data) return null;
  const { load, tasks } = res.data;
  const unclaimed = tasks.filter((t) => !t.assignee);
  const theirs = who ? tasks.filter((t) => t.assignee === who) : [];
  const picked = theirs.filter((t) => sel.has(t.id));

  return (
    <div className="crm-stack">
      <div className="crm-kpis">
        <div className="crm-kpi">
          <div className="crm-kpi__l">Open tasks</div>
          <div className="crm-kpi__v">{tasks.length}</div>
        </div>
        <div className="crm-kpi crm-kpi--amber">
          <div className="crm-kpi__l">Unclaimed in pools</div>
          <div className="crm-kpi__v">{unclaimed.length}</div>
        </div>
        <div className="crm-kpi crm-kpi--red">
          <div className="crm-kpi__l">Breached</div>
          <div className="crm-kpi__v">{tasks.filter((t) => taskSla(t).status === "breach").length}</div>
        </div>
        <div className="crm-kpi">
          <div className="crm-kpi__l">On leave today</div>
          <div className="crm-kpi__v">{load.filter((l) => l.onLeave).length}</div>
        </div>
      </div>

      <div className="crm-card crm-card--flush">
        <div className="crm-card__h">
          <div className="crm-seg" role="tablist" aria-label="Team view">
            <button type="button" role="tab" aria-selected={tab === "load"} className={tab === "load" ? "on" : ""} onClick={() => setTab("load")}>
              Load per officer <span className="n">{load.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "pool"} className={tab === "pool" ? "on" : ""} onClick={() => setTab("pool")}>
              Unclaimed in pools <span className={`n${unclaimed.length ? " red" : ""}`}>{unclaimed.length}</span>
            </button>
          </div>
          <p>{tab === "load" ? "Open, due and breached tasks, average age and workload cap. Click a row to rebalance." : "Pool tasks nobody has claimed yet, oldest SLA first."}</p>
          {tab === "pool" ? (
            <Link className="crm-link" to="/approvals?queue=unclaimed">
              Open in inbox
            </Link>
          ) : null}
        </div>
        {tab === "load" ? (
        <div className="crm-table-wrap eo-scroll">
          <table className="crm-table eo-team">
            <thead>
              <tr>
                <th>Officer</th>
                <th>Team</th>
                <th className="num">Open</th>
                <th className="num">Due</th>
                <th className="num">Breached</th>
                <th className="num">Avg age</th>
                <th>Capacity</th>
              </tr>
            </thead>
            <tbody>
              {load
                .sort((a, b) => b.breached - a.breached || b.open - a.open)
                .map((l) => {
                  const pct = Math.round((l.open / l.cap) * 100);
                  return (
                    <tr key={l.name} className="is-click" onClick={() => (setWho(l.name), setSel(new Set()))}>
                      <td>
                        <b>{l.name}</b>
                        <span className="crm-small">
                          {l.title}
                          {l.onLeave ? ` · on leave (${l.leaveNote ?? "leave"})` : ""}
                        </span>
                      </td>
                      <td>{l.team}</td>
                      <td className="num">
                        <b>{l.open}</b>
                      </td>
                      <td className="num">
                        <span className={`eo-heat ${heat(l.due, 1, 3)}`}>{l.due}</span>
                      </td>
                      <td className="num">
                        <span className={`eo-heat ${heat(l.breached, 1, 2)}`}>{l.breached}</span>
                      </td>
                      <td className="num">{l.avgAgeDays}d</td>
                      <td>
                        <div className={`eo-load${pct >= 100 ? " over" : pct >= 75 ? " warn" : ""}`} title={`${l.open} of ${l.cap}`}>
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="crm-small">
                          {l.open}/{l.cap}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        ) : !unclaimed.length ? (
          <p className="crm-muted" style={{ padding: "0 20px 20px" }}>
            Every pool task has an owner.
          </p>
        ) : (
          <div className="crm-table-wrap eo-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Module</th>
                  <th>Pool role</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {[...unclaimed]
                  .sort((a, b) => a.due.localeCompare(b.due))
                  .map((t) => (
                    <tr key={t.id} className="is-click" onClick={() => navigate(`/approvals?open=${encodeURIComponent(t.name)}`)}>
                      <td>
                        <b>{t.title}</b>
                        <span className="crm-small crm-mono">{t.name}</span>
                      </td>
                      <td>{t.module}</td>
                      <td>{t.role}</td>
                      <td>
                        <span className={`crm-sla crm-sla--${taskSla(t).status}`}>{taskSla(t).label}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CrmDrawer
        open={Boolean(who)}
        wide
        title={who ?? ""}
        subtitle={`${theirs.length} open task(s) — select tasks to move them`}
        onClose={() => setWho(null)}
        footer={
          <button type="button" className="crm-btn crm-btn--pri" disabled={!picked.length} onClick={() => setReassign(true)}>
            Reassign {picked.length || ""} selected
          </button>
        }
      >
        {!theirs.length ? <p className="crm-muted">No open tasks.</p> : null}
        {theirs.map((t) => (
          <label key={t.id} className="crm-check eo-note" style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              checked={sel.has(t.id)}
              onChange={() =>
                setSel((s) => {
                  const n = new Set(s);
                  if (n.has(t.id)) n.delete(t.id);
                  else n.add(t.id);
                  return n;
                })
              }
            />
            <span style={{ flex: 1 }}>
              <b>{t.title}</b>
              <span className="crm-small">
                {t.module} · {roleLabel(t.role)} · {taskSla(t).label}
              </span>
            </span>
          </label>
        ))}
      </CrmDrawer>

      {reassign && picked.length ? (
        <ReassignDialog
          title={`Reassign ${picked.length} task(s)`}
          task={picked[0]}
          exclude={who ? [who] : []}
          onClose={() => setReassign(false)}
          onSubmit={async (to, reason) => {
            for (const t of picked) await reassignTask(t.id, to, reason, actor);
            setReassign(false);
            setSel(new Set());
            setWho(null);
            setToast(`${picked.length} task(s) moved to ${to}.`);
          }}
        />
      ) : null}
      {toast ? (
        <div className="crm-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export function DelegationsView() {
  const { user } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const res = useStoreResource([taskStore], () => listDelegations(), []);
  const [form, setForm] = useState({ from: actor.name, to: "", roles: [] as string[], start: new Date().toISOString().slice(0, 10), end: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fromPerson = DEMO_STAFF.find((s) => s.name === form.from);
  const roleChoices = fromPerson?.roles ?? actor.roles;
  const active = (res.data ?? []).filter((d) => isActiveDelegation(d));
  const forMe = active.filter((d) => d.to === actor.name);

  const submit = async () => {
    setErr(null);
    try {
      if (!form.to || !form.end) throw new Error("Choose a delegate and an end date.");
      await createDelegation({ from: form.from, to: form.to, roles: form.roles, start: new Date(form.start).toISOString(), end: new Date(`${form.end}T23:59:00`).toISOString(), note: form.note }, actor);
      setOk(`${form.to} now acts for ${form.from}${form.roles.length ? ` (${form.roles.join(", ")})` : ""}.`);
      setForm({ ...form, to: "", roles: [], end: "", note: "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="crm-grid crm-grid--main">
      <div className="crm-stack">
        {forMe.length ? (
          <CrmBanner tone="info" icon="i-users">
            You are currently acting for {forMe.map((d) => `${d.from} (until ${fmtDate(d.end)})`).join(", ")}.
          </CrmBanner>
        ) : null}
        <div className="crm-card crm-card--flush">
          <div className="crm-card__h">
            <h3>Delegations</h3>
            <p>While a delegation is active, matching tasks route to the delegate and are recorded "on behalf of" (L7). Four-eyes rules still apply.</p>
          </div>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Absent</th>
                  <th>Delegate</th>
                  <th>Roles</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(res.data ?? []).map((d) => {
                  const on = isActiveDelegation(d);
                  return (
                    <tr key={d.id}>
                      <td>
                        <b>{d.from}</b>
                        {d.note ? <span className="crm-small">{d.note}</span> : null}
                      </td>
                      <td>{d.to}</td>
                      <td>{d.roles.length ? d.roles.join(", ") : "All roles"}</td>
                      <td>
                        {fmtDate(d.start)} – {fmtDate(d.end)}
                      </td>
                      <td>
                        <span className={`crm-pill ${on ? "crm-pill--green" : "crm-pill--slate"}`}>{d.ended_at ? "Ended" : on ? "Active" : new Date(d.start) > new Date() ? "Scheduled" : "Expired"}</span>
                      </td>
                      <td className="num">
                        {on ? (
                          <button type="button" className="crm-link" onClick={() => void endDelegation(d.id, actor)}>
                            End now
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="crm-card">
        <div className="crm-card__h">
          <h3>New delegation</h3>
        </div>
        <div className="crm-form">
          <div className="crm-field">
            Who is away
            <Select
              block
              aria-label="Who is away"
              value={form.from}
              onChange={(v) => setForm({ ...form, from: v, roles: [], to: form.to === v ? "" : form.to })}
              options={[{ value: actor.name, label: `${actor.name} (me)` }, ...(isManager(actor) ? staffOptions(DEMO_STAFF.filter((s) => s.name !== actor.name)) : [])]}
            />
          </div>
          <div className="crm-field">
            Delegate
            <Select block aria-label="Delegate" placeholder="Choose who acts for them…" value={form.to} onChange={(v) => setForm({ ...form, to: v })} options={staffOptions(DEMO_STAFF.filter((s) => s.name !== form.from), true)} />
          </div>
          <div className="crm-field">
            Roles covered <span className="hint">None ticked = all roles</span>
            {roleChoices.map((r) => (
              <label key={r} className="crm-check">
                <input type="checkbox" checked={form.roles.includes(r)} onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, r] : form.roles.filter((x) => x !== r) })} /> {r}
              </label>
            ))}
          </div>
          <div className="crm-form crm-form--2">
            <label className="crm-field">
              From
              <input className="crm-input" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label className="crm-field">
              To
              <input className="crm-input" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
          </div>
          <label className="crm-field">
            Note
            <input className="crm-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Annual leave" />
          </label>
          {err ? <p className="eo-error">{err}</p> : null}
          {ok ? <p className="crm-banner crm-banner--ok" style={{ margin: 0 }}>{ok}</p> : null}
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void submit()}>
            <Icon name="i-check" /> Start delegation
          </button>
        </div>
      </div>
    </div>
  );
}

export function DoneView() {
  const { user } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const res = useStoreResource([taskStore], () => listTasks(actor, { queue: "done" }), [actor.name]);
  const [q, setQ] = useState("");
  const rows = (res.data ?? []).filter((t) => !q || `${t.title} ${t.outcome} ${t.name}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));
  return (
    <div className="crm-card crm-card--flush">
      <div className="crm-card__h">
        <h3>Handled last 30 days</h3>
        <input className="crm-input" style={{ width: 220, marginLeft: "auto" }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!rows.length ? (
        <p className="crm-muted" style={{ padding: "0 20px 20px" }}>
          Nothing yet. Tasks you close appear here with their outcome.
        </p>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Module</th>
                <th>Outcome</th>
                <th>Closed</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t: Task) => (
                <tr key={t.id}>
                  <td>
                    <Link className="crm-link" to={t.link}>
                      {t.title}
                    </Link>
                    <span className="crm-small crm-mono">{t.name}</span>
                  </td>
                  <td>{t.module}</td>
                  <td>
                    <b>{t.outcome}</b>
                    {t.on_behalf_of ? <span className="crm-small">on behalf of {t.on_behalf_of}</span> : null}
                  </td>
                  <td>{fmtStamp(t.closed_at!)}</td>
                  <td>
                    <span className={`crm-sla crm-sla--${taskSla(t).status === "breach" ? "breach" : "ok"}`}>{taskSla(t).status === "breach" ? "Late" : "In time"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
