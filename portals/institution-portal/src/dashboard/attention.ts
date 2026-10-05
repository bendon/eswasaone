/** Attention-queue mappers — live APIs → PriorityItem for the dashboard. */

import type { IconName } from "@eswasaone/shared-ui";
import type {
  ApprovalItem,
  AuditSummary,
  TbtNotificationSummary,
} from "../api/types";
import type { PriorityItem } from "./fixtures";

export function approvalToPriority(it: ApprovalItem, idx: number): PriorityItem {
  const breach = Boolean(it.sla_breached);
  return {
    id: `appr-${it.id}`,
    kind: "approval",
    live: true,
    doctype: it.doctype,
    name: it.name,
    sev: breach ? "red" : idx === 0 ? "amber" : "navy",
    icon: breach ? "i-warn" : "i-check-c",
    tint: breach ? "#FDECEC" : "#ECEEFC",
    tone: breach ? "#9F1239" : "#313391",
    ref: it.name,
    title: it.title,
    meta: [it.module, it.status].filter(Boolean),
    sla: {
      kind: breach ? "breach" : it.due_at ? "due" : "ok",
      label: breach
        ? "Past SLA"
        : it.due_at
          ? `Due ${it.due_at.slice(0, 10)}`
          : "On schedule",
    },
    action: {
      label: "Review",
      icon: "i-eye",
      variant: breach ? "pri" : "ghost",
    },
    details: [
      { label: "Document", value: `${it.doctype} · ${it.name}` },
      { label: "Module", value: it.module },
      { label: "Status", value: it.status },
      ...(it.due_at ? [{ label: "Due", value: it.due_at.slice(0, 16).replace("T", " ") }] : []),
    ],
    href: `/approvals?open=${encodeURIComponent(it.name)}&doctype=${encodeURIComponent(it.doctype)}`,
  };
}

export function auditToPriority(it: AuditSummary): PriorityItem {
  const due = it.due_date || "";
  return {
    id: `audit-${it.id}`,
    kind: "audit_reschedule",
    live: true,
    name: it.id,
    sev: "red",
    icon: "i-warn",
    tint: "#FDECEC",
    tone: "#9F1239",
    ref: it.application_id || it.id,
    title: `Audit overdue: ${it.scheme || "Certification"}`,
    meta: [
      it.scheme || "Certification audit",
      it.auditor ? `Auditor: ${it.auditor}` : "Auditor unassigned",
      due ? `Scheduled ${due}` : "No date set",
    ].filter(Boolean),
    sla: { kind: "breach", label: "Past SLA" },
    action: {
      label: "Reschedule",
      icon: "i-cal" as IconName,
      variant: "pri",
    },
    details: [
      { label: "Audit ID", value: it.id },
      { label: "Application", value: it.application_id },
      { label: "Auditor", value: it.auditor || "Unassigned" },
      { label: "Scheme", value: it.scheme || "—" },
      { label: "Current date", value: due || "—" },
      { label: "Status", value: it.status },
    ],
    dueDate: due || undefined,
    href: `/certification/audits?open=${encodeURIComponent(it.id)}`,
  };
}

export function tbtToPriority(it: TbtNotificationSummary): PriorityItem {
  const impact = it.impact === "high" ? "red" : it.impact === "medium" ? "amber" : "blue";
  return {
    id: `tbt-${it.id}`,
    kind: "tbt",
    live: true,
    name: it.id,
    sev: impact,
    icon: "i-globe",
    tint: impact === "red" ? "#FDECEC" : impact === "amber" ? "#FEF6DC" : "#E0F2FE",
    tone: impact === "red" ? "#9F1239" : impact === "amber" ? "#B8860B" : "#075985",
    ref: it.symbol,
    title: it.title,
    meta: [`Impact: ${it.impact}`, it.unread ? "Unread" : "Read"],
    sla: {
      kind: it.impact === "high" ? "due" : "ok",
      label: it.published_at ? `Published ${it.published_at.slice(0, 10)}` : "Needs assessment",
    },
    action: {
      label: "Assess",
      icon: "i-eye",
      variant: "ghost",
    },
    details: [
      { label: "Symbol", value: it.symbol },
      { label: "Impact", value: it.impact },
      { label: "Status", value: it.unread ? "Unread" : "Read" },
      ...(it.published_at
        ? [{ label: "Published", value: it.published_at.slice(0, 10) }]
        : []),
    ],
    href: `/tbt?id=${encodeURIComponent(it.id)}`,
  };
}

/** Merge live sources into a single attention queue (max 8). */
export function buildLiveAttentionQueue(opts: {
  approvals?: ApprovalItem[];
  overdueAudits?: AuditSummary[];
  tbt?: TbtNotificationSummary[];
}): PriorityItem[] {
  const out: PriorityItem[] = [];
  for (const a of opts.overdueAudits ?? []) {
    out.push(auditToPriority(a));
  }
  (opts.approvals ?? []).slice(0, 5).forEach((it, i) => {
    out.push(approvalToPriority(it, i));
  });
  for (const t of (opts.tbt ?? []).filter((x) => x.unread).slice(0, 3)) {
    out.push(tbtToPriority(t));
  }
  return out.slice(0, 8);
}
