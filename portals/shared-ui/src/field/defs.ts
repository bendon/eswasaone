/**
 * Field Visit workflow — map §3.12: Planned → Assigned → Accepted → (customer confirms) Confirmed →
 * check in → In Progress → Submitted | Aborted → Returned → resubmit → Closed. R-V1..R-V4.
 * One definition per visit type so the planner and reviewer roles follow the parent module.
 */
import type { WorkflowDef } from "../workflow/types";
import type { ChecklistItem, FieldVisit, VisitType, VisitTypeConfig } from "./types";

const CERT_PLANNERS = ["Certification Manager", "Scheme Manager"];
const MET_PLANNERS = ["Lab Manager", "Eswasa Metrology Manager"];
const SURV_PLANNERS = ["Certification Manager", "Quality Manager", "Customer Service Manager"];

export const VISIT_TYPES: Record<VisitType, VisitTypeConfig> = {
  cert_audit: { label: "Certification audit", short: "Audit", module: "Certification", planners: CERT_PLANNERS, reviewers: CERT_PLANNERS, body: ["checklist", "findings", "samples"], confirm: true, checklist: "ms_audit" },
  factory_inspection: { label: "Factory inspection", short: "Inspection", module: "Certification", planners: CERT_PLANNERS, reviewers: CERT_PLANNERS, body: ["checklist", "findings", "samples"], confirm: true, checklist: "factory" },
  market_sampling: { label: "Market sampling", short: "Sampling", module: "Field", planners: SURV_PLANNERS, reviewers: ["Certification Manager", "Quality Manager"], body: ["samples", "notes"], confirm: false, checklist: "sampling" },
  complaint_investigation: { label: "Complaint investigation", short: "Investigation", module: "CRM", planners: SURV_PLANNERS, reviewers: ["Quality Manager", "Certification Manager"], body: ["notes", "findings", "samples"], confirm: false, checklist: "investigation" },
  onsite_calibration: { label: "On-site calibration", short: "Calibration", module: "Metrology", planners: MET_PLANNERS, reviewers: ["Eswasa Metrology Reviewer", "Technical Manager"], body: ["calibration", "notes"], confirm: true, checklist: "onsite_cal" },
  batch_inspection: { label: "Batch / export inspection", short: "Batch", module: "Certification", planners: CERT_PLANNERS, reviewers: CERT_PLANNERS, body: ["checklist", "samples"], confirm: true, checklist: "batch" },
  import_inspection: { label: "Import inspection", short: "Import", module: "Field", planners: SURV_PLANNERS, reviewers: ["Quality Manager"], body: ["checklist", "samples", "notes"], confirm: false, toConfirm: true, checklist: "batch" },
  legal_metrology: { label: "Legal metrology verification", short: "Verification", module: "Metrology", planners: MET_PLANNERS, reviewers: ["Eswasa Metrology Reviewer"], body: ["calibration", "notes"], confirm: false, toConfirm: true, checklist: "onsite_cal" },
};

/** Versioned checklist templates. Editing a template bumps the version; visits keep the version they froze. */
export const CHECKLISTS: Record<string, { version: string; items: Omit<ChecklistItem, "answer" | "note">[] }> = {
  ms_audit: {
    version: "MS-AUD v3",
    items: [
      { id: "c1", section: "Context", question: "Scope and boundaries of the management system documented and current" },
      { id: "c2", section: "Leadership", question: "Policy communicated; objectives measurable and monitored" },
      { id: "c3", section: "Support", question: "Competence records and training evidence available" },
      { id: "c4", section: "Support", question: "Monitoring and measuring equipment calibrated and traceable" },
      { id: "c5", section: "Operation", question: "Operational controls and records match documented procedures" },
      { id: "c6", section: "Performance", question: "Internal audit programme covers all processes in the cycle" },
      { id: "c7", section: "Performance", question: "Management review held with required inputs and outputs" },
      { id: "c8", section: "Improvement", question: "Nonconformities and corrective actions recorded and effective" },
    ],
  },
  factory: {
    version: "FAC-INS v2",
    items: [
      { id: "f1", section: "Production", question: "Production process follows the approved flow chart" },
      { id: "f2", section: "Quality control", question: "In-process and final testing done at the specified frequency" },
      { id: "f3", section: "Quality control", question: "Test equipment calibrated" },
      { id: "f4", section: "Marking", question: "Product marking and labelling comply with the standard" },
      { id: "f5", section: "Storage", question: "Storage conditions protect product conformity" },
    ],
  },
  sampling: {
    version: "SAMP v1",
    items: [
      { id: "s1", section: "Premises", question: "Premises and trader identified (name, licence)" },
      { id: "s2", section: "Product", question: "Product, brand and batch recorded; mark use observed" },
      { id: "s3", section: "Sample", question: "Sample sealed and labelled in front of the witness" },
    ],
  },
  investigation: {
    version: "INV v1",
    items: [
      { id: "i1", section: "Facts", question: "Complainant's account verified on site" },
      { id: "i2", section: "Facts", question: "Evidence collected (photos, documents, samples)" },
      { id: "i3", section: "Outcome", question: "Immediate risk to consumers identified and reported" },
    ],
  },
  onsite_cal: {
    version: "OSC v2",
    items: [
      { id: "o1", section: "Before", question: "Reference standards checked out, in calibration and intact" },
      { id: "o2", section: "Environment", question: "Ambient conditions within the method limits" },
      { id: "o3", section: "After", question: "Calibration labels applied; customer briefed on results" },
    ],
  },
  batch: {
    version: "BAT v1",
    items: [
      { id: "b1", section: "Consignment", question: "Consignment matches the documents (quantity, lot)" },
      { id: "b2", section: "Consignment", question: "Marking and packaging comply" },
      { id: "b3", section: "Sampling", question: "Samples drawn per the sampling plan" },
    ],
  },
};

const ANY_FIELD = "any_staff" as const;

const isLead = (v: FieldVisit, actor: { name: string; roles: string[] }) =>
  v.lead && v.lead !== actor.name && !actor.roles.some((r) => r === "System Manager" || r === "Administrator") ? `Only the lead (${v.lead}) can do this.` : null;

export function visitDef(type: VisitType): WorkflowDef<FieldVisit> {
  const cfg = VISIT_TYPES[type];
  return {
    doctype: "Field Visit",
    label: "Visit",
    module: cfg.module,
    states: [
      { id: "Planned", label: "Planned", tone: "slate", display: { customer: "Being planned" }, task: { family: "do", verb: "task", role: cfg.planners[0], title: (v) => `Assign a team — ${v.title}`, sla_days: 3, rule: "§5.7" } },
      { id: "Assigned", label: "Assigned", tone: "navy", display: { customer: "Being planned" }, task: { family: "do", verb: "task", role: "Field Officer", assignee: (v) => v.lead, title: (v) => `Accept or decline visit — ${v.title}`, sla_days: 1 } },
      { id: "Accepted", label: "Awaiting customer", tone: "amber", paused: true, display: { customer: "Please confirm the date" } },
      { id: "Confirmed", label: "Confirmed", tone: "purple", display: { customer: "Date confirmed" } },
      { id: "In Progress", label: "In progress", tone: "gold", display: { customer: "Inspector on site" } },
      { id: "Submitted", label: "Submitted", tone: "navy", display: { customer: "Report being reviewed" }, task: { family: "approve", verb: "review", role: cfg.reviewers[0], title: (v) => `Review visit report — ${v.title}`, sla_days: 3, rule: "R-V1" } },
      { id: "Returned", label: "Returned", tone: "red", display: { customer: "Report being reviewed" }, task: { family: "do", verb: "task", role: "Field Officer", assignee: (v) => v.lead, title: (v) => `Fix and resubmit report — ${v.title}`, sla_days: 2 } },
      { id: "Closed", label: "Closed", tone: "green", terminal: true, gate: true, display: { customer: "Visit complete" } },
      { id: "Aborted", label: "Aborted", tone: "red", display: { customer: "Visit could not go ahead" }, task: { family: "approve", verb: "review", role: cfg.planners[0], title: (v) => `Decide on aborted visit — ${v.title}`, sla_days: 2, rule: "R-V3" } },
      { id: "Cancelled", label: "Cancelled", tone: "slate", terminal: true, display: { customer: "Cancelled" } },
    ],
    transitions: [
      { action: "assign", label: "Assign team", from: ["Planned"], to: "Assigned", roles: cfg.planners, primary: true, consequence: "Assigns the lead and team. The lead gets a task to accept; eligibility (competence, impartiality, rotation, leave, workload) was checked in the picker.", rule: "§5.7", fields: [{ key: "lead", label: "Lead", required: true }] },
      { action: "accept", label: "Accept visit", from: ["Assigned"], to: "Accepted", roles: ANY_FIELD, primary: true, records: "Lead", guards: [{ kind: "check", test: isLead }], consequence: cfg.confirm ? "Accepts the assignment. The customer is asked to confirm the date." : "Accepts the assignment. Unannounced visit: no customer confirmation." , notifies: cfg.confirm ? "customer" : undefined },
      { action: "decline", label: "Decline", from: ["Assigned"], to: "Planned", roles: ANY_FIELD, requires: "reason", guards: [{ kind: "check", test: isLead }], consequence: "Hands the visit back to the planner with your reason (conflict of interest, leave, workload)." },
      { action: "confirm_date", label: "Mark date confirmed", from: ["Accepted"], to: "Confirmed", roles: cfg.planners, consequence: "Records that the customer confirmed by phone or email. Prefer the customer confirming in their account." },
      { action: "reschedule", label: "Reschedule", from: ["Planned", "Assigned", "Accepted", "Confirmed", "Aborted"], to: "Accepted", roles: cfg.planners, requires: "reason", fields: [{ key: "planned_date", label: "New date", type: "date", required: true }], consequence: "Moves the visit and asks the customer to confirm the new date.", notifies: "customer" },
      { action: "check_in", label: "Check in", from: ["Confirmed"], to: "In Progress", roles: ANY_FIELD, primary: true, records: "Lead", guards: [{ kind: "check", test: isLead }], consequence: "Records GPS and time of arrival (R-V2). The checklist version is frozen.", rule: "R-V2" },
      { action: "submit", label: "Submit report", from: ["In Progress"], to: "Submitted", roles: ANY_FIELD, primary: true, records: "Lead", guards: [{ kind: "check", test: isLead }], consequence: "Sends the report, findings, photos, samples and signatures for review. Works offline — it queues in the Outbox.", rule: "R-V1" },
      { action: "abort", label: "Abort visit", from: ["Confirmed", "In Progress"], to: "Aborted", roles: ANY_FIELD, requires: "reason", danger: true, guards: [{ kind: "check", test: isLead }], consequence: "Stops the visit (refused access, premises closed, safety). The planner decides what happens next.", rule: "R-V3", fields: [{ key: "code", label: "Why", type: "select", required: true, options: [{ value: "refused_access", label: "Refused access" }, { value: "premises_closed", label: "Premises closed" }, { value: "safety", label: "Safety concern" }, { value: "other", label: "Other" }] }] },
      { action: "close", label: "Accept report & close", from: ["Submitted"], to: "Closed", roles: cfg.reviewers, primary: true, records: "Reviewer", guards: [{ kind: "not_actor_of", steps: ["Lead"], message: "You led this visit — a different reviewer must close it." }], consequence: "Closes the visit. The parent record moves on automatically (R-V4 runs for failed samples).", rule: "R-V4" },
      { action: "return", label: "Return to lead", from: ["Submitted"], to: "Returned", roles: cfg.reviewers, requires: "reason", guards: [{ kind: "not_actor_of", steps: ["Lead"], message: "You led this visit — a different reviewer must review it." }], consequence: "Sends the report back to the lead with your reason." },
      { action: "resubmit", label: "Resubmit report", from: ["Returned"], to: "Submitted", roles: ANY_FIELD, primary: true, guards: [{ kind: "check", test: isLead }], consequence: "Sends the corrected report back for review." },
      { action: "replan", label: "Replan visit", from: ["Aborted"], to: "Planned", roles: cfg.planners, requires: "note", consequence: "Puts the visit back to planning with a note on what changes." },
      { action: "cancel", label: "Cancel visit", from: ["Planned", "Assigned", "Accepted", "Confirmed", "Aborted"], to: "Cancelled", roles: cfg.planners, requires: "reason", danger: true, consequence: "Cancels the visit and closes its tasks. The parent record is told.", notifies: "customer" },
    ],
  };
}

export const SAMPLE_STATES: { id: string; label: string; tone: "navy" | "amber" | "purple" | "gold" | "green" | "red" }[] = [
  { id: "Collected", label: "Collected", tone: "navy" },
  { id: "In Transit", label: "Handed over", tone: "amber" },
  { id: "Received", label: "Received at lab", tone: "purple" },
  { id: "Testing", label: "Testing", tone: "gold" },
  { id: "Result", label: "Result", tone: "green" },
  { id: "Rejected", label: "Rejected at receipt", tone: "red" },
];
