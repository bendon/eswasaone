/**
 * Calibration job + LIMS test request workflows — map §3.4 (R-M1..R-M4, reviewer ≠ metrologist) and
 * §3.12 Sample → LIMS Test Request (approver ≠ analyst, R-V4).
 * Refinements: "Accepted" holds the job while ESWASA waits for the items or the on-site visit, and
 * "Pending Review" makes the reviewer's queue visible before "Reviewed".
 */
import type { WorkflowDef } from "../workflow/types";
import type { CalJob, TestRequest } from "./types";

export const LAB_MANAGERS = ["Lab Manager", "Eswasa Metrology Manager"];
export const METROLOGISTS = ["Eswasa Metrology Officer", ...LAB_MANAGERS];
export const REVIEWERS = ["Eswasa Metrology Reviewer", "Technical Manager"];

export const JOB_DEF: WorkflowDef<CalJob> = {
  doctype: "Calibration Job",
  label: "Calibration job",
  module: "Metrology",
  states: [
    { id: "Requested", label: "Requested", tone: "slate", display: { customer: "Request received" }, task: { family: "do", verb: "task", role: "Lab Manager", title: (j) => `Quote calibration request ${j.id} — ${j.customer}`, sla_days: 2, rule: "R-M1" } },
    { id: "Quoted", label: "Quoted", tone: "amber", paused: true, display: { customer: "Action needed: accept quote" } },
    { id: "Accepted", label: "Awaiting items", tone: "purple", paused: true, display: { customer: "Bring your items / visit being arranged" } },
    { id: "Received", label: "Received", tone: "navy", display: { customer: "Items received at the lab" }, task: { family: "do", verb: "task", role: "Lab Manager", title: (j) => `Assign a metrologist — ${j.id} (${j.discipline})`, sla_days: 1 } },
    { id: "In Progress", label: "In progress", tone: "gold", display: { customer: "Being calibrated" }, task: { family: "do", verb: "task", role: "Eswasa Metrology Officer", assignee: (j) => j.metrologist, title: (j) => `Complete worksheet — ${j.id} ${j.items[0]?.description ?? ""}`, sla_days: 5 } },
    { id: "Pending Review", label: "Pending review", tone: "navy", display: { customer: "Being calibrated" }, task: { family: "approve", verb: "signoff", role: "Eswasa Metrology Reviewer", title: (j) => `Review calibration results — ${j.id} (${j.customer})`, sla_days: 2, rule: "R-M3" } },
    { id: "Reviewed", label: "Reviewed", tone: "purple", display: { customer: "Certificate being issued" }, task: { family: "do", verb: "task", role: "Lab Manager", title: (j) => `Issue calibration certificate — ${j.id}`, sla_days: 1, rule: "R-M3" } },
    { id: "Certified", label: "Certified", tone: "green", gate: true, display: { customer: "Ready for collection" }, task: { family: "do", verb: "task", role: "Lab Manager", title: (j) => `Hand over or dispatch items — ${j.id}`, sla_days: 5, rule: "R-M4" } },
    { id: "Dispatched", label: "Dispatched", tone: "green", terminal: true, display: { customer: "Collected" } },
    { id: "Cancelled", label: "Cancelled", tone: "slate", terminal: true, display: { customer: "Cancelled" } },
  ],
  transitions: [
    { action: "quote", label: "Send quote", from: ["Requested"], to: "Quoted", roles: LAB_MANAGERS, primary: true, requires: "payload", consequence: "Sends the quote to the customer. The clock pauses until they accept.", rule: "R-M1", notifies: "customer" },
    { action: "decline_request", label: "Decline request", from: ["Requested"], to: "Cancelled", roles: LAB_MANAGERS, requires: "reason", danger: true, consequence: "Tells the customer ESWASA can't do this calibration (outside scope / CMC).", notifies: "customer" },
    { action: "customer_accept", label: "Accept quote", from: ["Quoted"], to: "Accepted", roles: "customer", primary: true, consequence: "Accepts the quote. Bring the items to the lab, or confirm the on-site visit date." },
    { action: "customer_decline", label: "Decline quote", from: ["Quoted"], to: "Cancelled", roles: "customer", requires: "reason", danger: true, consequence: "Declines the quote and closes the request." },
    { action: "mark_accepted", label: "Customer accepted (offline)", from: ["Quoted"], to: "Accepted", roles: LAB_MANAGERS, requires: "note", consequence: "Records an acceptance received by phone, email or at the counter." },
    { action: "receive", label: "Log receipt", from: ["Accepted"], to: "Received", roles: METROLOGISTS, primary: true, requires: "payload", consequence: "Logs the items' arrival with condition, accessories and the job tag. The customer gets a receipt.", notifies: "customer" },
    { action: "assign", label: "Assign metrologist", from: ["Received"], to: "In Progress", roles: LAB_MANAGERS, primary: true, requires: "payload", fields: [{ key: "metrologist", label: "Metrologist", required: true }], consequence: "Starts the job with a competent metrologist for this discipline." },
    { action: "submit_review", label: "Submit for review", from: ["In Progress"], to: "Pending Review", roles: METROLOGISTS, primary: true, records: "Metrologist", consequence: "Locks the worksheet and sends it to a reviewer who isn't you." },
    { action: "approve", label: "Approve results", from: ["Pending Review"], to: "Reviewed", roles: REVIEWERS, primary: true, records: "Reviewer", guards: [{ kind: "not_actor_of", steps: ["Metrologist"], message: "You recorded these results, so a different reviewer must approve them." }], consequence: "Approves the worksheet (technical review).", rule: "R-M3" },
    { action: "return", label: "Return to metrologist", from: ["Pending Review"], to: "In Progress", roles: REVIEWERS, requires: "reason", guards: [{ kind: "not_actor_of", steps: ["Metrologist"], message: "You recorded these results — another reviewer must review them." }], consequence: "Sends the worksheet back with your reason." },
    { action: "issue_certificate", label: "Issue certificate", from: ["Reviewed"], to: "Certified", roles: [...LAB_MANAGERS, ...REVIEWERS], primary: true, consequence: "Generates the calibration certificate (gate document with QR), registers it, raises the invoice and tells the customer it's ready.", rule: "R-M3", notifies: "customer" },
    { action: "dispatch", label: "Record collection / dispatch", from: ["Certified"], to: "Dispatched", roles: METROLOGISTS, primary: true, requires: "payload", fields: [{ key: "name", label: "Collected by / courier", required: true }], consequence: "Records who collected the items (or the courier) and closes the job. The next due date goes to the customer's instrument register.", rule: "R-M4" },
    { action: "cancel", label: "Cancel job", from: ["Requested", "Quoted", "Accepted", "Received"], to: "Cancelled", roles: LAB_MANAGERS, requires: "reason", danger: true, consequence: "Cancels the job and closes its tasks. The customer is told why.", notifies: "customer" },
  ],
};

export const TEST_DEF: WorkflowDef<TestRequest> = {
  doctype: "LIMS Test Request",
  label: "Test request",
  module: "Metrology",
  states: [
    { id: "Requested", label: "Requested", tone: "slate", task: { family: "do", verb: "task", role: "Lab Manager", title: (t) => `Assign an analyst — ${t.id} (${t.product})`, sla_days: 1 } },
    { id: "In Test", label: "In test", tone: "gold", task: { family: "do", verb: "task", role: "Eswasa Lab Analyst", assignee: (t) => t.analyst, title: (t) => `Test and enter results — ${t.id} ${t.product}`, sla_days: 7 } },
    { id: "Pending Approval", label: "Pending approval", tone: "navy", task: { family: "approve", verb: "signoff", role: "Technical Manager", title: (t) => `Approve test results — ${t.id} (${t.conclusion ?? "?"})`, sla_days: 2, rule: "R-V4" } },
    { id: "Approved", label: "Approved", tone: "green", gate: true, terminal: true },
    { id: "Cancelled", label: "Cancelled", tone: "slate", terminal: true },
  ],
  transitions: [
    { action: "assign", label: "Assign analyst", from: ["Requested"], to: "In Test", roles: LAB_MANAGERS, primary: true, requires: "payload", fields: [{ key: "analyst", label: "Analyst", required: true }], consequence: "Starts testing with the chosen analyst." },
    { action: "submit", label: "Submit results", from: ["In Test"], to: "Pending Approval", roles: ["Eswasa Lab Analyst", ...METROLOGISTS], primary: true, records: "Analyst", consequence: "Sends results and the conclusion to the Technical Manager." },
    { action: "approve", label: "Approve results", from: ["Pending Approval"], to: "Approved", roles: ["Technical Manager", ...REVIEWERS], primary: true, records: "Approver", guards: [{ kind: "not_actor_of", steps: ["Analyst"], message: "You entered these results, so a different person must approve them." }], consequence: "Releases the result to the parent record. A fail triggers R-V4 (case, suspension proposal, risk register).", rule: "R-V4" },
    { action: "return", label: "Return to analyst", from: ["Pending Approval"], to: "In Test", roles: ["Technical Manager", ...REVIEWERS], requires: "reason", consequence: "Sends the results back with your reason." },
    { action: "cancel", label: "Cancel test", from: ["Requested", "In Test"], to: "Cancelled", roles: LAB_MANAGERS, requires: "reason", danger: true, consequence: "Cancels the test request." },
  ],
};

export const DISCIPLINES = ["Mass", "Temperature", "Pressure", "Volume", "Length", "Electrical"] as const;
