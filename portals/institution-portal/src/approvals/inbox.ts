import type { IconName } from "@eswasaone/shared-ui";
import type { ApprovalItem } from "../api/types";

export type InboxFamily = "approve" | "do" | "alert";
export type InboxPriority = "breach" | "due" | "normal";
export type TaskVerb = "signoff" | "task" | "review" | "assign";

export type InboxItem = {
  id: string;
  fam: InboxFamily;
  pri: InboxPriority;
  sla: string;
  title: string;
  doctype: string;
  name: string;
  module: string;
  from?: string;
  rule?: string;
  verb?: TaskVerb;
  detail: Record<string, string>;
  /** Live queue item — act hits the API. Fixtures are local-only. */
  live: boolean;
};

const MODULE_ICON: Record<string, IconName> = {
  Certification: "i-badge",
  certification: "i-badge",
  Metrology: "i-gauge",
  metrology: "i-gauge",
  Standards: "i-file",
  standards: "i-file",
  Governance: "i-bank",
  governance: "i-bank",
  "WTO/TBT": "i-globe",
  tbt: "i-globe",
  HR: "i-users",
  hr: "i-users",
  Knowledge: "i-globe",
  Finance: "i-dollar",
  finance: "i-dollar",
  CRM: "i-briefcase",
  crm: "i-briefcase",
  Training: "i-cap",
  training: "i-cap",
};

const MODULE_LABEL: Record<string, string> = {
  certification: "Certification",
  metrology: "Metrology",
  standards: "Standards",
  governance: "Governance",
  tbt: "WTO/TBT",
  hr: "HR",
  finance: "Finance",
  crm: "CRM",
  training: "Training",
  knowledge: "Knowledge",
};

export function moduleIcon(module: string): IconName {
  return MODULE_ICON[module] || "i-file";
}

export function moduleLabel(module: string): string {
  return MODULE_LABEL[module.toLowerCase()] || module;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function slaMeta(item: ApprovalItem): { pri: InboxPriority; sla: string } {
  if (item.sla_breached) {
    return { pri: "breach", sla: "Overdue" };
  }
  if (!item.due_at) {
    return { pri: "normal", sla: "No due date" };
  }
  const due = new Date(item.due_at);
  if (Number.isNaN(due.getTime())) {
    return { pri: "normal", sla: item.due_at };
  }
  const today = startOfDay(new Date());
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { pri: "breach", sla: `Overdue ${Math.abs(diffDays)}d` };
  if (diffDays === 0) return { pri: "due", sla: "Due today" };
  if (diffDays === 1) return { pri: "due", sla: "in 1 day" };
  return { pri: "normal", sla: `in ${diffDays} days` };
}

const ALERT_DOCTYPES = new Set(["Instrument", "TBT Notification", "Risk Register Entry"]);
const TASK_HINT =
  /sign-?off|assign|calibrat|file gazette|brief|review|curate|task|acknowledge/i;

function inferFamily(item: ApprovalItem): { fam: InboxFamily; verb?: TaskVerb } {
  const dt = item.doctype || "";
  if (ALERT_DOCTYPES.has(dt) || /alert|blocked|due/i.test(item.title)) {
    return { fam: "alert" };
  }
  if (TASK_HINT.test(item.title) || /ToDo|Result|Calibration Job|Ingested Document/i.test(dt)) {
    if (/sign-?off/i.test(item.title)) return { fam: "do", verb: "signoff" };
    if (/assign/i.test(item.title)) return { fam: "do", verb: "assign" };
    if (/curate|publish|review/i.test(item.title)) return { fam: "do", verb: "review" };
    return { fam: "do", verb: "task" };
  }
  return { fam: "approve" };
}

/** Map contract ApprovalItem → inbox row. */
export function fromApprovalItem(item: ApprovalItem): InboxItem {
  const { pri, sla } = slaMeta(item);
  const { fam, verb } = inferFamily(item);
  const mod = moduleLabel(item.module || "Governance");
  return {
    id: item.id || `${item.doctype}::${item.name}`,
    fam,
    pri,
    sla,
    title: item.title,
    doctype: item.doctype,
    name: item.name,
    module: mod,
    verb,
    detail: {
      Status: item.status || "Pending",
      Module: mod,
      ...(item.due_at
        ? { Due: new Date(item.due_at).toLocaleDateString(undefined, { dateStyle: "medium" }) }
        : {}),
    },
    live: true,
  };
}

export const MODULE_FILTERS = [
  "All modules",
  "Certification",
  "Metrology",
  "Standards",
  "Governance",
  "WTO/TBT",
  "HR",
] as const;

const PRI_ORDER: Record<InboxPriority, number> = { breach: 0, due: 1, normal: 2 };

export function sortInbox(items: InboxItem[], mode: string): InboxItem[] {
  const list = [...items];
  if (mode === "Newest") {
    return list.reverse();
  }
  if (mode === "Priority") {
    return list.sort((a, b) => PRI_ORDER[a.pri] - PRI_ORDER[b.pri] || a.title.localeCompare(b.title));
  }
  // SLA first (default)
  return list.sort((a, b) => PRI_ORDER[a.pri] - PRI_ORDER[b.pri] || a.sla.localeCompare(b.sla));
}

export function primaryActionLabel(item: InboxItem): string {
  if (item.fam === "approve") return "Approve";
  if (item.fam === "alert") return "Acknowledge";
  if (item.verb === "signoff") return "Sign off";
  if (item.verb === "assign") return "Assign & start";
  if (item.verb === "review") return "Approve for publishing";
  return "Mark done";
}
