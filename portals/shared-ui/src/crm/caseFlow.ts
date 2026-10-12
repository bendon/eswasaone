/**
 * Case lifecycle — mirrors docs/EswasaOne_WORKFLOW_MAP.md §3.7 and
 * eswasa_core/registry/workflows/complaint.yaml (customer display labels).
 * TODO: wire real — Core returns allowed_actions[] from the Frappe workflow; this is the local mirror.
 */
import type { Case, CaseState, CaseType, CrmActor } from "./types";

/* ---------------- roles ----------------
 * Quality Manager, Customer Service (Manager) and Eswasa Appeals Panel are not Role fixtures yet
 * (engine/fixtures). TODO: wire real — add the fixtures, then keep these lists in sync.
 */

const MANAGER_ROLES = [
  "Sales Manager",
  "Quality Manager",
  "Certification Manager",
  "Customer Service Manager",
  "System Manager",
  "Administrator",
];
/** Appeals panel — impartiality: never the original decision-maker (F11). TODO: confirm role name. */
const PANEL_ROLES = ["Eswasa Appeals Panel", "System Manager", "Administrator"];
/** Pure commercial roles: see status, never findings or appeal content (ISO/IEC 17065 §4.2). */
const COMMERCIAL_ONLY = ["Sales User", "Sales Manager"];
const NON_COMMERCIAL_STAFF = [
  "Quality Manager",
  "Certification Manager",
  "Certification Officer",
  "Customer Service",
  "Customer Service Manager",
  "Support Team",
  "System Manager",
  "Administrator",
  "Desk User",
];

export type CaseRole = "agent" | "manager" | "panel";

export function isCaseManager(actor: CrmActor): boolean {
  return actor.roles.some((r) => MANAGER_ROLES.includes(r));
}
export function isAppealsPanel(actor: CrmActor): boolean {
  return actor.roles.some((r) => PANEL_ROLES.includes(r));
}
/** True when the actor only holds sales roles — the impartiality firewall applies. */
export function isCommercialOnly(actor: CrmActor): boolean {
  return (
    actor.roles.some((r) => COMMERCIAL_ONLY.includes(r)) &&
    !actor.roles.some((r) => NON_COMMERCIAL_STAFF.includes(r))
  );
}

/* ---------------- labels ---------------- */

/** Customer-facing labels (complaint.yaml display.customer, extended). */
export const CUSTOMER_STATE_LABEL: Record<CaseState, string> = {
  Open: "Received",
  Triaged: "Received",
  "In Progress": "Being handled",
  "Awaiting Customer": "Action needed",
  Escalated: "Being handled",
  Resolved: "Resolved — please confirm",
  Reopened: "Reopened",
  Closed: "Closed",
};

export const STATE_TONE: Record<CaseState, "navy" | "amber" | "green" | "red" | "slate" | "purple"> = {
  Open: "navy",
  Triaged: "purple",
  "In Progress": "navy",
  "Awaiting Customer": "amber",
  Escalated: "red",
  Resolved: "green",
  Reopened: "amber",
  Closed: "slate",
};

export const OPEN_STATES: CaseState[] = ["Open", "Triaged", "In Progress", "Awaiting Customer", "Escalated", "Reopened"];

export function isOpen(c: Case): boolean {
  return OPEN_STATES.includes(c.state);
}

/* ---------------- transitions ---------------- */

export type CaseActionId =
  | "triage"
  | "start"
  | "request_info"
  | "customer_reply"
  | "resolve"
  | "confirm"
  | "dispute"
  | "resume"
  | "escalate"
  | "take_over"
  | "close"
  | "withdraw"
  | "mark_duplicate";

export type CaseAction = {
  action: CaseActionId;
  label: string;
  to: CaseState;
  /** What the actor must enter before the transition applies. */
  requires?: "reason" | "resolution" | "duplicate_ref";
  danger?: boolean;
  consequence: string;
};

type Transition = CaseAction & {
  from: CaseState[];
  actor: "staff" | "manager" | "customer";
};

const T: Transition[] = [
  {
    action: "triage",
    label: "Triage",
    from: ["Open"],
    to: "Triaged",
    actor: "staff",
    consequence: "Confirms type, priority and team. The customer gets an acknowledgement.",
  },
  {
    action: "start",
    label: "Start work",
    from: ["Triaged"],
    to: "In Progress",
    actor: "staff",
    consequence: "Moves the case to In Progress under your name.",
  },
  {
    action: "request_info",
    label: "Request info",
    from: ["In Progress", "Reopened"],
    to: "Awaiting Customer",
    actor: "staff",
    requires: "reason",
    consequence: "Pauses the SLA clock and asks the customer for information.",
  },
  {
    action: "customer_reply",
    label: "Send reply",
    from: ["Awaiting Customer"],
    to: "In Progress",
    actor: "customer",
    consequence: "Sends your reply to ESWASA and restarts work on the case.",
  },
  {
    action: "resolve",
    label: "Resolve",
    from: ["In Progress", "Reopened", "Escalated"],
    to: "Resolved",
    actor: "staff",
    requires: "resolution",
    consequence: "Sends the resolution. The customer can confirm or dispute it within the reopen window.",
  },
  {
    action: "confirm",
    label: "Confirm resolution",
    from: ["Resolved"],
    to: "Closed",
    actor: "customer",
    consequence: "Closes the case.",
  },
  {
    action: "dispute",
    label: "Not resolved — reopen",
    from: ["Resolved"],
    to: "Reopened",
    actor: "customer",
    requires: "reason",
    consequence: "Reopens the case and sends it back to the team.",
  },
  {
    action: "resume",
    label: "Resume work",
    from: ["Reopened"],
    to: "In Progress",
    actor: "staff",
    consequence: "Picks the reopened case back up.",
  },
  {
    action: "escalate",
    label: "Escalate",
    from: ["Open", "Triaged", "In Progress", "Reopened"],
    to: "Escalated",
    actor: "staff",
    requires: "reason",
    danger: true,
    consequence: "Flags the case to the team manager (R-A2).",
  },
  {
    action: "take_over",
    label: "Take over",
    from: ["Escalated"],
    to: "In Progress",
    actor: "manager",
    consequence: "Manager takes ownership and returns the case to In Progress.",
  },
  {
    action: "close",
    label: "Close",
    from: ["Resolved"],
    to: "Closed",
    actor: "manager",
    consequence: "Closes without waiting for the customer.",
  },
  {
    action: "mark_duplicate",
    label: "Merge as duplicate",
    from: ["Open", "Triaged", "In Progress"],
    to: "Closed",
    actor: "staff",
    requires: "duplicate_ref",
    consequence: "Closes this case and points the customer to the original case.",
  },
  {
    action: "withdraw",
    label: "Withdraw",
    from: ["Open", "Triaged", "In Progress", "Awaiting Customer", "Reopened"],
    to: "Closed",
    actor: "customer",
    danger: true,
    consequence: "Withdraws your case. ESWASA stops working on it.",
  },
];

function strip(t: Transition): CaseAction {
  const { from: _f, actor: _a, ...rest } = t;
  return rest;
}

/** Legal next actions for a staff member (managers also get agent actions). */
export function staffActions(c: Case, actor: CrmActor): CaseAction[] {
  if (c.type === "appeal" && !isAppealsPanel(actor)) return [];
  const manager = isCaseManager(actor);
  return T.filter(
    (t) => t.from.includes(c.state) && (t.actor === "staff" || (t.actor === "manager" && manager)),
  ).map(strip);
}

/** Legal next actions for the customer, honouring the reopen window. */
export function customerActions(c: Case, reopenDays: number, now: Date = new Date()): CaseAction[] {
  return T.filter((t) => {
    if (t.actor !== "customer" || !t.from.includes(c.state)) return false;
    if (t.action === "dispute" && c.resolved_at) {
      const days = (now.getTime() - new Date(c.resolved_at).getTime()) / 86_400_000;
      return days <= reopenDays;
    }
    return true;
  }).map(strip);
}

export function findTransition(action: CaseActionId): CaseAction | undefined {
  const t = T.find((x) => x.action === action);
  return t ? strip(t) : undefined;
}

export function canTransition(c: Case, action: CaseActionId): boolean {
  return T.some((t) => t.action === action && t.from.includes(c.state));
}

/* ---------------- type catalogue for the public hub ---------------- */

export const PUBLIC_CASE_TYPES: { type: CaseType; icon: string; blurb: string }[] = [
  { type: "enquiry", icon: "i-search", blurb: "A question about standards, certification, testing or our services." },
  { type: "service_complaint", icon: "i-warn", blurb: "Something went wrong with a service ESWASA gave you." },
  { type: "product_report", icon: "i-shield", blurb: "A certified product or company isn't meeting its standard." },
  { type: "mark_misuse", icon: "i-badge", blurb: "A product carries an ESWASA mark it shouldn't, or a certificate looks fake." },
  { type: "billing_dispute", icon: "i-dollar", blurb: "An invoice, payment or refund you think is wrong." },
  { type: "feedback", icon: "i-heart", blurb: "A compliment, suggestion or idea." },
];
