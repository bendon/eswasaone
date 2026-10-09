/**
 * CRM cases → Approvals tasks (gap 02 A10). A case in a state that needs a person opens a task on
 * the right role/team; leaving the state closes it (L2). seq = number of case events.
 */
import { notifySafe } from "../notify/store";
import { reconcileTasks, syncRecordTasks } from "../tasks/store";
import type { WorkflowDef } from "../workflow/types";
import type { Case } from "./types";

type CaseRec = { state: string; seq: number; history: []; c: Case };

const ROLE_BY_TEAM: Record<string, string> = {
  "Customer Service": "Customer Service",
  "Quality Manager": "Quality Manager",
  Certification: "Certification Officer",
  "Market Surveillance": "Eswasa Verification Officer",
  Finance: "Accounts User",
  Metrology: "Eswasa Metrology Officer",
  "Standards Sales": "Sales User",
  Training: "HR User",
  "Appeals Panel": "Eswasa Appeals Panel",
};

const teamRole = (r: CaseRec) => (r.c.type === "appeal" ? "Eswasa Appeals Panel" : ROLE_BY_TEAM[r.c.team] ?? "Customer Service");

/** Only the parts of a WorkflowDef the task layer reads (states + task specs). */
export const CASE_TASK_DEF: WorkflowDef<CaseRec> = {
  doctype: "Case",
  label: "Case",
  module: "CRM",
  transitions: [],
  states: [
    { id: "Open", label: "Open", tone: "navy", task: { family: "do", verb: "task", role: "Customer Service", title: (r) => `Triage ${r.c.ref} — ${r.c.subject}`, sla_days: 1, rule: "R-H1" } },
    { id: "Triaged", label: "Triaged", tone: "purple", task: { family: "do", verb: "task", role: "Customer Service", assignee: (r) => r.c.assignee, title: (r) => `Start work on ${r.c.ref} — ${r.c.subject}`, sla_days: 2 } },
    { id: "In Progress", label: "In Progress", tone: "navy", task: { family: "do", verb: "task", role: "Customer Service", assignee: (r) => r.c.assignee, title: (r) => `Resolve ${r.c.ref} — ${r.c.subject}`, sla_days: 5 } },
    { id: "Awaiting Customer", label: "Awaiting Customer", tone: "amber", paused: true },
    { id: "Escalated", label: "Escalated", tone: "red", task: { family: "alert", role: "Customer Service Manager", title: (r) => `Escalated case ${r.c.ref} — ${r.c.subject}`, sla_days: 1, rule: "R-A2" } },
    { id: "Reopened", label: "Reopened", tone: "amber", task: { family: "do", verb: "task", role: "Customer Service", assignee: (r) => r.c.assignee, title: (r) => `Customer disputed ${r.c.ref} — review again`, sla_days: 3 } },
    { id: "Resolved", label: "Resolved", tone: "green" },
    { id: "Closed", label: "Closed", tone: "slate", terminal: true },
  ],
};

function rec(c: Case): CaseRec {
  return { state: c.state, seq: c.events.length, history: [], c };
}

function facts(c: Case): Record<string, string> {
  return {
    Type: c.type.replace(/_/g, " "),
    Team: c.team,
    Priority: c.priority,
    Reporter: c.reporter.anonymous ? "Anonymous" : c.reporter.name || "—",
    ...(c.about ? { About: c.about.label } : {}),
  };
}

/** Role pool for a case, honouring its team (Certification, Finance…). */
function withTeam(c: Case): WorkflowDef<CaseRec> {
  const role = teamRole(rec(c));
  return {
    ...CASE_TASK_DEF,
    states: CASE_TASK_DEF.states.map((s) => (s.task && s.task.family === "do" ? { ...s, task: { ...s.task, role } } : s)),
  };
}

export function syncCaseTasks(c: Case, by?: string, outcome?: string): void {
  try {
    syncRecordTasks({ def: withTeam(c), rec: rec(c), name: c.ref, title: c.subject, link: `/crm/cases/${c.ref}`, module: "CRM", by, outcome, facts: facts(c) });
  } catch {
    /* task store unavailable — never block the case write */
  }
}

let reconciled = false;
export function reconcileCaseTasks(cases: Case[]): void {
  if (reconciled) return;
  reconciled = true;
  try {
    for (const c of cases) {
      reconcileTasks(withTeam(c), [{ rec: rec(c), name: c.ref, title: c.subject, link: `/crm/cases/${c.ref}`, module: "CRM", facts: facts(c) }]);
    }
  } catch {
    /* ignore */
  }
}

const CUSTOMER_EVENTS: Record<string, { title: (c: Case) => string; body: (c: Case, note?: string) => string }> = {
  triage: { title: (c) => `We've acknowledged ${c.ref}`, body: (c) => `Your ${c.type.replace(/_/g, " ")} "${c.subject}" is with our ${c.team} team.` },
  request_info: { title: (c) => `Action needed on ${c.ref}`, body: (_c, n) => n ?? "We need more information from you." },
  resolve: { title: (c) => `${c.ref} resolved — please confirm`, body: (_c, n) => n ?? "We've resolved your case." },
  mark_duplicate: { title: (c) => `${c.ref} linked to another case`, body: (c) => `This is being handled under case ${c.duplicate_of}.` },
  take_over: { title: (c) => `A manager is handling ${c.ref}`, body: () => "Your case was escalated and a manager has taken it over." },
};

/** Customer-audience events → Service portal /account/notifications (C5). */
export function notifyCaseCustomer(c: Case, action: string, note?: string): void {
  const ev = CUSTOMER_EVENTS[action];
  if (!ev || c.reporter.anonymous) return;
  notifySafe({
    audience: "customer",
    to: c.reporter.email || "demo",
    kind: "case",
    ref: c.ref,
    title: ev.title(c),
    body: ev.body(c, note),
    link: `/account/cases/${c.ref}`,
    channel: ["email", "portal"],
  });
}
