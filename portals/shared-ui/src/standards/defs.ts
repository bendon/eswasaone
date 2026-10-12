/**
 * Standards workflows — map §3.2: proposal (R-S1) → work item WD → CD → Public Review (R-S2) →
 * Comment Resolution → Ballot → Approved → Published (R-S3, gate); periodic review R-S4 (store).
 */
import type { WorkflowDef } from "../workflow/types";
import type { Proposal, WorkItem } from "./types";

export const TC_SECRETARIES = ["TC Secretary", "Eswasa Standards Officer", "Eswasa Standards Secretary", "Head of Standards", "Eswasa Standards Manager"];
export const HEADS = ["Head of Standards", "Eswasa Standards Manager"];

export const PROPOSAL_DEF: WorkflowDef<Proposal> = {
  doctype: "Standards Proposal",
  label: "Proposal",
  module: "Standards",
  states: [
    { id: "Submitted", label: "Submitted", tone: "navy", display: { customer: "Received — under review" }, task: { family: "do", verb: "review", role: "TC Secretary", title: (p) => `Review new work proposal — ${p.title}`, sla_days: 10, rule: "R-S1" } },
    { id: "Circulated", label: "With the TC", tone: "purple", display: { customer: "With the technical committee" }, task: { family: "approve", verb: "approve", role: "Head of Standards", title: (p) => `Record the TC decision on proposal — ${p.title}`, sla_days: 30, rule: "R-S1" } },
    { id: "Approved", label: "Approved", tone: "green", terminal: true, display: { customer: "Approved — added to the work programme" } },
    { id: "Rejected", label: "Rejected", tone: "red", terminal: true, display: { customer: "Not taken forward" } },
  ],
  transitions: [
    { action: "circulate", label: "Circulate to TC", from: ["Submitted"], to: "Circulated", roles: TC_SECRETARIES, primary: true, requires: "payload", fields: [{ key: "tc_id", label: "Technical committee", required: true }], consequence: "Sends the proposal to the TC members for a decision (by correspondence or at the next meeting)." },
    { action: "approve", label: "Approve — create work item", from: ["Circulated", "Submitted"], to: "Approved", roles: HEADS, primary: true, requires: "payload", fields: [{ key: "project_leader", label: "Project leader", required: true }], consequence: "Adds the work to the programme with a project leader and target dates. The proposer is told.", rule: "R-S1", notifies: "customer" },
    { action: "reject", label: "Reject", from: ["Submitted", "Circulated"], to: "Rejected", roles: HEADS, requires: "reason", danger: true, consequence: "Rejects the proposal. The proposer sees your reason.", notifies: "customer" },
  ],
};

export const WI_DEF: WorkflowDef<WorkItem> = {
  doctype: "Standard Work Item",
  label: "Work item",
  module: "Standards",
  states: [
    { id: "Working Draft", label: "Working draft", tone: "slate", display: { customer: "Being drafted" }, task: { family: "do", verb: "task", role: "TC Secretary", title: (w) => `Prepare the committee draft — ${w.ref} ${w.title}`, sla_days: 60 } },
    { id: "Committee Draft", label: "Committee draft", tone: "navy", display: { customer: "With the committee" }, task: { family: "do", verb: "task", role: "TC Secretary", title: (w) => `Get TC consensus and open public comment — ${w.ref}`, sla_days: 30 } },
    { id: "Public Review", label: "Public review", tone: "purple", display: { customer: "Open for comment" } },
    { id: "Comment Resolution", label: "Comment resolution", tone: "amber", display: { customer: "Comments being resolved" }, task: { family: "do", verb: "review", role: "TC Secretary", title: (w) => `Resolve public comments — ${w.ref} ${w.title}`, sla_days: 15 } },
    { id: "Ballot", label: "Ballot", tone: "gold", display: { customer: "TC vote under way" } },
    { id: "Approved", label: "Approved for publication", tone: "green", display: { customer: "Approved — publishing soon" }, task: { family: "approve", verb: "approve", role: "Head of Standards", title: (w) => `Publish ${w.ref} — complete the publication checklist`, sla_days: 10, rule: "R-S3" } },
    { id: "Published", label: "Published", tone: "green", gate: true, terminal: true, display: { customer: "Published" } },
    { id: "Cancelled", label: "Cancelled", tone: "slate", terminal: true, display: { customer: "Cancelled" } },
  ],
  transitions: [
    { action: "promote_cd", label: "Promote to committee draft", from: ["Working Draft"], to: "Committee Draft", roles: TC_SECRETARIES, primary: true, consequence: "The latest draft becomes CD1 for TC consensus." },
    { action: "back_to_wd", label: "Back to working draft", from: ["Committee Draft"], to: "Working Draft", roles: TC_SECRETARIES, requires: "note", consequence: "The TC needs another working draft." },
    { action: "open_comment", label: "Open public comment", from: ["Committee Draft"], to: "Public Review", roles: TC_SECRETARIES, primary: true, requires: "payload", fields: [{ key: "days", label: "Comment period (days)", type: "number", required: true, hint: "Typically 60 (to confirm)" }], consequence: "R-S2: publishes the draft to 'Have your say' on the Service portal and notifies subscribers. The draft is locked for the period.", rule: "R-S2", notifies: "customer" },
    { action: "close_comment", label: "Close comment period now", from: ["Public Review"], to: "Comment Resolution", roles: TC_SECRETARIES, requires: "reason", consequence: "Ends the public period early and starts comment resolution." },
    { action: "revise_draft", label: "Revise the draft", from: ["Comment Resolution"], to: "Committee Draft", roles: TC_SECRETARIES, requires: "note", consequence: "Comments need a new CD before ballot (substantial change)." },
    { action: "open_ballot", label: "Open ballot", from: ["Comment Resolution"], to: "Ballot", roles: TC_SECRETARIES, primary: true, requires: "payload", fields: [{ key: "days", label: "Ballot period (days)", type: "number", required: true }], consequence: "Every voting TC member gets a vote link. The ballot closes on its date and the tally decides." },
    { action: "publish", label: "Publish", from: ["Approved"], to: "Published", roles: HEADS, primary: true, consequence: "R-S3: creates the published standard (gate), the catalogue entry and e-store product, records the gazette notice and notifies subscribers. Compulsory standards create CRM signals.", rule: "R-S3", notifies: "customer" },
    { action: "cancel", label: "Cancel work item", from: ["Working Draft", "Committee Draft", "Public Review", "Comment Resolution", "Ballot", "Approved"], to: "Cancelled", roles: HEADS, requires: "reason", danger: true, consequence: "Stops the work. The TC and commenters are told." },
  ],
};

export const VOTE_LABEL = { approve: "Approve", approve_comments: "Approve with comments", disapprove: "Disapprove", abstain: "Abstain" } as const;
export const DISPOSITION_LABEL = { accepted: "Accepted", accepted_in_principle: "Accepted in principle", rejected: "Rejected", noted: "Noted" } as const;
