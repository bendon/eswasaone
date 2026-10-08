/**
 * Approvals inbox v2 (gap 02): Unclaimed · Mine · Team queues, family tabs from task data (no regex),
 * every module, saved views, bulk act (same doctype only), keyboard flow j/k/o/a/r/c, conflict rows,
 * snoozed alerts, daily digest preview.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon, Select, useDialogs } from "@eswasaone/shared-ui";
import { CrmBanner } from "@eswasaone/shared-ui/crm";
import { MessagePreview } from "@eswasaone/shared-ui/notify";
import { claimTask, delegatedRoles, isManager, releaseTask, snoozeTask, type TaskQueue } from "@eswasaone/shared-ui/tasks";
import { ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { PageSkeleton } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import { MODULE_FILTERS, moduleIcon } from "./inbox";
import { actorFrom } from "./live";
import { conflictOf, FAMILY_LABEL, handlerFor, slaOf, useInbox, type InboxTask } from "./model";
import { TaskDrawer } from "./TaskDrawer";
import { RowMenu, type RowMenuItem } from "./RowMenu";

type View = { id: string; label: string; queue: TaskQueue; family?: InboxTask["family"]; module?: string; sla?: "breach" | "due" | "ok" | "paused"; assignee?: string; breachOnly?: boolean; withinDays?: number; escalated?: boolean; custom?: boolean };

const BUILT_IN_VIEWS: View[] = [
  { id: "breaching", label: "My breaching", queue: "mine", breachOnly: true },
  { id: "decisions", label: "Decisions due this week", queue: "all", family: "approve", withinDays: 5 },
  { id: "escalated", label: "Escalated", queue: "team", escalated: true },
];

const VIEWS_KEY = "eswasaone.approvals.views";

type SortKey = "title" | "module" | "family" | "assignee" | "priority" | "due" | "created";

function SortTh({ k, label, sort, dir, onSort }: { k: SortKey; label: string; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void }) {
  const on = sort === k;
  return (
    <th aria-sort={on ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="eo-sort" onClick={() => onSort(k)}>
        {label}
        <span aria-hidden="true">{on ? (dir === 1 ? " ▲" : " ▼") : " ↕"}</span>
      </button>
    </th>
  );
}

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
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [queue, setQueue] = useState<TaskQueue>(() => (params.get("queue") as TaskQueue) || "all");
  const [family, setFamily] = useState<InboxTask["family"] | "">("");
  const [moduleFilter, setModuleFilter] = useState<string>("All modules");
  const [slaFilter, setSlaFilter] = useState<"" | "breach" | "due" | "ok" | "paused">("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("due");
  const [dir, setDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
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
    const slaF = view?.sla ?? slaFilter;
    const asgF = view?.assignee ?? assigneeFilter;
    if (slaF) rows = rows.filter((t) => slaOf(t).status === slaF);
    if (asgF === "__pool") rows = rows.filter((t) => !t.assignee);
    else if (asgF) rows = rows.filter((t) => t.assignee === asgF);
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter((t) => `${t.title} ${t.name} ${t.doctype} ${t.assignee ?? ""} ${t.role}`.toLowerCase().includes(s));
    }
    const pri = (t: InboxTask) => ({ breach: 0, due: 1, paused: 3, ok: 2 })[slaOf(t).status] + (t.priority === "urgent" ? -0.5 : 0);
    const key: Record<SortKey, (t: InboxTask) => string | number> = {
      title: (t) => t.title.toLowerCase(),
      module: (t) => t.module,
      family: (t) => t.family,
      assignee: (t) => t.assignee ?? "~",
      priority: pri,
      due: (t) => t.due,
      created: (t) => t.created_at,
    };
    const k = key[sort];
    rows = [...rows].sort((a, b) => {
      const x = k(a);
      const y = k(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    return rows;
  }, [inbox.tasks, moduleFilter, showSnoozed, view, q, sort, dir, slaFilter, assigneeFilter]);

  const counts = useMemo(() => {
    const c = { approve: 0, do: 0, alert: 0 };
    for (const t of filtered) c[t.family] += 1;
    return c;
  }, [filtered]);

  const effectiveFamily = view?.family ?? family;
  const allRows = effectiveFamily ? filtered.filter((t) => t.family === effectiveFamily) : filtered;
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = allRows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const assignees = useMemo(() => [...new Set(inbox.tasks.map((t) => t.assignee).filter(Boolean) as string[])].sort(), [inbox.tasks]);
  const sortBy = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(1);
    }
  };
  const resetPage = () => (setPage(0), setFocus(0));
  useEffect(resetPage, [queue, family, moduleFilter, slaFilter, assigneeFilter, q, view, pageSize]);
  const breached = filtered.filter((t) => slaOf(t).status === "breach").length;
  const dueToday = filtered.filter((t) => slaOf(t).status === "due").length;

  // Deep link: /approvals?open=NAME
  useEffect(() => {
    const key = params.get("open");
    if (!key || !inbox.tasks.length) return;
    const hit = inbox.tasks.find((t) => t.name === key || t.id === key || `${t.doctype}::${t.name}` === key);
    if (hit) {
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
    const label = await dialogs.prompt({ title: "Save view", label: "Name this view", defaultValue: `${family ? FAMILY_LABEL[family] : "All types"} · ${moduleFilter}`, confirmLabel: "Save" });
    if (!label) return;
    const v: View = { id: `v${Date.now()}`, label, queue, family: family || undefined, module: moduleFilter === "All modules" ? undefined : moduleFilter, sla: slaFilter || undefined, assignee: assigneeFilter || undefined, custom: true };
    const next = [...saved, v];
    setSaved(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const removeView = async () => {
    const name = await dialogs.prompt({ title: "Delete a saved view", label: `Type the name of the view to delete (${saved.map((v) => v.label).join(", ")})`, confirmLabel: "Delete" });
    const hit = saved.find((v) => v.label.toLowerCase() === name?.trim().toLowerCase());
    if (!hit) return;
    const next = saved.filter((v) => v.id !== hit.id);
    setSaved(next);
    if (view?.id === hit.id) setView(null);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const rowMenu = (t: InboxTask): RowMenuItem[] => {
    const acts = t.closed_at ? [] : handlerFor(t).actions(actor).filter((a) => !a.disabledReason);
    const primary = acts.find((a) => a.primary);
    const reject = acts.find((a) => /reject/.test(a.action)) ?? acts.find((a) => /return|request_info/.test(a.action));
    const items: RowMenuItem[] = [{ label: "Open details", onSelect: () => setOpen({ id: t.id }) }];
    if (primary) items.push({ label: `${primary.label}…`, onSelect: () => setOpen({ id: t.id, auto: "primary" }) });
    if (reject) items.push({ label: `${reject.label}…`, danger: /reject/.test(reject.action), onSelect: () => setOpen({ id: t.id, auto: "reject" }) });
    items.push("divider");
    if (!t.live && !t.assignee) items.push({ label: "Claim", onSelect: () => void claimTask(t.id, actor).then(() => setToast("Claimed — SLA clock started."), (e: Error) => setConflicts((c) => ({ ...c, [t.id]: e.message }))) });
    if (!t.live && t.assignee === actor.name) items.push({ label: "Release to pool", onSelect: () => void releaseTask(t.id, actor).then(() => setToast("Released to the pool.")) });
    if (!t.live) items.push({ label: "Reassign…", onSelect: () => setOpen({ id: t.id, auto: "reassign" }) });
    items.push({ label: "Escalate…", onSelect: () => setOpen({ id: t.id, auto: "escalate" }) });
    if (!t.live && t.family === "alert") items.push({ label: "Snooze 1 day", onSelect: () => void snoozeTask(t.id, 1, actor).then(() => setToast("Snoozed until tomorrow.")) });
    items.push("divider", { label: "Go to record", onSelect: () => navigate(t.link) });
    return items;
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
        <input className="crm-input" style={{ width: 240 }} placeholder="Search title, reference, person…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>

      <div className="eo-inbox__bar eo-filters">
        <Select
          value={effectiveFamily}
          onChange={(v) => (setView(null), setFamily(v as InboxTask["family"] | ""))}
          aria-label="Type"
          options={[{ value: "", label: `All types (${filtered.length})` }, ...(["approve", "do", "alert"] as const).map((f) => ({ value: f, label: `${FAMILY_LABEL[f]} (${counts[f]})` }))]}
        />
        <Select value={moduleFilter} onChange={setModuleFilter} aria-label="Module" options={[...MODULE_FILTERS]} />
        <Select
          value={slaFilter}
          onChange={(v) => setSlaFilter(v as typeof slaFilter)}
          aria-label="SLA"
          options={[
            { value: "", label: "Any SLA" },
            { value: "breach", label: "Breached" },
            { value: "due", label: "Due today / tomorrow" },
            { value: "ok", label: "On track" },
            { value: "paused", label: "Paused" },
          ]}
        />
        <Select
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          aria-label="Assignee"
          options={[{ value: "", label: "Anyone" }, { value: "__pool", label: "Unclaimed (pool)" }, ...assignees.map((a) => ({ value: a, label: a === actor.name ? `${a} (me)` : a }))]}
        />
        {family || moduleFilter !== "All modules" || slaFilter || assigneeFilter || q ? (
          <button
            type="button"
            className="crm-link"
            onClick={() => {
              setFamily("");
              setModuleFilter("All modules");
              setSlaFilter("");
              setAssigneeFilter("");
              setQ("");
              setView(null);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="eo-inbox__bar">
        <div className="crm-row crm-small" style={{ gap: 6 }}>
          Saved views
          <Select
            className="eo-views-select"
            value={view?.id ?? ""}
            onChange={(id) => {
              if (id === "__save") return void saveView();
              if (id === "__manage") return void removeView();
              setView([...BUILT_IN_VIEWS, ...saved].find((v) => v.id === id) ?? null);
            }}
            aria-label="Saved views"
            options={[
              { value: "", label: "None — use the filters" },
              ...BUILT_IN_VIEWS.map((v) => ({ value: v.id, label: v.label, group: "Standard" })),
              ...saved.map((v) => ({ value: v.id, label: v.label, group: "Mine" })),
              { value: "__save", label: "Save current filters as a view…", group: "Manage" },
              ...(saved.length ? [{ value: "__manage", label: "Delete a saved view…", group: "Manage" }] : []),
            ]}
          />
        </div>
        <span className="crm-spacer" />
        <label className="crm-check crm-small">
          <input type="checkbox" checked={showSnoozed} onChange={(e) => setShowSnoozed(e.target.checked)} /> Show snoozed
        </label>
        <span className="crm-small">
          Keys: <span className="eo-kbd">j</span>/<span className="eo-kbd">k</span> move · <span className="eo-kbd">o</span> open · <span className="eo-kbd">a</span> act · <span className="eo-kbd">r</span> reject · <span className="eo-kbd">c</span> claim
        </span>
      </div>

      {sel.length ? (
        <div className="crm-banner crm-banner--info">
          <div className="crm-row" style={{ width: "100%" }}>
            <b>{sel.length} selected</b>
            {!sameKind ? <span className="crm-small">Bulk actions only work on tasks of the same type and step.</span> : null}
            <span className="crm-spacer" />
            <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" disabled={!sameKind} onClick={() => setBulk("approve")}>
              Bulk {sel[0]?.family === "approve" ? "approve" : "complete"}
            </button>
            {sel[0]?.family === "approve" ? (
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

      <div className="crm-card crm-card--flush">
        {!allRows.length ? (
          <div className="crm-empty" style={{ border: 0 }}>
            <Icon name="i-check-c" />
            <b>Nothing here</b>
            <p>{queue === "mine" ? "No tasks assigned to you. Check Unclaimed for pool work." : "No tasks match these filters."}</p>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table eo-inbox-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={rows.length > 0 && rows.every((t) => selected.has(t.id))}
                      onChange={(e) =>
                        setSelected((cur) => {
                          const n = new Set(cur);
                          for (const t of rows) {
                            if (e.target.checked) n.add(t.id);
                            else n.delete(t.id);
                          }
                          return n;
                        })
                      }
                    />
                  </th>
                  <SortTh k="title" label="Task" sort={sort} dir={dir} onSort={sortBy} />
                  <SortTh k="module" label="Module" sort={sort} dir={dir} onSort={sortBy} />
                  <SortTh k="family" label="Type" sort={sort} dir={dir} onSort={sortBy} />
                  <SortTh k="assignee" label="Assignee" sort={sort} dir={dir} onSort={sortBy} />
                  <SortTh k="priority" label="SLA" sort={sort} dir={dir} onSort={sortBy} />
                  <SortTh k="due" label="Due" sort={sort} dir={dir} onSort={sortBy} />
                  <th className="num" style={{ width: 48 }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => {
                  const sla = slaOf(t);
                  const conflict = conflicts[t.id] ?? conflictOf(t);
                  return (
                    <tr
                      key={t.id}
                      className={`is-click${i === focus ? " is-focus" : ""}${conflict ? " is-conflict" : ""}`}
                      onClick={() => (setFocus(i), setOpen({ id: t.id }))}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.title}`} />
                      </td>
                      <td style={{ minWidth: 260 }}>
                        <b>{t.title}</b>
                        <span className="crm-small">
                          <span className="crm-mono">{t.name}</span> · {t.doctype}
                          {t.rule ? ` · ${t.rule}` : ""}
                        </span>
                        {t.escalated || t.on_behalf_of || t.live ? (
                          <span className="crm-row" style={{ gap: 4, marginTop: 4 }}>
                            {t.escalated ? <span className="crm-pill crm-pill--red">Escalated</span> : null}
                            {t.on_behalf_of ? <span className="crm-pill crm-pill--purple">for {t.on_behalf_of}</span> : null}
                            {t.live ? <span className="crm-pill">Live</span> : null}
                          </span>
                        ) : null}
                        {conflict ? <span className="crm-small" style={{ color: "var(--amber)" }}>{conflict}</span> : null}
                      </td>
                      <td>
                        <span className="crm-row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <Icon name={moduleIcon(t.module)} />
                          {t.module}
                        </span>
                      </td>
                      <td>
                        <span className={`crm-pill crm-pill--${t.family === "alert" ? "red" : t.family === "do" ? "gold" : "navy"}`}>{FAMILY_LABEL[t.family].replace(/s$/, "")}</span>
                      </td>
                      <td>
                        {t.assignee ? (
                          <>
                            {t.assignee === actor.name ? <b>Me</b> : t.assignee}
                          </>
                        ) : (
                          <span className="crm-muted">Pool</span>
                        )}
                        <span className="crm-small">{t.role}</span>
                      </td>
                      <td>
                        <span className={`crm-sla crm-sla--${sla.status}`}>{sla.label}</span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(t.due).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <RowMenu items={rowMenu(t)} label={`Actions for ${t.title}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {allRows.length ? (
          <div className="eo-pager">
            <span className="crm-small">
              {safePage * pageSize + 1}–{Math.min(allRows.length, (safePage + 1) * pageSize)} of {allRows.length}
            </span>
            <span className="crm-spacer" />
            <span className="crm-small crm-row" style={{ gap: 6 }}>
              Rows
              <Select value={String(pageSize)} onChange={(v) => setPageSize(Number(v))} options={["10", "25", "50", "100"]} aria-label="Rows per page" />
            </span>
            <button type="button" className="crm-btn crm-btn--sm" disabled={safePage === 0} onClick={() => (setPage(0), setFocus(0))} aria-label="First page">
              «
            </button>
            <button type="button" className="crm-btn crm-btn--sm" disabled={safePage === 0} onClick={() => (setPage(safePage - 1), setFocus(0))}>
              Previous
            </button>
            <span className="crm-small">
              Page {safePage + 1} of {pageCount}
            </span>
            <button type="button" className="crm-btn crm-btn--sm" disabled={safePage >= pageCount - 1} onClick={() => (setPage(safePage + 1), setFocus(0))}>
              Next
            </button>
            <button type="button" className="crm-btn crm-btn--sm" disabled={safePage >= pageCount - 1} onClick={() => (setPage(pageCount - 1), setFocus(0))} aria-label="Last page">
              »
            </button>
          </div>
        ) : null}
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
          title={bulk === "approve" ? `Bulk ${sel[0]?.family === "approve" ? "approve" : "complete"} ${sel.length} tasks` : `Reject ${sel.length} tasks`}
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
