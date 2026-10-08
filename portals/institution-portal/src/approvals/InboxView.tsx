/**
 * Approvals inbox v2 (gap 02): Unclaimed · Mine · Team queues, family tabs from task data (no regex),
 * every module, saved views, bulk act (same doctype only), keyboard flow j/k/o/a/r/c, conflict rows,
 * snoozed alerts, daily digest preview.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon, useDialogs } from "@eswasaone/shared-ui";
import { CrmBanner } from "@eswasaone/shared-ui/crm";
import { MessagePreview } from "@eswasaone/shared-ui/notify";
import { claimTask, delegatedRoles, isManager, type TaskQueue } from "@eswasaone/shared-ui/tasks";
import { ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { PageSkeleton } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import { MODULE_FILTERS, moduleIcon } from "./inbox";
import { actorFrom } from "./live";
import { conflictOf, FAMILY_LABEL, handlerFor, slaOf, useInbox, type InboxTask } from "./model";
import { TaskDrawer } from "./TaskDrawer";

type View = { id: string; label: string; queue: TaskQueue; family?: InboxTask["family"]; module?: string; breachOnly?: boolean; withinDays?: number; escalated?: boolean };

const BUILT_IN_VIEWS: View[] = [
  { id: "breaching", label: "My breaching", queue: "mine", breachOnly: true },
  { id: "decisions", label: "Decisions due this week", queue: "all", family: "approve", withinDays: 5 },
  { id: "escalated", label: "Escalated", queue: "team", escalated: true },
];

const VIEWS_KEY = "eswasaone.approvals.views";

function loadViews(): View[] {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]") as View[];
  } catch {
    return [];
  }
}

export function InboxView() {
  const { user, sessionKey } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const manager = isManager(actor);
  const dialogs = useDialogs();
  const [params, setParams] = useSearchParams();
  const [queue, setQueue] = useState<TaskQueue>(() => (params.get("queue") as TaskQueue) || "all");
  const [family, setFamily] = useState<InboxTask["family"]>("approve");
  const [moduleFilter, setModuleFilter] = useState<string>("All modules");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"sla" | "priority" | "newest">("sla");
  const [view, setView] = useState<View | null>(null);
  const [saved, setSaved] = useState<View[]>(loadViews);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [open, setOpen] = useState<{ id: string; auto?: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bulk, setBulk] = useState<"approve" | "reject" | null>(null);
  const [digest, setDigest] = useState(false);
  const [conflicts, setConflicts] = useState<Record<string, string>>({});

  const inbox = useInbox(actor, view?.queue ?? queue, Boolean(user), sessionKey);
  const covering = delegatedRoles(actor);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let rows = inbox.tasks;
    const mod = view?.module ?? (moduleFilter === "All modules" ? "" : moduleFilter);
    if (mod) rows = rows.filter((t) => t.module === mod);
    if (!showSnoozed) rows = rows.filter((t) => !t.snoozed_until || new Date(t.snoozed_until).getTime() < now);
    if (view?.breachOnly) rows = rows.filter((t) => slaOf(t).status === "breach");
    if (view?.withinDays) rows = rows.filter((t) => new Date(t.due).getTime() - now < view.withinDays! * 86_400_000);
    if (view?.escalated) rows = rows.filter((t) => t.escalated || t.rule === "R-A2");
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter((t) => `${t.title} ${t.name} ${t.doctype} ${t.assignee ?? ""}`.toLowerCase().includes(s));
    }
    const pri = (t: InboxTask) => ({ breach: 0, due: 1, paused: 3, ok: 2 })[slaOf(t).status] + (t.priority === "urgent" ? -0.5 : 0);
    rows = [...rows].sort((a, b) => (sort === "newest" ? b.created_at.localeCompare(a.created_at) : sort === "priority" ? pri(a) - pri(b) : a.due.localeCompare(b.due)));
    return rows;
  }, [inbox.tasks, moduleFilter, showSnoozed, view, q, sort]);

  const counts = useMemo(() => {
    const c = { approve: 0, do: 0, alert: 0 };
    for (const t of filtered) c[t.family] += 1;
    return c;
  }, [filtered]);

  const effectiveFamily = view?.family ?? family;
  const rows = filtered.filter((t) => t.family === effectiveFamily);
  const breached = filtered.filter((t) => slaOf(t).status === "breach").length;
  const dueToday = filtered.filter((t) => slaOf(t).status === "due").length;

  // Deep link: /approvals?open=NAME
  useEffect(() => {
    const key = params.get("open");
    if (!key || !inbox.tasks.length) return;
    const hit = inbox.tasks.find((t) => t.name === key || t.id === key || `${t.doctype}::${t.name}` === key);
    if (hit) {
      setFamily(hit.family);
      setOpen({ id: hit.id });
    }
    params.delete("open");
    params.delete("doctype");
    setParams(params, { replace: true });
  }, [params, inbox.tasks, setParams]);

  // Keyboard flow (P2): j/k move, o open, a primary action, r reject/return, c claim, x select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (open || bulk || digest || ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.metaKey || e.ctrlKey) return;
      const cur = rows[focus];
      if (e.key === "j") setFocus((f) => Math.min(rows.length - 1, f + 1));
      else if (e.key === "k") setFocus((f) => Math.max(0, f - 1));
      else if (e.key === "o" && cur) setOpen({ id: cur.id });
      else if (e.key === "a" && cur) setOpen({ id: cur.id, auto: "primary" });
      else if (e.key === "r" && cur) setOpen({ id: cur.id, auto: "reject" });
      else if (e.key === "c" && cur && !cur.assignee && !cur.live) void claimTask(cur.id, actor).then(() => setToast("Claimed."));
      else if (e.key === "x" && cur) toggle(cur.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const sel = rows.filter((t) => selected.has(t.id));
  const sameKind = sel.length > 0 && sel.every((t) => t.doctype === sel[0].doctype && t.state === sel[0].state);
  const openTask = inbox.tasks.find((t) => t.id === open?.id) ?? null;

  const saveView = async () => {
    const label = await dialogs.prompt({ title: "Save view", label: "Name this view", defaultValue: `${FAMILY_LABEL[family]} · ${moduleFilter}`, confirmLabel: "Save" });
    if (!label) return;
    const v: View = { id: `v${Date.now()}`, label, queue, family, module: moduleFilter === "All modules" ? undefined : moduleFilter };
    const next = [...saved, v];
    setSaved(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const runBulk = async (kind: "approve" | "reject", reason?: string) => {
    let ok = 0;
    const errs: string[] = [];
    for (const t of sel) {
      const h = handlerFor(t);
      const acts = h.actions(actor);
      const a = kind === "approve" ? acts.find((x) => x.primary && !x.disabledReason) : acts.find((x) => /reject/.test(x.action) && !x.disabledReason) ?? acts.find((x) => /return|request_info/.test(x.action));
      if (!a) {
        errs.push(`${t.name}: no ${kind} action`);
        continue;
      }
      try {
        await h.act(a.action, actor, { expected_state: h.currentState() ?? t.state, reason });
        ok += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errs.push(`${t.name}: ${msg}`);
        setConflicts((c) => ({ ...c, [t.id]: msg }));
      }
    }
    setSelected(new Set());
    setBulk(null);
    setToast(`${ok} done${errs.length ? ` · ${errs.length} skipped` : ""}`);
    inbox.reload();
  };

  if (inbox.loading) return <PageSkeleton variant="list" label="Loading inbox…" />;

  return (
    <div className="eo-inbox">
      <div className="crm-kpis">
        <div className="crm-kpi crm-kpi--red">
          <div className="crm-kpi__l">SLA breached</div>
          <div className="crm-kpi__v">{breached}</div>
          <div className="crm-kpi__s">across all families</div>
        </div>
        <div className="crm-kpi crm-kpi--amber">
          <div className="crm-kpi__l">Due today / tomorrow</div>
          <div className="crm-kpi__v">{dueToday}</div>
        </div>
        <div className="crm-kpi">
          <div className="crm-kpi__l">In this queue</div>
          <div className="crm-kpi__v">{filtered.length}</div>
          <div className="crm-kpi__s">{inbox.liveCount ? `${inbox.liveCount} live from Frappe` : "demo + module tasks"}</div>
        </div>
        <div className="crm-kpi">
          <div className="crm-kpi__l">Daily digest</div>
          <div className="crm-kpi__v" style={{ fontSize: 15, marginTop: 10 }}>
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setDigest(true)}>
              <Icon name="i-mail" /> Preview
            </button>
          </div>
        </div>
      </div>

      {covering.length ? (
        <CrmBanner tone="info" icon="i-users">
          You're acting for <b>{covering.map((c) => c.from).join(", ")}</b> ({covering.flatMap((c) => c.roles).join(", ") || "all roles"}). Their tasks show in <b>Mine</b> with "on behalf of".
        </CrmBanner>
      ) : null}
      {inbox.liveError && !inbox.liveCount ? (
        <p className="crm-small" style={{ margin: 0 }}>
          Live Frappe queue not reachable — showing module and demo tasks. Everything you do here is saved on this device.
        </p>
      ) : null}

      <div className="eo-inbox__bar">
        <div className="crm-seg" role="tablist" aria-label="Queue">
          {(
            [
              ["unclaimed", "Unclaimed"],
              ["mine", "Mine"],
              ["all", "Everything I can see"],
              ...(manager ? ([["team", "Whole team"]] as const) : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={!view && queue === id ? "on" : ""}
              onClick={() => {
                setView(null);
                setQueue(id);
                setFocus(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="crm-spacer" />
        <select className="crm-select" style={{ width: "auto" }} value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} aria-label="Module">
          {MODULE_FILTERS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select className="crm-select" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="sla">SLA first</option>
          <option value="priority">Priority</option>
          <option value="newest">Newest</option>
        </select>
        <input className="crm-input" style={{ width: 220 }} placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>

      <div className="eo-inbox__bar">
        <span className="crm-small">Views:</span>
        {[...BUILT_IN_VIEWS, ...saved].map((v) => (
          <button key={v.id} type="button" className={`crm-pill ${view?.id === v.id ? "" : "crm-pill--outline"}`} style={{ cursor: "pointer", border: view?.id === v.id ? 0 : undefined }} onClick={() => setView(view?.id === v.id ? null : v)}>
            {v.label}
          </button>
        ))}
        <button type="button" className="crm-link" onClick={() => void saveView()}>
          + Save current view
        </button>
        <span className="crm-spacer" />
        <label className="crm-check crm-small">
          <input type="checkbox" checked={showSnoozed} onChange={(e) => setShowSnoozed(e.target.checked)} /> Show snoozed
        </label>
        <span className="crm-small">
          Keys: <span className="eo-kbd">j</span>/<span className="eo-kbd">k</span> move · <span className="eo-kbd">o</span> open · <span className="eo-kbd">a</span> act · <span className="eo-kbd">r</span> reject · <span className="eo-kbd">c</span> claim
        </span>
      </div>

      <div className="crm-tabs" role="tablist" aria-label="Family">
        {(["approve", "do", "alert"] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={effectiveFamily === f} className={effectiveFamily === f ? "on" : ""} onClick={() => (setFamily(f), setView(view?.family ? null : view), setFocus(0))}>
            {FAMILY_LABEL[f]} <span className="n">{counts[f]}</span>
          </button>
        ))}
      </div>

      {sel.length ? (
        <div className="crm-banner crm-banner--info">
          <div className="crm-row" style={{ width: "100%" }}>
            <b>{sel.length} selected</b>
            {!sameKind ? <span className="crm-small">Bulk actions only work on tasks of the same type and step.</span> : null}
            <span className="crm-spacer" />
            <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" disabled={!sameKind} onClick={() => setBulk("approve")}>
              Bulk {effectiveFamily === "approve" ? "approve" : "complete"}
            </button>
            {effectiveFamily === "approve" ? (
              <button type="button" className="crm-btn crm-btn--sm crm-btn--danger" disabled={!sameKind} onClick={() => setBulk("reject")}>
                Bulk reject (one reason)
              </button>
            ) : null}
            <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="eo-inbox__list" role="list">
        {!rows.length ? (
          <div className="crm-empty">
            <Icon name="i-check-c" />
            <b>Nothing here</b>
            <p>{queue === "mine" ? "No tasks assigned to you. Check Unclaimed for pool work." : "This queue is clear."}</p>
          </div>
        ) : (
          rows.map((t, i) => {
            const sla = slaOf(t);
            const conflict = conflicts[t.id] ?? conflictOf(t);
            return (
              <div
                key={t.id}
                role="listitem"
                className={`eo-task${i === focus ? " is-focus" : ""}${conflict ? " is-conflict" : ""}`}
                onClick={() => (setFocus(i), setOpen({ id: t.id }))}
              >
                <div className="crm-row" style={{ gap: 10 }}>
                  <input type="checkbox" checked={selected.has(t.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(t.id)} aria-label={`Select ${t.title}`} />
                  <span className={`eo-task__ic eo-task__ic--${t.family}`}>
                    <Icon name={moduleIcon(t.module)} />
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <b>{t.title}</b>
                  <div className="eo-task__meta">
                    <span className={`crm-sla crm-sla--${sla.status === "ok" ? "ok" : sla.status}`}>{sla.label}</span>
                    <span>{t.module}</span>
                    <span className="crm-mono">{t.name}</span>
                    <span>{t.assignee ? `→ ${t.assignee}` : `Pool: ${t.role}`}</span>
                    {t.on_behalf_of ? <span className="crm-pill crm-pill--purple">on behalf of {t.on_behalf_of}</span> : null}
                    {t.escalated ? <span className="crm-pill crm-pill--red">Escalated</span> : null}
                    {t.rule ? <span className="crm-pill crm-pill--slate crm-mono">{t.rule}</span> : null}
                    {t.live ? <span className="crm-pill">Live</span> : null}
                  </div>
                  {conflict ? <p className="crm-small" style={{ color: "var(--amber)", margin: "4px 0 0" }}>{conflict}</p> : null}
                </div>
                <div className="eo-task__act" onClick={(e) => e.stopPropagation()}>
                  {!t.assignee && !t.live ? (
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => void claimTask(t.id, actor).then(() => setToast("Claimed — SLA clock started.")).catch((e: Error) => setConflicts((c) => ({ ...c, [t.id]: e.message })))}>
                      Claim
                    </button>
                  ) : null}
                  <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setOpen({ id: t.id })}>
                    Open
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {openTask ? (
        <TaskDrawer
          task={openTask}
          actor={actor}
          autoAction={open?.auto}
          onClose={() => setOpen(null)}
          onDone={(msg) => {
            setToast(msg);
            setOpen(null);
            inbox.reload();
          }}
        />
      ) : null}

      {bulk ? (
        <ReasonDialog
          title={bulk === "approve" ? `Bulk ${effectiveFamily === "approve" ? "approve" : "complete"} ${sel.length} tasks` : `Reject ${sel.length} tasks`}
          requires={bulk === "reject" ? "reason" : undefined}
          danger={bulk === "reject"}
          consequence={bulk === "approve" ? `Applies the primary action to ${sel.length} ${sel[0]?.doctype} task(s) at "${sel[0]?.state}". Each one is checked again before it's applied.` : "One reason is recorded on every selected task and shown to each originator."}
          confirmLabel={bulk === "approve" ? "Apply to all" : "Reject all"}
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

      {digest ? (
        <ReasonDialog title="Daily digest (preview)" consequence="Sent at 07:00 on working days by email and PWA push. TODO: wire real — Frappe scheduler + Notification." confirmLabel="Close" onClose={() => setDigest(false)} onSubmit={async () => setDigest(false)}>
          <MessagePreview
            title="Your morning digest"
            message={{
              to: actor.name,
              subject: `EswasaOne — ${breached} breaching, ${dueToday} due today`,
              channel: ["email", "portal"],
              body: [
                `Good morning ${actor.name.split(" ")[0]},`,
                "",
                `Breaching (${breached}):`,
                ...filtered.filter((t) => slaOf(t).status === "breach").slice(0, 8).map((t) => `• ${t.title} — ${slaOf(t).label}`),
                "",
                `Due soon (${dueToday}):`,
                ...filtered.filter((t) => slaOf(t).status === "due").slice(0, 8).map((t) => `• ${t.title}`),
                "",
                "Open Approvals: /institution/approvals",
              ].join("\n"),
            }}
          />
        </ReasonDialog>
      ) : null}

      {toast ? (
        <div className="crm-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
