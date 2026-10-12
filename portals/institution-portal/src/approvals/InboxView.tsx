/**
 * Approvals inbox v3 — urgency-grouped card list with inline decision forms,
 * scope chips, and a sticky context rail. Fidelity to docs/mocks/eswasaone-approvals.html.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { CrmBanner } from "@eswasaone/shared-ui/crm";
import { claimTask, delegatedRoles, type TaskQueue } from "@eswasaone/shared-ui/tasks";
import { type ActionOption, ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { PageSkeleton } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import { MODULE_FILTERS } from "./inbox";
import { actorFrom, liveAct } from "./live";
import { conflictOf, handlerFor, slaOf, useInbox, type InboxTask } from "./model";

/* ---------- types ---------- */

type Scope = "all" | "mine" | "pool" | "cover";
type Urgency = "overdue" | "today" | "week";
type KindFilter = "" | "approve" | "do" | "alert";

interface NoteState {
  [taskId: string]: string;
}
interface ErrState {
  [taskId: string]: string;
}

/* ---------- helpers ---------- */

function urgOf(t: InboxTask): Urgency {
  const s = slaOf(t).status;
  if (s === "breach") return "overdue";
  if (s === "due") return "today";
  return "week";
}

function scopeOf(t: InboxTask, actorName: string): Scope {
  if (t.on_behalf_of) return "cover";
  if (!t.assignee) return "pool";
  if (t.assignee === actorName) return "mine";
  return "all";
}

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "This week",
};

const SCOPE_LABELS: { id: Scope; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "mine", label: "Assigned to me" },
  { id: "pool", label: "Unclaimed" },
  { id: "cover", label: "Covering" },
];

const FAMILY_ICON: Record<InboxTask["family"], IconName> = {
  approve: "i-check-c",
  do: "i-clipboard",
  alert: "i-alert",
};

/** Routine approvals that can be bulk-approved (not certification decisions). */
function isBulkable(t: InboxTask): boolean {
  return t.family === "approve" && t.doctype !== "Certification Decision" && !t.on_behalf_of;
}

/** Items that need inline review before deciding (have a reject/return option). */
function needsReview(t: InboxTask, acts: ActionOption[]): boolean {
  if (t.family === "alert") return false;
  if (t.family === "do") return false;
  // Certification decisions and items with reject/return need review
  return acts.some((a) => /reject|return|request_info/.test(a.action)) || t.doctype === "Certification Decision";
}

/* ---------- component ---------- */

export function InboxView() {
  const { user, sessionKey } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [scope, setScope] = useState<Scope>("all");
  const [kind, setKind] = useState<KindFilter>("");
  const [moduleFilter, setModuleFilter] = useState<string>("All modules");
  const [q, setQ] = useState("");
  const [urg, setUrg] = useState<Urgency | "">("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<NoteState>({});
  const [errs, setErrs] = useState<ErrState>({});
  const [toast, setToast] = useState<string | null>(null);
  const [bulk, setBulk] = useState<"approve" | "reject" | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, string>>({});

  const queue: TaskQueue = "all";
  const inbox = useInbox(actor, queue, Boolean(user), sessionKey);
  const covering = delegatedRoles(actor);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* Deep link: ?open=NAME */
  useEffect(() => {
    const key = params.get("open");
    if (!key || !inbox.tasks.length) return;
    const hit = inbox.tasks.find((t) => t.name === key || t.id === key || `${t.doctype}::${t.name}` === key);
    if (hit) {
      setOpen((s) => new Set(s).add(hit.id));
    }
    params.delete("open");
    params.delete("doctype");
    setParams(params, { replace: true });
  }, [params, inbox.tasks, setParams]);

  /* ---- filtering ---- */
  const filtered = useMemo(() => {
    const now = Date.now();
    let rows = inbox.tasks.filter((t) => !t.closed_at);
    // snoozed hidden by default
    rows = rows.filter((t) => !t.snoozed_until || new Date(t.snoozed_until).getTime() < now);
    if (scope !== "all") rows = rows.filter((t) => scopeOf(t, actor.name) === scope);
    if (kind) rows = rows.filter((t) => t.family === kind);
    if (moduleFilter !== "All modules") rows = rows.filter((t) => t.module === moduleFilter);
    if (urg) rows = rows.filter((t) => urgOf(t) === urg);
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter((t) => `${t.title} ${t.name} ${t.doctype} ${t.assignee ?? ""} ${t.role}`.toLowerCase().includes(s));
    }
    // sort by urgency then due
    const ord: Record<Urgency, number> = { overdue: 0, today: 1, week: 2 };
    return [...rows].sort((a, b) => ord[urgOf(a)] - ord[urgOf(b)] || a.due.localeCompare(b.due));
  }, [inbox.tasks, scope, kind, moduleFilter, urg, q, actor.name]);

  /* ---- counts ---- */
  const counts = useMemo(() => {
    const all = inbox.tasks.filter((t) => !t.closed_at);
    const overdue = all.filter((t) => urgOf(t) === "overdue").length;
    const today = all.filter((t) => urgOf(t) === "today").length;
    const week = all.filter((t) => urgOf(t) === "week").length;
    const mine = all.filter((t) => scopeOf(t, actor.name) === "mine").length;
    const pool = all.filter((t) => scopeOf(t, actor.name) === "pool").length;
    const cover = all.filter((t) => scopeOf(t, actor.name) === "cover").length;
    return { total: all.length, overdue, today, week, mine, pool, cover };
  }, [inbox.tasks, actor.name]);

  /* ---- grouping ---- */
  const groups = useMemo(() => {
    const m: Record<Urgency, InboxTask[]> = { overdue: [], today: [], week: [] };
    for (const t of filtered) m[urgOf(t)].push(t);
    return m;
  }, [filtered]);

  /* Auto-open the first item on initial load (mockup: first overdue is expanded) */
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened || open.size > 0 || !filtered.length) return;
    const first = groups.overdue[0] ?? groups.today[0] ?? groups.week[0];
    if (first) {
      setOpen(new Set([first.id]));
      setAutoOpened(true);
    }
  }, [autoOpened, open.size, filtered.length, groups]);

  /* ---- selection / bulk ---- */
  const bulkRows = filtered.filter((t) => isBulkable(t));
  const sel = bulkRows.filter((t) => selected.has(t.id));
  const sameKind = sel.length > 0 && sel.every((t) => t.doctype === sel[0].doctype && t.state === sel[0].state);

  const toggleSel = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(bulkRows.map((t) => t.id)));
    else setSelected(new Set());
  };

  /* ---- row actions ---- */
  const toggleOpen = (id: string) => {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const setNote = (id: string, val: string) => {
    setNotes((s) => ({ ...s, [id]: val }));
    setErrs((s) => ({ ...s, [id]: "" }));
  };

  const runAction = async (t: InboxTask, action: string, requiresReason: boolean) => {
    const note = notes[t.id] ?? "";
    if (requiresReason && !note.trim()) {
      setErrs((s) => ({ ...s, [t.id]: "Add a note so the next person knows what to fix." }));
      setOpen((s) => new Set(s).add(t.id));
      return;
    }
    setActing(t.id);
    try {
      const h = handlerFor(t);
      await h.act(action, actor, { expected_state: h.currentState() ?? t.state, reason: note || undefined });
      // Use the action's consequence text as the toast, like the mockup's data-msg
      const acts = h.actions(actor);
      const opt = acts.find((a) => a.action === action);
      setToast(opt?.consequence ?? `${opt?.label ?? action} done. Find it under Done.`);
      setOpen((s) => { const n = new Set(s); n.delete(t.id); return n; });
      inbox.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrs((s) => ({ ...s, [t.id]: msg }));
      setConflicts((c) => ({ ...c, [t.id]: msg }));
    } finally {
      setActing(null);
    }
  };

  const claim = async (t: InboxTask) => {
    try {
      if (t.live) {
        // Live items: POST /approvals/{doctype}/{name}/act with action=claim
        await liveAct(t, "claim", { expected_state: t.state });
      } else {
        await claimTask(t.id, actor);
      }
      setToast("Claimed. This is now assigned to you.");
      inbox.reload();
    } catch (e) {
      setConflicts((c) => ({ ...c, [t.id]: e instanceof Error ? e.message : String(e) }));
    }
  };

  const runBulk = async (kindB: "approve" | "reject", reason?: string) => {
    let ok = 0;
    const errors: string[] = [];
    for (const t of sel) {
      const h = handlerFor(t);
      const acts = h.actions(actor);
      const a = kindB === "approve" ? acts.find((x) => x.primary && !x.disabledReason) : acts.find((x) => /reject|return|request_info/.test(x.action) && !x.disabledReason);
      if (!a) {
        errors.push(`${t.name}: no ${kindB} action`);
        continue;
      }
      try {
        await h.act(a.action, actor, { expected_state: h.currentState() ?? t.state, reason });
        ok += 1;
      } catch (e) {
        errors.push(`${t.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setSelected(new Set());
    setBulk(null);
    setToast(`${ok} done${errors.length ? ` · ${errors.length} skipped` : ""}`);
    inbox.reload();
  };

  /* ---- context rail data ---- */
  const rail = useMemo(() => {
    const coverFor = covering.map((c) => ({ from: c.from, roles: c.roles }));
    const waiting = inbox.tasks.filter((t) => t.paused && !t.closed_at).slice(0, 5);
    const routed = inbox.tasks.filter((t) => t.escalated).slice(0, 5);
    return { coverFor, waiting, routed };
  }, [covering, inbox.tasks]);

  if (inbox.loading) return <PageSkeleton variant="list" label="Loading inbox…" />;

  const headline =
    counts.total === 0
      ? "You are up to date."
      : `${counts.total} ${counts.total === 1 ? "item needs you" : "items need you"}. ${counts.overdue === 0 ? "None are overdue." : counts.overdue === 1 ? "1 is overdue." : `${counts.overdue} are overdue.`}`;

  return (
    <div className="inbox-wrap">
      <div className="inbox-head">
        <div>
          <h2>Inbox</h2>
          <p>{headline}</p>
        </div>
        <div className="inbox-summary" role="group" aria-label="Filter by due date">
          <button type="button" className="inbox-sm breach" aria-pressed={urg === "overdue"} onClick={() => setUrg(urg === "overdue" ? "" : "overdue")}>
            <span className="n">{counts.overdue}</span>
            <span className="l">Overdue</span>
          </button>
          <button type="button" className="inbox-sm due" aria-pressed={urg === "today"} onClick={() => setUrg(urg === "today" ? "" : "today")}>
            <span className="n">{counts.today}</span>
            <span className="l">Due today</span>
          </button>
          <button type="button" className="inbox-sm" aria-pressed={urg === "week"} onClick={() => setUrg(urg === "week" ? "" : "week")}>
            <span className="n">{counts.week}</span>
            <span className="l">This week</span>
          </button>
        </div>
      </div>

      {covering.length ? (
        <CrmBanner tone="info" icon="i-users">
          You're acting for <b>{covering.map((c) => c.from).join(", ")}</b>. Their items show in your inbox with "on behalf of".
        </CrmBanner>
      ) : null}

      <div className="inbox-layout">
        {/* ---- left: toolbar + groups ---- */}
        <div>
          <div className="inbox-toolbar">
            <label className="inbox-selectall">
              <input
                type="checkbox"
                className="inbox-cb"
                aria-label="Select all bulkable rows"
                checked={bulkRows.length > 0 && bulkRows.every((t) => selected.has(t.id))}
                disabled={bulkRows.length === 0}
                onChange={(e) => selectAll(e.target.checked)}
              />{" "}
              Select
            </label>
            <div className="inbox-chips" role="group" aria-label="Whose work">
              {SCOPE_LABELS.map((s) => {
                const c = s.id === "all" ? counts.total : s.id === "mine" ? counts.mine : s.id === "pool" ? counts.pool : counts.cover;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="inbox-chip"
                    aria-pressed={scope === s.id}
                    onClick={() => setScope(s.id)}
                  >
                    {s.label} <span className="c">{c}</span>
                  </button>
                );
              })}
            </div>
            <label className="sr-only" htmlFor="fKind">Kind</label>
            <select
              className="inbox-sel"
              id="fKind"
              value={kind}
              onChange={(e) => setKind(e.target.value as KindFilter)}
            >
              <option value="">All kinds</option>
              <option value="approve">Approvals</option>
              <option value="do">Tasks</option>
              <option value="alert">Alerts</option>
            </select>
            <label className="sr-only" htmlFor="fMod">Module</label>
            <select
              className="inbox-sel"
              id="fMod"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              {MODULE_FILTERS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="inbox-search">
              <Icon name="i-search" />
              <label className="sr-only" htmlFor="fQ">Search inbox</label>
              <input id="fQ" type="search" placeholder="Search by name or reference" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {/* ---- bulk bar ---- */}
          {sel.length ? (
            <div className="inbox-bulk show" role="status">
              <div className="inbox-bulk__copy">
                <b>{sel.length} selected</b>
                <span className="hint">
                  {sameKind
                    ? "Only routine approvals can be approved together. Certification decisions are decided one at a time."
                    : "Bulk actions only work on tasks of the same type and step."}
                </span>
              </div>
              <div className="r">
                <button type="button" className="bb" onClick={() => setSelected(new Set())}>Clear</button>
                <button type="button" className="bb gold" disabled={!sameKind} onClick={() => setBulk("approve")}>
                  Approve selected
                </button>
              </div>
            </div>
          ) : null}

          {/* ---- urgency groups ---- */}
          <div className="inbox-groups">
            {(Object.keys(groups) as Urgency[]).map((u) => {
              const rows = groups[u];
              if (!rows.length) return null;
              return (
                <div className="inbox-group" data-urg={u} key={u}>
                  <h3 className="inbox-group__head">
                    {URGENCY_LABEL[u]} <span className="n">{rows.length}</span>
                  </h3>
                  <div className="inbox-list">
                    {rows.map((t) => (
                      <InboxRow
                        key={t.id}
                        t={t}
                        actorName={actor.name}
                        isOpen={open.has(t.id)}
                        isSelected={selected.has(t.id)}
                        isBulkable={isBulkable(t)}
                        note={notes[t.id] ?? ""}
                        err={errs[t.id] ?? ""}
                        conflict={conflicts[t.id] ?? conflictOf(t)}
                        acting={acting === t.id}
                        onToggleOpen={() => toggleOpen(t.id)}
                        onToggleSel={() => toggleSel(t.id)}
                        onNote={(v) => setNote(t.id, v)}
                        onAction={runAction}
                        onClaim={() => void claim(t)}
                        onOpenRecord={() => navigate(t.link)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="inbox-empty">
              <b>{counts.total === 0 ? "Your inbox is clear" : "Nothing matches these filters"}</b>
              <span>
                {counts.total === 0
                  ? "New approvals, tasks and alerts will appear here as they reach you."
                  : "Clear a filter to see the rest of your inbox."}
              </span>
            </div>
          ) : null}
        </div>

        {/* ---- right: context rail ---- */}
        <aside className="inbox-rail" aria-label="Context">
          {rail.coverFor.length ? (
            <div className="inbox-card">
              <h3>Cover</h3>
              <ul>
                {rail.coverFor.map((c) => (
                  <li key={c.from}>
                    <b>You're covering {c.from}</b>
                    {c.roles.length ? c.roles.join(", ") : "All roles"}
                  </li>
                ))}
              </ul>
              <button type="button" className="lnk" onClick={() => navigate("/approvals/delegations")}>
                Manage cover
              </button>
            </div>
          ) : null}

          {rail.waiting.length ? (
            <div className="inbox-card">
              <h3>Waiting on customers</h3>
              <ul>
                {rail.waiting.map((t) => (
                  <li key={t.id}>
                    <b>{t.title}</b>
                    <span><span className="ref">{t.name}</span> · {slaOf(t).label}</span>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Nothing for you to do. These come back to your inbox only if they stall.</p>
            </div>
          ) : null}

          {rail.routed.length ? (
            <div className="inbox-card">
              <h3>Routed past you</h3>
              <ul>
                {rail.routed.map((t) => (
                  <li key={t.id}>
                    <b>{t.title}</b>
                    <span><span className="ref">{t.name}</span> went to {t.escalated?.to ?? "the next approver"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Fallback when no cover/waiting/routed — keep the rail useful */}
          {!rail.coverFor.length && !rail.waiting.length && !rail.routed.length ? (
            <>
              <div className="inbox-card">
                <h3>Your queue at a glance</h3>
                <ul>
                  <li>
                    <b>{counts.overdue} overdue</b>
                    {counts.overdue === 0 ? "Nothing is late — well done." : "These need attention first."}
                  </li>
                  <li>
                    <b>{counts.today} due today</b>
                    {counts.today === 0 ? "Nothing due today." : "Clear these before end of day."}
                  </li>
                  <li>
                    <b>{counts.pool} in the pool</b>
                    {counts.pool === 0 ? "No unclaimed work." : "Claim what you can handle."}
                  </li>
                </ul>
              </div>
              <div className="inbox-card">
                <h3>Cover</h3>
                <ul>
                  <li>
                    <b>You're not covering anyone</b>
                    Set up cover before you go on leave so approvals don't stall.
                  </li>
                </ul>
                <button type="button" className="lnk" onClick={() => navigate("/approvals/delegations")}>
                  Set up cover
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {/* ---- bulk reason dialog ---- */}
      {bulk ? (
        <ReasonDialog
          title={bulk === "approve" ? `Approve ${sel.length} selected` : `Reject ${sel.length} selected`}
          requires={bulk === "reject" ? "reason" : undefined}
          danger={bulk === "reject"}
          consequence={
            bulk === "approve"
              ? `Applies the primary action to ${sel.length} task(s). Each one is checked again before it's applied.`
              : "One reason is recorded on every selected task."
          }
          confirmLabel={bulk === "approve" ? "Approve all" : "Reject all"}
          onClose={() => setBulk(null)}
          onSubmit={async (v) => runBulk(bulk, v.reason ?? v.note)}
        >
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {sel.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        </ReasonDialog>
      ) : null}

      {toast ? (
        <div className="inbox-toast show" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- single row ---------- */

function InboxRow({
  t,
  actorName,
  isOpen,
  isSelected,
  isBulkable,
  note,
  err,
  conflict,
  acting,
  onToggleOpen,
  onToggleSel,
  onNote,
  onAction,
  onClaim,
  onOpenRecord,
}: {
  t: InboxTask;
  actorName: string;
  isOpen: boolean;
  isSelected: boolean;
  isBulkable: boolean;
  note: string;
  err: string;
  conflict: string | null;
  acting: boolean;
  onToggleOpen: () => void;
  onToggleSel: () => void;
  onNote: (v: string) => void;
  onAction: (t: InboxTask, action: string, requiresReason: boolean) => void;
  onClaim: () => void;
  onOpenRecord: () => void;
}) {
  const sla = slaOf(t);
  const handler = handlerFor(t);
  const acts = t.closed_at ? [] : handler.actions({ name: actorName, roles: [] } as never).filter((a) => !a.disabledReason);
  const primary = acts.find((a) => a.primary);
  const reject = acts.find((a) => /reject/.test(a.action)) ?? acts.find((a) => /return|request_info/.test(a.action));
  const secondary = acts.filter((a) => a !== primary && a !== reject && !a.primary);
  const review = needsReview(t, acts);
  const isPool = !t.assignee && !t.on_behalf_of && !t.live;
  const isPoolLive = !t.assignee && !t.on_behalf_of && t.live;
  const hasDetail = Boolean(t.facts && Object.keys(t.facts).length) || review || Boolean(primary?.consequence) || secondary.length > 0;

  return (
    <article className={`inbox-row fam-${t.family}${isOpen ? " open" : ""}`}>
      <div className="inbox-row__main">
        <span className="inbox-row__sel">
          {isBulkable ? (
            <input
              type="checkbox"
              className="inbox-cb"
              aria-label={`Select ${t.title}`}
              checked={isSelected}
              onChange={onToggleSel}
            />
          ) : null}
        </span>
        <span className="inbox-row__ic">
          <Icon name={FAMILY_ICON[t.family]} />
        </span>
        <div className="inbox-row__body">
          <h4 className="inbox-row__title">
            {t.title}
            <span className={`inbox-sla ${sla.status === "breach" ? "breach" : sla.status === "due" ? "due" : "ok"}`}>
              <i className="d" /> {sla.label}
            </span>
          </h4>
          <div className="inbox-row__meta">
            {t.on_behalf_of ? (
              <span className="inbox-behalf">
                <Icon name="i-swap" /> On behalf of {t.on_behalf_of}
              </span>
            ) : null}
            {isPool || isPoolLive ? <span className="inbox-pool">Unclaimed</span> : null}
            <span className="ref">{t.name}</span>
            <span className="tag">{t.module}</span>
            {t.role ? <span>{t.role}</span> : null}
          </div>
          {conflict ? <span className="inbox-err" style={{ marginTop: 4 }}>{conflict}</span> : null}
        </div>
        <div className="inbox-row__act">
          {/* Pool items: Claim button */}
          {isPool ? (
            <button type="button" className="inbox-btn pri" onClick={onClaim}>
              Claim
            </button>
          ) : isPoolLive ? (
            <button type="button" className="inbox-btn pri" disabled={acting} onClick={onClaim}>
              Claim
            </button>
          ) : review ? (
            /* Items that need review: "Review & decide" opens expansion */
            <button type="button" className="inbox-btn pri" onClick={onToggleOpen}>
              Review &amp; decide
            </button>
          ) : primary ? (
            /* Routine items: primary action executes directly */
            <button
              type="button"
              className="inbox-btn pri"
              disabled={acting}
              onClick={() => onAction(t, primary.action, Boolean(primary.requires))}
            >
              {primary.label}
            </button>
          ) : null}
          {/* Alert items may have one extra action inline (e.g. "Extend 14 days") */}
          {t.family === "alert" && secondary.slice(0, 1).map((a) => (
            <button
              key={a.action}
              type="button"
              className="inbox-btn ghost"
              disabled={acting}
              onClick={() => onAction(t, a.action, Boolean(a.requires))}
            >
              {a.label}
            </button>
          ))}
        </div>
        {hasDetail ? (
          <button
            type="button"
            className="inbox-caret"
            aria-expanded={isOpen}
            aria-label={`Details for ${t.title}`}
            onClick={onToggleOpen}
          >
            <Icon name="i-chev" />
          </button>
        ) : null}
      </div>

      {isOpen && hasDetail ? (
        <div className="inbox-row__detail">
          {/* key facts */}
          {t.facts && Object.keys(t.facts).length ? (
            <div className="inbox-kvs">
              {Object.entries(t.facts).map(([k, v]) => (
                <div key={k}>
                  <b>{k}</b>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* four-eyes check — only for items that need review */}
          {review && primary ? (
            <p className="inbox-check">
              <Icon name="i-shield" />
              You can decide this. Every decision is recorded as yours{t.on_behalf_of ? `, on behalf of ${t.on_behalf_of}` : ""}.
            </p>
          ) : null}

          {/* next-step preview */}
          {primary?.consequence ? (
            <p className="inbox-next">
              <b>What happens next:</b> {primary.consequence}
            </p>
          ) : null}

          {/* inline decision form — only for items that need review */}
          {review ? (
            <div className="inbox-decide">
              <label htmlFor={`note-${t.id}`}>
                Decision note {primary?.requires || reject?.requires ? "(required to send back or refuse)" : ""}
              </label>
              <textarea
                id={`note-${t.id}`}
                placeholder="What should the next person or the customer know?"
                value={note}
                onChange={(e) => onNote(e.target.value)}
              />
              {err ? <p className="inbox-err" role="alert">{err}</p> : null}
              <div className="inbox-decide__acts">
                {primary ? (
                  <button
                    type="button"
                    className="inbox-btn pri"
                    disabled={acting}
                    onClick={() => onAction(t, primary.action, Boolean(primary.requires))}
                  >
                    {primary.label}
                  </button>
                ) : null}
                {reject ? (
                  <button
                    type="button"
                    className={`inbox-btn ${/reject/.test(reject.action) ? "reject" : "ghost"}`}
                    disabled={acting}
                    onClick={() => onAction(t, reject.action, Boolean(reject.requires))}
                  >
                    {reject.label}
                  </button>
                ) : null}
                <button type="button" className="inbox-open-rec" onClick={onOpenRecord}>
                  Open record <Icon name="i-arrow" />
                </button>
              </div>
            </div>
          ) : (
            /* Non-review items: show secondary actions + open record */
            <div className="inbox-decide__acts">
              {secondary.map((a) => (
                <button
                  key={a.action}
                  type="button"
                  className="inbox-btn ghost"
                  disabled={acting}
                  onClick={() => onAction(t, a.action, Boolean(a.requires))}
                >
                  {a.label}
                </button>
              ))}
              <button type="button" className="inbox-open-rec" onClick={onOpenRecord}>
                Open record <Icon name="i-arrow" />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}