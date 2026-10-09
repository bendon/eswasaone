/**
 * Team, Delegations, and Done views — v2 redesign matching the mockup.
 * - TeamView: load bars, availability status pills, "Needs you to unblock" action cards.
 * - DelegationsView: plain-language "Covering for me" / "I'm covering" / "Set up cover".
 * - DoneView: outcome table with Item, Reference, Outcome, When, Now.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName, ResourceGate } from "@eswasaone/shared-ui";
import { CrmBanner } from "@eswasaone/shared-ui/crm";
import { fmtStamp } from "@eswasaone/shared-ui/record";
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
  taskStore,
  type Delegation,
  type Task,
} from "@eswasaone/shared-ui/tasks";
import { useInstitution } from "../layout/InstitutionLayout";
import { actorFrom } from "./live";
import { ReassignDialog } from "./TaskDrawer";
import { slaOf, useTeamInbox, useDoneTasks } from "./model";
import { PageSkeleton } from "../components/PageStates";

/* ---------- shared helpers ---------- */

const FAMILY_ICON: Record<Task["family"], IconName> = {
  approve: "i-check-c",
  do: "i-clipboard",
  alert: "i-alert",
};

/** Plain-language work types for delegation — no raw Frappe role names. */
const WORK_TYPES = [
  "Certification decisions",
  "Suspensions and reinstatements",
  "Audit plan approvals",
  "Leave approvals for my team",
] as const;

/** Map work type → Frappe roles it covers (for the store). */
const WORK_TO_ROLES: Record<string, string[]> = {
  "Certification decisions": ["Certification Manager"],
  "Suspensions and reinstatements": ["Certification Manager"],
  "Audit plan approvals": ["Certification Manager", "Lead Auditor"],
  "Leave approvals for my team": ["HR Manager", "Leave Approver"],
};

function staffOptions(list: typeof DEMO_STAFF, withTitle = false) {
  return [...list]
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.name, label: withTitle ? `${s.name} — ${s.title}` : s.name, group: s.team }));
}

/** Check if a staff member can handle a work type (eligibility). */
function canHandle(name: string, work: string): boolean {
  const person = DEMO_STAFF.find((s) => s.name === name);
  if (!person) return false;
  const roles = WORK_TO_ROLES[work] ?? [];
  if (!roles.length) return true;
  return roles.some((r) => person.roles.includes(r));
}

/** Date overlap check. */
function overlap(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 <= b2 && b1 <= a2;
}

function fmtDay(iso: string): string {
  return new Date(iso + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ============ Team View ============ */

export function TeamView() {
  const navigate = useNavigate();
  const { user, sessionKey } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const inbox = useTeamInbox(actor, Boolean(user), sessionKey);
  const [who, setWho] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reassign, setReassign] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!isManager(actor)) {
    return (
      <CrmBanner tone="lock">
        The team view is for supervisors and managers. Ask your manager if you need to rebalance work.
      </CrmBanner>
    );
  }

  if (inbox.loading) return <PageSkeleton variant="list" label="Loading team…" />;

  const { load, tasks } = { load: inbox.load, tasks: inbox.tasks };
    const unclaimed = tasks.filter((t) => !t.assignee);
  const theirs = who ? tasks.filter((t) => t.assignee === who) : [];
  const picked = theirs.filter((t) => sel.has(t.id));

  // Unblock items: breached tasks assigned to team members
  const blocked = tasks
    .filter((t) => !t.closed_at && slaOf(t).status === "breach" && t.assignee && t.assignee !== actor.name)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6);

  // Leave without cover
  const leaveAlerts = load
    .filter((l) => l.onLeave)
    .map((l) => ({ name: l.name, leaveNote: l.leaveNote, open: l.open }));

  return (
    <div className="inbox-wrap">
      <div className="inbox-head">
        <div>
          <h2>Team</h2>
          <p>Open work for the {load.length} people who report to you, and the pool they share.</p>
        </div>
      </div>

      <div className="pane">
        {/* ---- Load table ---- */}
        <div className="sec">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Open work</th>
                  <th>Overdue</th>
                  <th>Due today</th>
                  <th>Oldest item</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {load
                  .sort((a, b) => b.breached - a.breached || b.open - a.open)
                  .map((l) => {
                    const pct = Math.round((l.open / l.cap) * 100);
                    const stClass = l.onLeave ? "warn" : l.breached > 0 ? "bad" : "ok";
                    const stLabel = l.onLeave ? `Leave ${l.leaveNote ?? ""}` : l.breached > 0 ? `${l.breached} overdue` : "In";
                    return (
                      <tr key={l.name} className="is-click" onClick={() => (setWho(l.name), setSel(new Set()))}>
                        <td className="who">
                          <b>{l.name}</b>
                          <span>{l.title}</span>
                        </td>
                        <td>
                          <div className="team-load">
                            <span><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
                            <b className="num">{l.open}</b>
                          </div>
                        </td>
                        <td>
                          {l.breached > 0 ? <span className="st bad">{l.breached}</span> : <span className="num">0</span>}
                        </td>
                        <td className="num">{l.due}</td>
                        <td className="sub">{l.avgAgeDays}d avg age</td>
                        <td><span className={`st ${stClass}`}>{stLabel}</span></td>
                      </tr>
                    );
                  })}
                {/* Pool row */}
                <tr>
                  <td className="who">
                    <b>Certification pool</b>
                    <span>Unclaimed</span>
                  </td>
                  <td>
                    <div className="team-load">
                      <span><i style={{ width: `${Math.min(100, unclaimed.length * 10)}%` }} /></span>
                      <b className="num">{unclaimed.length}</b>
                    </div>
                  </td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="sub">Anyone in Certification</td>
                  <td><span className="st mute">Anyone</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Needs you to unblock ---- */}
        {blocked.length || leaveAlerts.length ? (
          <div className="sec">
            <h3>Needs you to unblock</h3>
            <div className="inbox-list">
              {blocked.map((t) => (
                <article key={t.id} className={`inbox-row fam-${t.family}`}>
                  <div className="inbox-row__main">
                    <span className="inbox-row__ic"><Icon name={FAMILY_ICON[t.family]} /></span>
                    <div className="inbox-row__body">
                      <h4 className="inbox-row__title">
                        {t.title}
                        <span className="inbox-sla breach"><i className="d" /> {slaOf(t).label}</span>
                      </h4>
                      <div className="inbox-row__meta">
                        <span>Assigned to {t.assignee}</span>
                        <span className="ref">{t.name}</span>
                        <span className="tag">{t.module}</span>
                      </div>
                    </div>
                    <div className="inbox-row__act">
                      <button
                        type="button"
                        className="inbox-btn ghost"
                        onClick={() => setToast(`Reminder sent to ${t.assignee}.`)}
                      >
                        Remind
                      </button>
                      <button
                        type="button"
                        className="inbox-btn pri"
                        onClick={() => {
                          void reassignTask(t.id, actor.name, "Taking over — overdue", actor).then(() => {
                            setToast("Reassigned to you. It is now in your inbox.");
                            inbox.reload();
                          });
                        }}
                      >
                        Take it
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {leaveAlerts.map((l) => (
                <article key={l.name} className="inbox-row fam-alert">
                  <div className="inbox-row__main">
                    <span className="inbox-row__ic"><Icon name="i-alert" /></span>
                    <div className="inbox-row__body">
                      <h4 className="inbox-row__title">
                        {l.name} is on leave {l.leaveNote ? `(${l.leaveNote})` : ""} with no cover
                        <span className="inbox-sla due"><i className="d" /> Set cover before they go</span>
                      </h4>
                      <div className="inbox-row__meta">
                        <span>{l.open} open task(s) would wait until they are back</span>
                      </div>
                    </div>
                    <div className="inbox-row__act">
                      <button
                        type="button"
                        className="inbox-btn pri"
                        onClick={() => navigate("/approvals/delegations")}
                      >
                        Set cover
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---- Reassign drawer (simplified inline) ---- */}
      {who && theirs.length ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.3)" }} onClick={() => setWho(null)}>
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 420, background: "var(--card)", padding: 24, overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>{who}</h3>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>{theirs.length} open task(s) — select to move</p>
            {theirs.map((t) => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={sel.has(t.id)}
                  onChange={() => setSel((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                />
                <span style={{ flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{t.title}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{t.module} · {slaOf(t).label}</span>
                </span>
              </label>
            ))}
            <button
              type="button"
              className="inbox-btn pri"
              style={{ marginTop: 16 }}
              disabled={!picked.length}
              onClick={() => setReassign(true)}
            >
              Reassign {picked.length || ""} selected
            </button>
          </div>
        </div>
      ) : null}

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
            inbox.reload();
          }}
        />
      ) : null}

      {toast ? <div className="inbox-toast show" role="status">{toast}</div> : null}
    </div>
  );
}

/* ============ Delegations View ============ */

export function DelegationsView() {
  const { user } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const res = useStoreResource([taskStore], () => listDelegations(), []);
  const [form, setForm] = useState({
    to: "",
    start: new Date().toISOString().slice(0, 10),
    end: "",
    works: ["Certification decisions", "Suspensions and reinstatements", "Audit plan approvals", "Leave approvals for my team"] as string[],
    note: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const delegations = res.data ?? [];
  const active = delegations.filter((d) => isActiveDelegation(d));
  const coveringForMe = active.filter((d) => d.from === actor.name);
  const imCovering = active.filter((d) => d.to === actor.name);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggleWork = (work: string) => {
    setForm((f) => ({
      ...f,
      works: f.works.includes(work) ? f.works.filter((w) => w !== work) : [...f.works, work],
    }));
  };

  const validate = (): string | null => {
    if (!form.to) return "Choose the colleague who will cover you.";
    if (!form.start || !form.end) return "Choose the first and last day of cover.";
    const from = new Date(form.start + "T00:00");
    const to = new Date(form.end + "T00:00");
    if (to < from) return "The last day is before the first day.";
    if (!form.works.length) return "Choose at least one kind of work to hand over.";
    // eligibility checks
    for (const w of form.works) {
      if (!canHandle(form.to, w)) {
        const first = form.to.split(" ")[0];
        return `${first} can't handle "${w}". Choose someone with the right role, or untick that work.`;
      }
    }
    // overlap with existing cover-for-me
    for (const d of coveringForMe) {
      const dStart = new Date(d.start);
      const dEnd = new Date(d.end);
      if (overlap(from, to, dStart, dEnd)) {
        return `${d.to} already covers you from ${fmtDay(d.start.slice(0, 10))} to ${fmtDay(d.end.slice(0, 10))}. Change the dates or cancel that cover first.`;
      }
    }
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    try {
      const roles = [...new Set(form.works.flatMap((w) => WORK_TO_ROLES[w] ?? []))];
      await createDelegation({
        from: actor.name,
        to: form.to,
        roles,
        start: new Date(form.start).toISOString(),
        end: new Date(`${form.end}T23:59:00`).toISOString(),
        note: form.note,
      }, actor);
      setOk(`Cover set. ${form.to} has been told.`);
      setToast(`Cover set. ${form.to} has been told.`);
      setForm({ ...form, to: "", end: "", note: "" });
      res.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const cancelCover = async (d: Delegation) => {
    await endDelegation(d.id, actor);
    setToast("Cover cancelled. Your approvals stay with you.");
    res.reload();
  };

  return (
    <ResourceGate res={res} what="Delegations" notConnectedDetail="Delegations are managed by the Core Engine's approval delegation records, which are not live yet.">
      {() => (
        <div className="inbox-wrap">
          <div className="inbox-head">
            <div>
              <h2>Delegations</h2>
              <p>Who handles your approvals while you're away, and whose you're handling.</p>
            </div>
          </div>

          <div className="pane">
            {/* ---- Covering for me ---- */}
            <div className="sec">
              <h3>Covering for me</h3>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Colleague</th>
                      <th>Dates</th>
                      <th>Which work</th>
                      <th>Status</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coveringForMe.length ? coveringForMe.map((d) => {
                      const person = DEMO_STAFF.find((s) => s.name === d.to);
                      return (
                        <tr key={d.id}>
                          <td className="who">
                            <b>{d.to}</b>
                            <span>{person?.title ?? ""}</span>
                          </td>
                          <td>{fmtDay(d.start.slice(0, 10))} to {fmtDay(d.end.slice(0, 10))}</td>
                          <td>
                            {d.roles.length
                              ? WORK_TYPES.filter((w) => (WORK_TO_ROLES[w] ?? []).some((r) => d.roles.includes(r))).join(", ") || d.roles.join(", ")
                              : "All work"}
                          </td>
                          <td><span className="st ok">Active</span></td>
                          <td>
                            <button type="button" className="inbox-btn ghost" onClick={() => void cancelCover(d)}>
                              Cancel
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                          Nobody is covering you right now.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- I'm covering ---- */}
            <div className="sec">
              <h3>I'm covering</h3>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>For</th>
                      <th>Until</th>
                      <th>Which work</th>
                      <th>In my inbox now</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imCovering.length ? imCovering.map((d) => {
                      const person = DEMO_STAFF.find((s) => s.name === d.from);
                      const tasks = listTasks(actor, { queue: "mine" }).filter((t) => t.on_behalf_of === d.from);
                      return (
                        <tr key={d.id}>
                          <td className="who">
                            <b>{d.from}</b>
                            <span>{person?.title ?? ""}</span>
                          </td>
                          <td>{fmtDay(d.end.slice(0, 10))}</td>
                          <td>
                            {d.roles.length
                              ? WORK_TYPES.filter((w) => (WORK_TO_ROLES[w] ?? []).some((r) => d.roles.includes(r))).join(", ") || d.roles.join(", ")
                              : "All work"}
                          </td>
                          <td className="num">{tasks.length}</td>
                          <td><span className="st ok">Active</span></td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                          You're not covering anyone right now.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- Set up cover ---- */}
            <div className="sec">
              <h3>Set up cover</h3>
              <p>Your colleague acts with their own login. Every decision is recorded as theirs, on your behalf. Anything they aren't allowed to decide goes to the Head of Certification instead.</p>
              <form
                className="dlg-form"
                noValidate
                onSubmit={(e) => { e.preventDefault(); void submit(); }}
              >
                <div className="dlg-f full">
                  <label htmlFor="dCol">Colleague</label>
                  <select
                    id="dCol"
                    value={form.to}
                    onChange={(e) => setForm({ ...form, to: e.target.value })}
                  >
                    <option value="">Choose a colleague</option>
                    {staffOptions(DEMO_STAFF.filter((s) => s.name !== actor.name), true).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="dlg-f">
                  <label htmlFor="dFrom">From</label>
                  <input type="date" id="dFrom" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                </div>
                <div className="dlg-f">
                  <label htmlFor="dTo">To</label>
                  <input type="date" id="dTo" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                </div>

                <fieldset className="dlg-f full">
                  <legend>Which work</legend>
                  <div className="dlg-checks">
                    {WORK_TYPES.map((w) => (
                      <label key={w}>
                        <input
                          type="checkbox"
                          className="inbox-cb"
                          checked={form.works.includes(w)}
                          onChange={() => toggleWork(w)}
                        />{" "}
                        {w}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="dlg-f full">
                  <label htmlFor="dWhy">Reason (optional)</label>
                  <input
                    type="text"
                    id="dWhy"
                    placeholder="Annual leave, travel"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>

                {err ? <p className="inbox-err full" role="alert">{err}</p> : null}
                {ok ? <p className="full" style={{ color: "var(--green-ink, var(--green))", fontWeight: 600, fontSize: 13 }}>{ok}</p> : null}

                <div className="dlg-acts full">
                  <button type="submit" className="inbox-btn pri">
                    Set cover
                  </button>
                </div>
              </form>
            </div>
          </div>

          {toast ? <div className="inbox-toast show" role="status">{toast}</div> : null}
        </div>
      )}
    </ResourceGate>
  );
}

/* ============ Done View ============ */

/** Outcome → status pill class. */
function outcomeClass(outcome: string): string {
  const o = outcome.toLowerCase();
  if (/grant|approve|reinstate|issue|complete|done|acknowledge/.test(o)) return "ok";
  if (/send back|return|request/.test(o)) return "warn";
  if (/refus|reject|decline|revoke|suspend/.test(o)) return "bad";
  if (/extend|snooz|dismiss/.test(o)) return "mute";
  return "info";
}

export function DoneView() {
  const { user, sessionKey } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const done = useDoneTasks(actor, Boolean(user), sessionKey);
  const [q, setQ] = useState("");
  const rows = done.tasks
    .filter((t) => !q || `${t.title} ${t.outcome} ${t.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));

  if (done.loading) return <PageSkeleton variant="list" label="Loading done history…" />;

  return (
    <div className="inbox-wrap">
      <div className="inbox-head">
        <div>
          <h2>Done</h2>
          <p>What you decided or completed in the last 7 days. Decisions can't be changed here. Open the record to see what happened next.</p>
        </div>
        <div className="inbox-search" style={{ maxWidth: 280, flex: "0 1 280px" }}>
          <Icon name="i-search" />
          <label className="sr-only" htmlFor="doneQ">Search done history</label>
          <input id="doneQ" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {done.notConnected && !rows.length ? (
        <div className="inbox-empty">
          <b>Done history isn't available yet</b>
          <span>The Core Engine's approval system doesn't expose completed items yet. Tasks you close through the inbox will appear here once the live endpoint is wired.</span>
        </div>
      ) : !rows.length ? (
        <div className="inbox-empty">
          <b>Nothing yet</b>
          <span>Tasks you close appear here with their outcome.</span>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th>Reference</th>
                <th>Outcome</th>
                <th>When</th>
                <th>Now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t: Task) => (
                <tr key={t.id}>
                  <td className="who">
                    <b>{t.title}</b>
                    <span>{t.module}{t.on_behalf_of ? ` · on behalf of ${t.on_behalf_of}` : ""}</span>
                  </td>
                  <td className="mono">{t.name}</td>
                  <td>
                    <span className={`st ${outcomeClass(t.outcome ?? "")}`}>{t.outcome ?? "Completed"}</span>
                  </td>
                  <td>{fmtStamp(t.closed_at!)}</td>
                  <td className="sub">
                    {slaOf(t).status === "breach" ? "Late but done" : "Done in time"}
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