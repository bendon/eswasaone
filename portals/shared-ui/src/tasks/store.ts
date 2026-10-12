/**
 * Task store — the single staff inbox (workflow map invariant 6, §5.2–5.4; gap 01 C4, gap 02).
 *
 * Every domain-store transition that hands work to a person opens a task here; the task closes when
 * the record leaves that state (L2). Dedupe key = {doctype, name, state, seq} (L3).
 * TODO: wire real — GET /approvals (ToDos), POST /approvals/{dt}/{name}/claim | reassign | escalate,
 *       HRMS Delegation DocType for delegations.
 */
import { addWorkingDays, workingDaysBetween } from "../crm/sla";
import { createLocalStore, isoIn, nowIso, uid } from "../store/localStore";
import type { Actor, TaskFamily, WfRecord, WorkflowDef } from "../workflow/types";
import { stateDef, SUPER_ROLES } from "../workflow/engine";
import { DEMO_STAFF, onLeave, staffByName } from "./staff";

export type TaskModule =
  | "CRM"
  | "Certification"
  | "Metrology"
  | "Standards"
  | "Governance"
  | "Finance"
  | "Training"
  | "Field"
  | "Procurement"
  | "E-store"
  | "HR"
  | "WTO/TBT";

export type Task = {
  id: string;
  doctype: string;
  name: string;
  state: string;
  seq: number;
  family: TaskFamily;
  verb?: string;
  role: string;
  assignee?: string;
  claimed_at?: string;
  on_behalf_of?: string;
  created_at: string;
  due: string;
  /** SLA paused (record waits on the customer). */
  paused?: boolean;
  rule?: string;
  title: string;
  module: TaskModule;
  /** Institution route of the record page (relative to /institution). */
  link: string;
  priority?: "normal" | "high" | "urgent";
  escalated?: { at: string; by: string; reason: string; to?: string };
  snoozed_until?: string;
  closed_at?: string;
  closed_by?: string;
  outcome?: string;
  /** Key facts for the drawer preview (A3). */
  facts?: Record<string, string>;
  log: { at: string; actor: string; action: string; note?: string }[];
};

export type Delegation = {
  id: string;
  from: string;
  to: string;
  roles: string[];
  start: string;
  end: string;
  note?: string;
  ended_at?: string;
};

type TaskState = {
  v: 2;
  tasks: Record<string, Task>;
  delegations: Record<string, Delegation>;
  /** Daily digest subscriptions per staff member (02 P3). Optional so older saved state still loads. */
  digest?: Record<string, DigestPref>;
};

export type DigestPref = { email: boolean; push: boolean; updated_at: string };

const taskKey = (t: Pick<Task, "doctype" | "name" | "state" | "seq">) => `${t.doctype}|${t.name}|${t.state}|${t.seq}`;

function mk(p: Partial<Task> & Pick<Task, "doctype" | "name" | "state" | "family" | "role" | "title" | "module" | "link">, days: number, ageDays = 0): Task {
  const created = isoIn(-ageDays, 8);
  return {
    seq: 1,
    created_at: created,
    due: addWorkingDays(created, days).toISOString(),
    log: [{ at: created, actor: "System", action: "Opened" }],
    ...p,
    id: taskKey({ seq: 1, ...p }),
  } as Task;
}

/** Tasks for modules without a demo store yet, so the inbox looks like a working day. Fictional. */
function seedTasks(): Task[] {
  return [
    mk({ doctype: "Purchase Order", name: "PO-26-0187", state: "Pending Approval", family: "approve", verb: "approve", role: "Accounts Manager", title: "Approve PO-26-0187 — calibration weights (E 48,300)", module: "Procurement", link: "/finance", facts: { Supplier: "Mettler Toledo SA", Amount: "E 48,300", Requested: "Musa Khumalo" }, rule: "R-P2" }, 3, 1),
    mk({ doctype: "Sales Invoice", name: "SINV-26-0412", state: "Overdue", family: "alert", role: "Accounts Manager", title: "Invoice SINV-26-0412 is 45 days overdue", module: "Finance", link: "/finance/invoices", facts: { Customer: "Lubombo Foods (Pty) Ltd", Amount: "E 12,650" } }, 1, 3),
    mk({ doctype: "Training Event", name: "TRN-ISO9001-OCT", state: "Draft", family: "do", verb: "task", role: "HR Manager", title: "Confirm venue for ISO 9001 internal auditor course", module: "Training", link: "/training", facts: { Dates: "21–23 Oct", Seats: "18 booked of 24" } }, 4, 0),
    mk({ doctype: "Leave Application", name: "HR-LAP-0091", state: "Open", family: "approve", verb: "approve", role: "HR Manager", title: "Leave request — Lindiwe Dube, 5 days", module: "HR", link: "/hr", facts: { From: "20 Oct", To: "24 Oct", Cover: "Bongani Hlophe" } }, 2, 1),
    mk({ doctype: "TBT Notification", name: "G/TBT/N/ZAF/301", state: "Received", family: "alert", role: "Eswasa TBT Officer", title: "New WTO TBT notice from South Africa — tyres", module: "WTO/TBT", link: "/tbt", facts: { "Comment by": "in 52 days", Sector: "Automotive" } }, 5, 0),
    mk({ doctype: "E-store Order", name: "EST-26-0921", state: "Paid", family: "do", verb: "task", role: "Eswasa Estore Clerk", title: "Fulfil standards order EST-26-0921 (3 PDFs)", module: "E-store", link: "/estore", facts: { Buyer: "Eswatini Water Services Corp." } }, 1, 0),
  ];
}

export const taskStore = createLocalStore<TaskState>({
  key: "eswasaone.tasks.v1",
  v: 2,
  seed: () => {
    const tasks = seedTasks();
    return {
      v: 2,
      tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
      delegations: {
        "DLG-1": {
          id: "DLG-1",
          from: "Phindile Shongwe",
          to: "Zanele Maseko",
          roles: ["Customer Service Manager"],
          start: isoIn(-1),
          end: isoIn(6),
          note: "Annual leave — Zanele covers case sign-offs.",
        },
      },
    };
  },
});

/* ---------------- delegation & assignee resolution (§5.2) ---------------- */

export function isActiveDelegation(d: Delegation, at = new Date()): boolean {
  return !d.ended_at && new Date(d.start) <= at && at <= new Date(d.end);
}

function delegateFor(s: TaskState, person: string, role: string): Delegation | undefined {
  return Object.values(s.delegations).find(
    (d) => d.from === person && isActiveDelegation(d) && (d.roles.length === 0 || d.roles.includes(role)),
  );
}

/** 1. delegation → 2. named → 3/4. pool (unclaimed on the role). */
function resolveAssignee(s: TaskState, role: string, named?: string): { assignee?: string; on_behalf_of?: string } {
  if (!named) return {};
  const d = delegateFor(s, named, role);
  if (d) return { assignee: d.to, on_behalf_of: named };
  const p = staffByName(named);
  if (p && onLeave(p)) return {};
  return { assignee: named };
}

/* ---------------- opening & closing (L1–L3) ---------------- */

export type OpenTaskInput = {
  doctype: string;
  name: string;
  state: string;
  seq: number;
  family: TaskFamily;
  verb?: string;
  role: string;
  assignee?: string;
  title: string;
  module: TaskModule;
  link: string;
  sla_days: number;
  rule?: string;
  paused?: boolean;
  priority?: Task["priority"];
  facts?: Record<string, string>;
};

function openIn(s: TaskState, input: OpenTaskInput): Task {
  const id = taskKey(input);
  const existing = s.tasks[id];
  if (existing) return existing;
  const at = nowIso();
  const who = resolveAssignee(s, input.role, input.assignee);
  const t: Task = {
    id,
    doctype: input.doctype,
    name: input.name,
    state: input.state,
    seq: input.seq,
    family: input.family,
    verb: input.verb,
    role: input.role,
    ...who,
    claimed_at: who.assignee ? at : undefined,
    created_at: at,
    due: addWorkingDays(at, input.sla_days).toISOString(),
    paused: input.paused,
    rule: input.rule,
    title: input.title,
    module: input.module,
    link: input.link,
    priority: input.priority,
    facts: input.facts,
    log: [{ at, actor: "System", action: who.on_behalf_of ? `Opened → ${who.assignee} (delegate of ${who.on_behalf_of})` : "Opened" }],
  };
  s.tasks[id] = t;
  return t;
}

function closeIn(s: TaskState, doctype: string, name: string, keep: string | null, outcome: string, by: string) {
  for (const t of Object.values(s.tasks)) {
    if (t.doctype !== doctype || t.name !== name || t.closed_at || t.id === keep) continue;
    t.closed_at = nowIso();
    t.closed_by = by;
    t.outcome = outcome;
    t.log.push({ at: t.closed_at, actor: by, action: `Closed: ${outcome}` });
  }
}

/** Open a standalone task (not tied to a workflow state change). */
export function openTask(input: OpenTaskInput): Task {
  return taskStore.mutate((s) => openIn(s, input));
}

/**
 * After a record transition (or on reconcile): close tasks for any earlier state (L2) and open the
 * task the new state asks for (L1/L3). `outcome` is what closed the previous task.
 */
export function syncRecordTasks<R extends WfRecord>(args: {
  def: WorkflowDef<R>;
  rec: R;
  name: string;
  title: string;
  link: string;
  module: TaskModule;
  by?: string;
  outcome?: string;
  facts?: Record<string, string>;
}): void {
  const { def, rec } = args;
  const sd = stateDef(def, rec.state);
  const spec = sd?.task;
  const keep = spec ? taskKey({ doctype: def.doctype, name: args.name, state: rec.state, seq: rec.seq }) : null;
  taskStore.mutate((s) => {
    closeIn(s, def.doctype, args.name, keep, args.outcome ?? `Moved to ${rec.state}`, args.by ?? "System");
    if (spec && !s.tasks[keep!]) {
      openIn(s, {
        doctype: def.doctype,
        name: args.name,
        state: rec.state,
        seq: rec.seq,
        family: spec.family,
        verb: spec.verb,
        role: spec.role,
        assignee: spec.assignee?.(rec),
        title: spec.title(rec),
        module: args.module,
        link: args.link,
        sla_days: spec.sla_days,
        rule: spec.rule,
        paused: sd?.paused,
        facts: args.facts,
      });
    }
  });
}

/** Close every open task for a record (record withdrawn/deleted, or a manual "Mark done"). */
export function closeRecordTasks(doctype: string, name: string, outcome: string, by: string): void {
  taskStore.mutate((s) => closeIn(s, doctype, name, null, outcome, by));
}

/**
 * L1 reconciler: backfill a task for any record sitting in an owner-requiring state with none.
 * Domain stores call this once per session from their read path.
 */
export function reconcileTasks<R extends WfRecord>(
  def: WorkflowDef<R>,
  rows: { rec: R; name: string; title: string; link: string; module: TaskModule; facts?: Record<string, string> }[],
): void {
  const s = taskStore.read();
  const missing = rows.filter(({ rec, name }) => {
    if (!stateDef(def, rec.state)?.task) return false;
    return !s.tasks[taskKey({ doctype: def.doctype, name, state: rec.state, seq: rec.seq })];
  });
  if (!missing.length) return;
  taskStore.mutate((st) => {
    for (const row of missing) {
      const spec = stateDef(def, row.rec.state)!.task!;
      const t = openIn(st, {
        doctype: def.doctype,
        name: row.name,
        state: row.rec.state,
        seq: row.rec.seq,
        family: spec.family,
        verb: spec.verb,
        role: spec.role,
        assignee: spec.assignee?.(row.rec),
        title: spec.title(row.rec),
        module: row.module,
        link: row.link,
        sla_days: spec.sla_days,
        rule: spec.rule,
        paused: stateDef(def, row.rec.state)?.paused,
        facts: row.facts,
      });
      // Backdate to when the record entered the state, so SLAs are realistic.
      const entered = [...row.rec.history].reverse().find((h) => h.to === row.rec.state)?.at;
      if (entered && entered < t.created_at) {
        t.created_at = entered;
        t.due = addWorkingDays(entered, spec.sla_days).toISOString();
        t.log[0].at = entered;
      }
    }
  });
}

/* ---------------- queries ---------------- */

export type TaskQueue = "unclaimed" | "mine" | "team" | "done" | "all";

export function isManager(actor: Actor): boolean {
  return actor.roles.some((r) =>
    [...SUPER_ROLES, "Certification Manager", "Quality Manager", "Customer Service Manager", "Accounts Manager", "HR Manager", "Eswasa Metrology Manager", "Eswasa Standards Manager", "Company Secretary", "Eswasa Board Secretary"].includes(r),
  );
}

function canSeeRole(actor: Actor, role: string): boolean {
  return actor.roles.includes(role) || actor.roles.some((r) => SUPER_ROLES.includes(r));
}

/** Roles the actor holds through an active delegation to them. */
export function delegatedRoles(actor: Actor): { from: string; roles: string[] }[] {
  const s = taskStore.read();
  return Object.values(s.delegations)
    .filter((d) => d.to === actor.name && isActiveDelegation(d))
    .map((d) => ({ from: d.from, roles: d.roles }));
}

export function listTasks(
  actor: Actor,
  f: { queue?: TaskQueue; module?: TaskModule | ""; family?: TaskFamily | "" } = {},
): Task[] {
  taskStore.guard("The task inbox");
  const queue = f.queue ?? "all";
  const since = Date.now() - 30 * 86_400_000;
  const covering = delegatedRoles(actor);
  return taskStore.view((s) =>
    Object.values(s.tasks)
      .filter((t) => {
        if (f.module && t.module !== f.module) return false;
        if (f.family && t.family !== f.family) return false;
        if (queue === "done") return Boolean(t.closed_at) && t.closed_by === actor.name && new Date(t.closed_at!).getTime() >= since;
        if (t.closed_at) return false;
        if (queue === "team") return true;
        const mine = t.assignee === actor.name || covering.some((c) => t.assignee === c.from && (c.roles.length === 0 || c.roles.includes(t.role)));
        if (queue === "mine") return mine;
        if (queue === "unclaimed") return !t.assignee && (canSeeRole(actor, t.role) || covering.some((c) => c.roles.includes(t.role)));
        return mine || (!t.assignee && canSeeRole(actor, t.role)) || isManager(actor);
      })
      .sort((a, b) => a.due.localeCompare(b.due)),
  );
}

export function getTask(id: string): Task | null {
  return taskStore.view((s) => s.tasks[id] ?? null);
}

export function tasksForRecord(doctype: string, name: string): Task[] {
  return taskStore.view((s) => Object.values(s.tasks).filter((t) => t.doctype === doctype && t.name === name));
}

/* ---------------- staff handling loop (§5.3) ---------------- */

function mustTask(s: TaskState, id: string): Task {
  const t = s.tasks[id];
  if (!t) throw new Error("Task not found — it may have been closed.");
  return t;
}

function alreadyHandled(t: Task): never {
  throw new Error(`Already handled by ${t.closed_by ?? "someone else"} at ${new Date(t.closed_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
}

export async function claimTask(id: string, actor: Actor): Promise<Task> {
  taskStore.guard("Claiming tasks");
  return taskStore.mutate((s) => {
    const t = mustTask(s, id);
    if (t.closed_at) alreadyHandled(t);
    if (t.assignee && t.assignee !== actor.name) throw new Error(`${t.assignee} claimed this first.`);
    const at = nowIso();
    t.assignee = actor.name;
    t.claimed_at = at;
    t.log.push({ at, actor: actor.name, action: "Claimed" });
    return t;
  });
}

export async function releaseTask(id: string, actor: Actor): Promise<Task> {
  return taskStore.mutate((s) => {
    const t = mustTask(s, id);
    t.log.push({ at: nowIso(), actor: actor.name, action: "Released to pool" });
    t.assignee = undefined;
    t.claimed_at = undefined;
    t.on_behalf_of = undefined;
    return t;
  });
}

/** Reassign — reason required (invariant 4); eligibility is checked by the picker (C8). */
export async function reassignTask(id: string, to: string, reason: string, actor: Actor): Promise<Task> {
  taskStore.guard("Reassigning tasks");
  if (!reason.trim()) throw new Error("A reason is required to reassign.");
  // TODO: wire real — POST /approvals/{doctype}/{name}/reassign {to, reason}
  return taskStore.mutate((s) => {
    const t = mustTask(s, id);
    if (t.closed_at) alreadyHandled(t);
    const at = nowIso();
    t.log.push({ at, actor: actor.name, action: `Reassigned ${t.assignee ?? "pool"} → ${to}`, note: reason });
    t.assignee = to;
    t.claimed_at = at;
    t.on_behalf_of = undefined;
    return t;
  });
}

/** Manual escalation (R-A2) — goes to the manager as an alert. */
export async function escalateTask(id: string, reason: string, actor: Actor, to?: string): Promise<Task> {
  taskStore.guard("Escalating tasks");
  if (!reason.trim()) throw new Error("A reason is required to escalate.");
  // TODO: wire real — POST /approvals/{doctype}/{name}/escalate {confirm, reason}
  return taskStore.mutate((s) => {
    const t = mustTask(s, id);
    if (t.closed_at) alreadyHandled(t);
    const at = nowIso();
    t.escalated = { at, by: actor.name, reason, to };
    t.priority = "urgent";
    t.log.push({ at, actor: actor.name, action: `Escalated${to ? ` to ${to}` : ""}`, note: reason });
    openIn(s, {
      doctype: t.doctype,
      name: t.name,
      state: `${t.state} (escalated)`,
      seq: t.seq,
      family: "alert",
      role: managerRoleFor(t.role),
      assignee: to,
      title: `Escalated: ${t.title}`,
      module: t.module,
      link: t.link,
      sla_days: 1,
      rule: "R-A2",
      priority: "urgent",
      facts: { Reason: reason, "Raised by": actor.name, ...(t.facts ?? {}) },
    });
    return t;
  });
}

export function managerRoleFor(role: string): string {
  const map: Record<string, string> = {
    "Customer Service": "Customer Service Manager",
    "Certification Officer": "Certification Manager",
    "Technical Reviewer": "Certification Manager",
    "Certification Auditor": "Certification Manager",
    "Eswasa Metrology Officer": "Lab Manager",
    "Eswasa Metrology Reviewer": "Lab Manager",
    "TC Secretary": "Head of Standards",
    "Eswasa Standards Officer": "Head of Standards",
    "Eswasa Estore Clerk": "Eswasa Estore Manager",
    "Eswasa Risk Officer": "Company Secretary",
  };
  return map[role] ?? "System Manager";
}

/** Close a standalone task (generic "Mark done" / approve on modules without a demo store yet). */
export async function completeTask(id: string, actor: Actor, outcome: string, reason?: string): Promise<Task> {
  taskStore.guard("Completing tasks");
  if (/reject|return/i.test(outcome) && !reason?.trim()) throw new Error("A reason is required.");
  return taskStore.mutate((s) => {
    const t = mustTask(s, id);
    if (t.closed_at) alreadyHandled(t);
    const at = nowIso();
    t.closed_at = at;
    t.closed_by = actor.name;
    t.outcome = outcome;
    t.on_behalf_of = t.on_behalf_of ?? actor.on_behalf_of;
    t.log.push({ at, actor: actor.name, action: outcome, note: reason });
    return t;
  });
}

export async function snoozeTask(id: string, days: number, actor: Actor): Promise<Task> {
  return taskStore.mutate((s) => {
    const t = mustTask(s, id);
    t.snoozed_until = addWorkingDays(nowIso(), days).toISOString();
    t.log.push({ at: nowIso(), actor: actor.name, action: `Snoozed ${days} working day(s)` });
    return t;
  });
}

/* ---------------- delegations (A7) ---------------- */

export async function listDelegations(): Promise<Delegation[]> {
  taskStore.guard("Delegations");
  return taskStore.view((s) => Object.values(s.delegations).sort((a, b) => b.start.localeCompare(a.start)));
}

export async function createDelegation(d: Omit<Delegation, "id" | "ended_at">, actor: Actor): Promise<Delegation> {
  taskStore.guard("Delegations");
  if (!d.to || d.to === d.from) throw new Error("Choose someone else to act for you.");
  if (new Date(d.end) < new Date(d.start)) throw new Error("The end date is before the start date.");
  // TODO: wire real — POST /approvals/delegations (HRMS Delegation DocType)
  return taskStore.mutate((s) => {
    const row: Delegation = { ...d, id: uid("DLG") };
    s.delegations[row.id] = row;
    // Route the absent person's open tasks for those roles to the delegate now.
    if (isActiveDelegation(row)) {
      for (const t of Object.values(s.tasks)) {
        if (t.closed_at || t.assignee !== d.from) continue;
        if (d.roles.length && !d.roles.includes(t.role)) continue;
        t.assignee = d.to;
        t.on_behalf_of = d.from;
        t.log.push({ at: nowIso(), actor: actor.name, action: `Delegated to ${d.to} on behalf of ${d.from}` });
      }
    }
    return row;
  });
}

export async function endDelegation(id: string, actor: Actor): Promise<void> {
  taskStore.mutate((s) => {
    const d = s.delegations[id];
    if (!d) return;
    d.ended_at = nowIso();
    for (const t of Object.values(s.tasks)) {
      if (!t.closed_at && t.on_behalf_of === d.from && t.assignee === d.to) {
        t.assignee = d.from;
        t.on_behalf_of = undefined;
        t.log.push({ at: nowIso(), actor: actor.name, action: `Delegation ended — back to ${d.from}` });
      }
    }
  });
}

/* ---------------- SLA (L9) ---------------- */

export type TaskSla = { status: "ok" | "due" | "breach" | "paused"; label: string; daysLeft: number };

export function taskSla(t: Pick<Task, "due" | "paused" | "closed_at" | "created_at">, now = new Date()): TaskSla {
  if (t.paused) return { status: "paused", label: "Paused", daysLeft: 0 };
  const due = new Date(t.due);
  const end = t.closed_at ? new Date(t.closed_at) : now;
  if (end > due) {
    const over = Math.max(1, workingDaysBetween(t.due, end));
    return { status: "breach", label: `${over}d over`, daysLeft: -over };
  }
  const left = workingDaysBetween(end.toISOString(), due);
  if (left <= 1) return { status: "due", label: left === 0 ? "Due today" : "Due tomorrow", daysLeft: left };
  return { status: "ok", label: `${left}d left`, daysLeft: left };
}

/* ---------------- team view (A8) ---------------- */

export type TeamLoad = {
  name: string;
  title: string;
  team: string;
  open: number;
  due: number;
  breached: number;
  avgAgeDays: number;
  cap: number;
  onLeave: boolean;
  leaveNote?: string;
};

export function teamLoad(): TeamLoad[] {
  const tasks = taskStore.view((s) => Object.values(s.tasks).filter((t) => !t.closed_at));
  return DEMO_STAFF.map((p) => {
    const mine = tasks.filter((t) => t.assignee === p.name);
    const slas = mine.map((t) => taskSla(t));
    const age = mine.reduce((n, t) => n + workingDaysBetween(t.created_at), 0);
    return {
      name: p.name,
      title: p.title,
      team: p.team,
      open: mine.length,
      due: slas.filter((x) => x.status === "due").length,
      breached: slas.filter((x) => x.status === "breach").length,
      avgAgeDays: mine.length ? Math.round((age / mine.length) * 10) / 10 : 0,
      cap: p.cap,
      onLeave: onLeave(p),
      leaveNote: p.leave?.note,
    };
  });
}

/** Staff who could take a task, with the reason when they can't (C8 / A5). */
export function eligibleAssignees(t: Pick<Task, "role" | "facts">, exclude: string[] = []): { name: string; title: string; ok: boolean; why?: string }[] {
  const s = taskStore.read();
  const open = Object.values(s.tasks).filter((x) => !x.closed_at);
  return DEMO_STAFF.map((p) => {
    const load = open.filter((x) => x.assignee === p.name).length;
    let why: string | undefined;
    if (!p.roles.includes(t.role) && !p.roles.includes(managerRoleFor(t.role))) why = `Doesn't hold ${t.role}`;
    else if (exclude.includes(p.name)) why = "Already involved in this record (independence)";
    else if (onLeave(p)) why = `On leave until ${new Date(p.leave!.to).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
    else if (load >= p.cap) why = `At workload cap (${load}/${p.cap})`;
    return { name: p.name, title: p.title, ok: !why, why };
  }).sort((a, b) => Number(b.ok) - Number(a.ok));
}

export async function resetTasksDemo(): Promise<void> {
  taskStore.reset();
}

/* ---------------- daily digest (02 P3) ---------------- */

export function digestPref(staff: string): DigestPref {
  return taskStore.read().digest?.[staff] ?? { email: false, push: false, updated_at: "" };
}

/** Opt in / out of the 07:00 digest of breaching and due tasks. */
export async function setDigestPref(staff: string, pref: Pick<DigestPref, "email" | "push">): Promise<DigestPref> {
  taskStore.guard("Changing digest settings");
  // TODO: wire real — PUT /approvals/digest {email, push} (Frappe scheduler sends at 07:00 on working days)
  return taskStore.mutate((s) => {
    const next = { ...pref, updated_at: nowIso() };
    s.digest = { ...(s.digest ?? {}), [staff]: next };
    return next;
  });
}
