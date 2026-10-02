/** Dashboard types + static module IA tiles (not transactional mock data). */
import type { IconName } from "@eswasaone/shared-ui";

export type PrioritySev = "red" | "amber" | "navy" | "blue";
export type SlaKind = "breach" | "due" | "ok";

export type AttentionKind =
  | "audit_reschedule"
  | "lab_chase"
  | "committee"
  | "approval"
  | "tbt"
  | "comment"
  | "generic";

export type PriorityItem = {
  id: string;
  kind: AttentionKind;
  /** True when sourced from a live Core API. */
  live?: boolean;
  doctype?: string;
  name?: string;
  sev: PrioritySev;
  icon: IconName;
  tint: string;
  tone: string;
  ref?: string;
  title: string;
  meta: string[];
  sla: { kind: SlaKind; label: string };
  action: {
    label: string;
    icon: IconName;
    variant: "pri" | "ghost";
    href?: string;
    toast?: string;
  };
  /** Key-value rows shown in the manage drawer. */
  details: { label: string; value: string }[];
  /** Current scheduled date (ISO) for reschedule actions. */
  dueDate?: string;
  /** Module deep-link after action or “Open in module”. */
  href?: string;
};

export type SysStatus = {
  label: string;
  state: "up" | "warn" | "down";
  value: string;
};

export type ModTile = {
  id: string;
  title: string;
  foot: string;
  icon: IconName;
  badge?: string;
  alert?: boolean;
};

/** Static module navigation tiles — labels only, badges come from live APIs. */
export const MODULE_TILES: ModTile[] = [
  { id: "approvals", title: "Approvals", foot: "Certification decisions & votes", icon: "i-check-c" },
  { id: "certification", title: "Certification", foot: "Applications, audits, scheme register", icon: "i-badge" },
  { id: "standards", title: "Standards Dev", foot: "Work programme & technical committees", icon: "i-file" },
  { id: "metrology", title: "Metrology", foot: "Calibration & LIMS", icon: "i-gauge" },
  { id: "lms", title: "LMS & Training", foot: "Courses, enrolments, certificates", icon: "i-cap" },
  { id: "tbt", title: "WTO / TBT alerts", foot: "Trade notifications & responses", icon: "i-globe" },
  { id: "crm", title: "CRM", foot: "Pipeline & client register", icon: "i-briefcase" },
  { id: "finance", title: "Finance", foot: "Invoices, budget tracker", icon: "i-dollar" },
  { id: "hr", title: "HR & People", foot: "Headcount, leave, appraisals", icon: "i-users" },
  { id: "board", title: "Board & Governance", foot: "Resolutions, risk register", icon: "i-bank" },
  { id: "marketing", title: "Marketing", foot: "Campaigns & outreach", icon: "i-mega" },
  { id: "reports", title: "Reports & Analytics", foot: "Dashboards, exports, board pack", icon: "i-chart" },
];
