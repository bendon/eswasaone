/**
 * Certification workflows — map §3.1: Submitted → Document Review → Awaiting Customer ‖ → Quoted ‖ →
 * Audit Planned → Audit in Progress → NC Resolution → Technical Review → Decision → Certified /
 * Rejected / Withdrawn; the register record (Active → Surveillance Due → Suspended → …) and mark-use
 * requests. Separation of duties (§5.6): technical reviewer ≠ audit team; decision-maker ≠ audit team ≠
 * reviewer; reinstate ≠ the person who suspended. Rules R-C1..R-C7.
 */
import type { WorkflowDef } from "../workflow/types";
import type { CertApplication, CertificateRec, MarkRequest } from "./types";

export const CERT_OFFICERS = ["Certification Officer", "Certification Manager", "Scheme Manager"];
export const CERT_MANAGERS = ["Certification Manager", "Scheme Manager"];
export const DECIDERS = ["Certification Manager", "Eswasa CAC Member"];

export const APP_DEF: WorkflowDef<CertApplication> = {
  doctype: "Certification Application",
  label: "Application",
  module: "Certification",
  states: [
    { id: "Submitted", label: "Submitted", tone: "slate", display: { customer: "Received" }, task: { family: "do", verb: "task", role: "Certification Officer", title: (a) => `New application — ${a.org} (${a.standard})`, sla_days: 2, rule: "R-C1" } },
    { id: "Document Review", label: "Document review", tone: "navy", display: { customer: "Documents being reviewed" }, task: { family: "do", verb: "review", role: "Certification Officer", assignee: (a) => a.officer, title: (a) => `Review documents — ${a.org} (${a.standard})`, sla_days: 3 } },
    { id: "Awaiting Customer", label: "Awaiting customer", tone: "amber", paused: true, display: { customer: "Action needed" } },
    { id: "Quoted", label: "Quoted", tone: "amber", paused: true, display: { customer: "Action needed: accept quote" } },
    { id: "Audit Planned", label: "Audit planned", tone: "purple", display: { customer: "Audit being arranged" }, task: { family: "do", verb: "task", role: "Scheme Manager", title: (a) => `Plan the audit — team, dates and plan for ${a.org}`, sla_days: 5, rule: "§5.6" } },
    { id: "Audit in Progress", label: "Audit in progress", tone: "gold", display: { customer: "Audit under way" } },
    { id: "NC Resolution", label: "NC resolution", tone: "red", display: { customer: "Action needed: respond to findings" } },
    { id: "Technical Review", label: "Technical review", tone: "navy", display: { customer: "File under independent review" }, task: { family: "do", verb: "review", role: "Technical Reviewer", title: (a) => `Technical review — ${a.org} (${a.standard})`, sla_days: 5, rule: "§5.6" } },
    { id: "Decision", label: "Decision", tone: "purple", display: { customer: "Certification decision pending" }, task: { family: "approve", verb: "approve", role: "Certification Manager", title: (a) => `Certification decision — ${a.org} (${a.technical_review?.recommendation ?? "?"})`, sla_days: 3, rule: "R-C3" } },
    { id: "Certified", label: "Certified", tone: "green", gate: true, terminal: true, display: { customer: "Certified" } },
    { id: "Rejected", label: "Refused", tone: "red", terminal: true, display: { customer: "Not certified" } },
    { id: "Withdrawn", label: "Withdrawn", tone: "slate", terminal: true, display: { customer: "Withdrawn" } },
  ],
  transitions: [
    { action: "start_review", label: "Claim & start review", from: ["Submitted"], to: "Document Review", roles: CERT_OFFICERS, primary: true, records: "Officer", consequence: "You become the certification officer for this file and start the document review.", rule: "R-C1" },
    { action: "request_info", label: "Request information", from: ["Document Review"], to: "Awaiting Customer", roles: CERT_OFFICERS, requires: "reason", consequence: "Sends the customer a list of what's missing. The SLA clock pauses until they respond (chases at D+7, D+14).", notifies: "customer" },
    { action: "customer_respond", label: "Submit response", from: ["Awaiting Customer"], to: "Document Review", roles: "customer", primary: true, consequence: "Sends your documents back to the certification officer." },
    { action: "resume_review", label: "Resume review (received offline)", from: ["Awaiting Customer"], to: "Document Review", roles: CERT_OFFICERS, requires: "note", consequence: "Records that the customer answered by email or at the desk." },
    { action: "issue_quote", label: "Accept documents & issue quote", from: ["Document Review"], to: "Quoted", roles: CERT_OFFICERS, primary: true, requires: "payload", consequence: "Issues the quote and certification agreement. The customer accepts and pays the deposit online (R-E/R-F).", notifies: "customer" },
    { action: "customer_accept", label: "Accept quote & pay deposit", from: ["Quoted"], to: "Audit Planned", roles: "customer", primary: true, consequence: "Accepts the agreement. The deposit unlocks audit planning." },
    { action: "record_deposit", label: "Deposit received (offline)", from: ["Quoted"], to: "Audit Planned", roles: CERT_MANAGERS, requires: "note", consequence: "Records an EFT or counter payment and moves the file to audit planning." },
    { action: "start_audit", label: "Start audit", from: ["Audit Planned"], to: "Audit in Progress", roles: CERT_MANAGERS, primary: true, consequence: "Marks the audit as under way. Visits carry the field work." },
    { action: "to_nc_resolution", label: "Move to NC resolution", from: ["Audit in Progress"], to: "NC Resolution", roles: CERT_MANAGERS, consequence: "Visit reports are closed and findings need the customer's corrective actions.", rule: "R-C2" },
    { action: "to_technical_review", label: "Send to technical review", from: ["Audit in Progress", "NC Resolution"], to: "Technical Review", roles: CERT_OFFICERS, primary: true, consequence: "All findings are closed and visits reviewed. An independent reviewer outside the audit team takes the file.", rule: "§5.6" },
    { action: "complete_review", label: "Complete technical review", from: ["Technical Review"], to: "Decision", roles: ["Technical Reviewer", "Certification Manager"], primary: true, requires: "payload", records: "Technical reviewer", guards: [{ kind: "not_actor_of", steps: ["Audit team"], message: "You were on the audit team — the technical review must be done by someone outside it." }], consequence: "Records your review checklist and recommendation, and opens the decision task." },
    { action: "review_more_info", label: "Return for more evidence", from: ["Technical Review"], to: "NC Resolution", roles: ["Technical Reviewer", "Certification Manager"], requires: "reason", guards: [{ kind: "not_actor_of", steps: ["Audit team"], message: "You were on the audit team — another reviewer must do this." }], consequence: "Sends the file back for more NC evidence before it can be recommended." },
    { action: "grant", label: "Grant certification", from: ["Decision"], to: "Certified", roles: DECIDERS, primary: true, records: "Decision maker", guards: [{ kind: "not_actor_of", steps: ["Audit team", "Technical reviewer"], message: "The decision-maker can't be on the audit team or be the technical reviewer." }], consequence: "R-C3: issues the certificate (PDF + QR), registers it, raises the certificate fee invoice and tells the customer.", rule: "R-C3", notifies: "customer" },
    { action: "grant_conditions", label: "Grant with conditions", from: ["Decision"], to: "Certified", roles: DECIDERS, records: "Decision maker", requires: "note", guards: [{ kind: "not_actor_of", steps: ["Audit team", "Technical reviewer"], message: "The decision-maker can't be on the audit team or be the technical reviewer." }], consequence: "Grants with the conditions you write; they print on the certificate annex.", rule: "R-C3", notifies: "customer" },
    { action: "refuse", label: "Refuse", from: ["Decision"], to: "Rejected", roles: DECIDERS, requires: "reason", danger: true, records: "Decision maker", guards: [{ kind: "not_actor_of", steps: ["Audit team", "Technical reviewer"], message: "The decision-maker can't be on the audit team or be the technical reviewer." }], consequence: "Refuses certification. A refusal letter is generated and the customer is told about the 90-day appeal window.", rule: "R-C4", notifies: "customer" },
    { action: "return_review", label: "Return to technical review", from: ["Decision"], to: "Technical Review", roles: DECIDERS, requires: "reason", consequence: "Sends the file back to the reviewer with your question." },
    { action: "withdraw", label: "Withdraw application", from: ["Submitted", "Document Review", "Awaiting Customer", "Quoted", "Audit Planned", "Audit in Progress", "NC Resolution"], to: "Withdrawn", roles: [...CERT_MANAGERS, "Certification Officer"], requires: "reason", danger: true, consequence: "Closes the application and its tasks. Open visits are cancelled.", notifies: "customer" },
    { action: "customer_withdraw", label: "Withdraw my application", from: ["Submitted", "Document Review", "Awaiting Customer", "Quoted", "Audit Planned"], to: "Withdrawn", roles: "customer", requires: "reason", danger: true, consequence: "Withdraws your application. Fees already invoiced remain due." },
  ],
};

export const REG_DEF: WorkflowDef<CertificateRec> = {
  doctype: "Certification",
  label: "Certificate",
  module: "Certification",
  states: [
    { id: "Active", label: "Active", tone: "green", display: { customer: "Valid" } },
    { id: "Surveillance Due", label: "Surveillance due", tone: "amber", display: { customer: "Valid — surveillance due" }, task: { family: "do", verb: "task", role: "Scheme Manager", title: (c) => `Plan surveillance — ${c.org} (${c.number})`, sla_days: 10, rule: "R-C5" } },
    { id: "Suspended", label: "Suspended", tone: "red", display: { customer: "Suspended" } },
    { id: "Withdrawn", label: "Withdrawn", tone: "slate", terminal: true, display: { customer: "Withdrawn" } },
    { id: "Expired", label: "Expired", tone: "slate", terminal: true, display: { customer: "Expired" } },
  ],
  transitions: [
    { action: "surveillance_done", label: "Surveillance complete", from: ["Surveillance Due"], to: "Active", roles: CERT_MANAGERS, requires: "note", consequence: "Records that the surveillance visit closed with no open majors." },
    { action: "suspend", label: "Suspend", from: ["Active", "Surveillance Due"], to: "Suspended", roles: CERT_MANAGERS, requires: "reason", danger: true, records: "Suspended by", guards: [{ kind: "not_actor_of", steps: ["Raised finding"], message: "You raised the finding behind this — another manager must suspend." }], consequence: "Suspends the certificate. The public register and verify page show Suspended at once (CER_PR_026).", rule: "R-C6", notifies: "customer" },
    { action: "reinstate", label: "Reinstate", from: ["Suspended"], to: "Active", roles: CERT_MANAGERS, requires: "note", records: "Reinstated by", guards: [{ kind: "not_actor_of", steps: ["Suspended by"], message: "You suspended this certificate — a different manager must reinstate it." }], consequence: "Reinstates on the evidence you record (closed NCs, verification visit).", rule: "R-C6", notifies: "customer" },
    { action: "withdraw", label: "Withdraw", from: ["Active", "Surveillance Due", "Suspended"], to: "Withdrawn", roles: CERT_MANAGERS, requires: "reason", danger: true, consequence: "Withdraws the certificate permanently. The holder must stop using the mark.", rule: "R-C6", notifies: "customer" },
  ],
};

export const MARK_DEF: WorkflowDef<MarkRequest> = {
  doctype: "Mark Use Request",
  label: "Mark-use request",
  module: "Certification",
  states: [
    { id: "Submitted", label: "Submitted", tone: "navy", display: { customer: "Being reviewed" }, task: { family: "approve", verb: "approve", role: "Certification Officer", title: (m) => `Approve mark artwork — ${m.org} (${m.usage})`, sla_days: 5, rule: "CER_RU_028" } },
    { id: "Approved", label: "Approved", tone: "green", terminal: true, display: { customer: "Approved" } },
    { id: "Returned", label: "Returned", tone: "amber", display: { customer: "Changes needed" } },
    { id: "Rejected", label: "Rejected", tone: "red", terminal: true, display: { customer: "Not approved" } },
  ],
  transitions: [
    { action: "approve", label: "Approve artwork", from: ["Submitted"], to: "Approved", roles: CERT_OFFICERS, primary: true, consequence: "Approves this use of the ESWASA mark (CER_RU_028).", notifies: "customer" },
    { action: "return", label: "Return with comments", from: ["Submitted"], to: "Returned", roles: CERT_OFFICERS, requires: "reason", consequence: "Asks the customer to change the artwork.", notifies: "customer" },
    { action: "reject", label: "Reject", from: ["Submitted"], to: "Rejected", roles: CERT_OFFICERS, requires: "reason", danger: true, consequence: "Refuses this use of the mark.", notifies: "customer" },
    { action: "resubmit", label: "Resubmit", from: ["Returned"], to: "Submitted", roles: "customer", primary: true, consequence: "Sends the corrected artwork back for review." },
  ],
};

export const TR_CHECKLIST = [
  { id: "t1", q: "Audit team was competent for the scope (codes) and independent" },
  { id: "t2", q: "Audit duration met the auditor-day requirement" },
  { id: "t3", q: "All clauses of the standard covered across Stage 1 and Stage 2" },
  { id: "t4", q: "Every nonconformity has an accepted correction and corrective action" },
  { id: "t5", q: "Majors verified closed with objective evidence" },
  { id: "t6", q: "Lab results (product schemes) approved and conforming" },
  { id: "t7", q: "Scope wording on the certificate matches what was audited" },
];
