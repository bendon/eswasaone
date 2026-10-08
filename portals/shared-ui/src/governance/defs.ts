/**
 * Governance workflow definitions — workflow map §3.10 (Board Meeting, Board Pack, Board Resolution,
 * written variant, Resolution Action, Governance Risk) and rules R-G1..R-G3.
 * Refinement: "Minutes submitted" sits between draft and approved so the approval is visibly taken
 * at the *next* meeting of the same body.
 */
import type { WorkflowDef } from "../workflow/types";
import type { Meeting, Pack, ResAction, Resolution, Risk } from "./types";

export const SECRETARY_ROLES = ["Company Secretary", "Eswasa Board Secretary"];
export const RISK_ROLES = ["Eswasa Risk Officer", ...SECRETARY_ROLES];

export const MEETING_DEF: WorkflowDef<Meeting> = {
  doctype: "Board Meeting",
  label: "Meeting",
  module: "Governance",
  states: [
    { id: "Scheduled", label: "Scheduled", tone: "navy", display: { member: "Upcoming" }, task: { family: "do", verb: "task", role: "Company Secretary", title: (m) => `Prepare agenda, notice and pack — ${m.title}`, sla_days: 10, rule: "R-G1" } },
    { id: "Pack issued", label: "Pack issued", tone: "purple", display: { member: "Pack ready to read" } },
    { id: "Held", label: "Held", tone: "amber", display: { member: "Held — minutes to follow" }, task: { family: "do", verb: "task", role: "Company Secretary", title: (m) => `Draft minutes — ${m.title}`, sla_days: 5 } },
    { id: "Minutes draft", label: "Minutes draft", tone: "amber", display: { member: "Held — minutes to follow" }, task: { family: "do", verb: "task", role: "Company Secretary", title: (m) => `Finish and submit minutes — ${m.title}`, sla_days: 5 } },
    { id: "Minutes submitted", label: "Minutes submitted", tone: "gold", display: { member: "Minutes for approval at next meeting" } },
    { id: "Minutes approved", label: "Minutes approved", tone: "green", gate: true, terminal: true, display: { member: "Minutes approved" } },
    { id: "Cancelled", label: "Cancelled", tone: "slate", terminal: true },
  ],
  transitions: [
    { action: "reschedule", label: "Reschedule", from: ["Scheduled", "Pack issued"], to: "Scheduled", roles: SECRETARY_ROLES, requires: "reason", fields: [{ key: "scheduled_at", label: "New date and time", type: "text", required: true, hint: "e.g. 2026-11-12 09:00" }], consequence: "Moves the meeting. Members get a new notice; an issued pack goes back to Draft for re-issue.", notifies: "member" },
    { action: "issue_pack", label: "Issue pack", from: ["Scheduled"], to: "Pack issued", roles: SECRETARY_ROLES, primary: true, consequence: "Issues the assembled pack to members (gate document). Only possible when every included section is Ready, the agenda is final and notice is satisfied.", rule: "R-G1", notifies: "member" },
    { action: "close_meeting", label: "Close meeting", from: ["Pack issued"], to: "Held", roles: SECRETARY_ROLES, primary: true, consequence: "Records the meeting as held with today's attendance and decisions. Opens the minutes task." },
    { action: "start_minutes", label: "Start minutes", from: ["Held"], to: "Minutes draft", roles: SECRETARY_ROLES, primary: true, consequence: "Opens the minutes editor, pre-filled from the run log." },
    { action: "submit_minutes", label: "Submit minutes", from: ["Minutes draft"], to: "Minutes submitted", roles: SECRETARY_ROLES, primary: true, consequence: "Freezes the draft and puts it on the agenda of the next meeting of the same body for approval." },
    { action: "return_minutes", label: "Return to draft", from: ["Minutes submitted"], to: "Minutes draft", roles: SECRETARY_ROLES, requires: "reason", consequence: "Re-opens the minutes for corrections." },
    { action: "approve_minutes", label: "Approve minutes", from: ["Minutes submitted"], to: "Minutes approved", roles: SECRETARY_ROLES, primary: true, consequence: "Records approval by the next meeting of the same body. The minutes become a gate document (submitted, never edited)." },
    { action: "cancel", label: "Cancel meeting", from: ["Scheduled", "Pack issued"], to: "Cancelled", roles: SECRETARY_ROLES, requires: "reason", danger: true, consequence: "Cancels the meeting and closes its open tasks. Members are told why.", notifies: "member" },
  ],
};

export const PACK_DEF: WorkflowDef<Pack> = {
  doctype: "Board Pack",
  label: "Pack",
  module: "Governance",
  states: [
    { id: "Draft", label: "Draft", tone: "amber" },
    { id: "Assembled", label: "Assembled", tone: "purple" },
    { id: "Issued", label: "Issued", tone: "green", gate: true },
  ],
  transitions: [
    { action: "assemble", label: "Assemble version", from: ["Draft", "Assembled"], to: "Assembled", roles: SECRETARY_ROLES, primary: true, consequence: "Snapshots every included section (live module figures are frozen) as a new version vN." },
    { action: "reopen", label: "Reopen for edits", from: ["Assembled"], to: "Draft", roles: SECRETARY_ROLES, consequence: "Back to Draft so owners can change sections. The next assembly becomes a new version." },
    { action: "issue", label: "Issue to members", from: ["Assembled"], to: "Issued", roles: SECRETARY_ROLES, primary: true, consequence: "Issues the latest version as the gate document and notifies members.", notifies: "member" },
    { action: "supersede", label: "Supersede with new version", from: ["Issued"], to: "Draft", roles: SECRETARY_ROLES, requires: "reason", consequence: "Issued versions are never edited: this opens a new draft that will be re-issued as v+1. Members are told why." },
  ],
};

export const RESOLUTION_DEF: WorkflowDef<Resolution> = {
  doctype: "Board Resolution",
  label: "Resolution",
  module: "Governance",
  states: [
    { id: "Proposed", label: "Proposed", tone: "navy" },
    { id: "Circulated", label: "Circulated for vote", tone: "purple", display: { member: "Vote open" } },
    { id: "Passed", label: "Passed", tone: "green", gate: true },
    { id: "Rejected", label: "Rejected", tone: "red", terminal: true },
    { id: "Deferred", label: "Deferred", tone: "amber" },
    { id: "Lapsed", label: "Lapsed", tone: "slate", terminal: true },
    { id: "Implemented", label: "Implemented", tone: "green", terminal: true },
  ],
  transitions: [
    { action: "pass", label: "Record as passed", from: ["Proposed"], to: "Passed", roles: SECRETARY_ROLES, primary: true, consequence: "Records the vote and submits the resolution (gate). R-G2 opens action tasks for each owner.", rule: "R-G2" },
    { action: "reject", label: "Record as rejected", from: ["Proposed"], to: "Rejected", roles: SECRETARY_ROLES, requires: "reason", danger: true, consequence: "Records that the body rejected the proposal." },
    { action: "defer", label: "Defer", from: ["Proposed"], to: "Deferred", roles: SECRETARY_ROLES, requires: "reason", consequence: "Carries the proposal to a later meeting." },
    { action: "reconsider", label: "Bring back", from: ["Deferred"], to: "Proposed", roles: SECRETARY_ROLES, consequence: "Puts the proposal back for a vote." },
    { action: "close_vote", label: "Close vote now", from: ["Circulated"], to: "Passed", roles: SECRETARY_ROLES, consequence: "Closes the written vote early. It passes only if the threshold is already met; otherwise it lapses." },
    { action: "withdraw", label: "Withdraw", from: ["Circulated", "Proposed"], to: "Lapsed", roles: SECRETARY_ROLES, requires: "reason", danger: true, consequence: "Withdraws the resolution. Members are told why." },
    { action: "implement", label: "Mark implemented", from: ["Passed"], to: "Implemented", roles: SECRETARY_ROLES, requires: "note", consequence: "Confirms every action is complete. Recorded in the tracker and the next pack." },
  ],
};

export const ACTION_DEF: WorkflowDef<ResAction> = {
  doctype: "Resolution Action",
  label: "Action",
  module: "Governance",
  states: [
    { id: "Open", label: "Open", tone: "navy", task: { family: "do", verb: "task", role: "Desk User", assignee: (a) => a.owner, title: (a) => `Board action: ${a.description}`, sla_days: 20, rule: "R-G2" } },
    { id: "Completed", label: "Completed", tone: "green", terminal: true },
  ],
  transitions: [
    { action: "complete", label: "Complete with evidence", from: ["Open"], to: "Completed", roles: "any_staff", requires: "note", primary: true, consequence: "Closes the action. The evidence note is shown in the tracker and the next pack." },
    { action: "reopen", label: "Reopen", from: ["Completed"], to: "Open", roles: SECRETARY_ROLES, requires: "reason", consequence: "Re-opens the action for its owner." },
  ],
};

export const RISK_DEF: WorkflowDef<Risk> = {
  doctype: "Governance Risk",
  label: "Risk",
  module: "Governance",
  states: [
    { id: "Open", label: "Open", tone: "navy" },
    { id: "Under Review", label: "Under review", tone: "amber", task: { family: "do", verb: "review", role: "Eswasa Risk Officer", assignee: (r) => r.owner, title: (r) => `Review risk ${r.id} — ${r.title}`, sla_days: 5 } },
    { id: "Closed", label: "Closed", tone: "slate", terminal: true },
  ],
  transitions: [
    { action: "start_review", label: "Start review", from: ["Open"], to: "Under Review", roles: RISK_ROLES, primary: true, consequence: "Opens a review task for the owner." },
    { action: "complete_review", label: "Complete review", from: ["Under Review"], to: "Open", roles: RISK_ROLES, requires: "note", primary: true, consequence: "Records the review with the current residual rating and sets the next review date." },
    { action: "close", label: "Close risk", from: ["Open", "Under Review"], to: "Closed", roles: RISK_ROLES, requires: "reason", danger: true, consequence: "Closes the risk (it no longer applies)." },
    { action: "reopen", label: "Reopen", from: ["Closed"], to: "Open", roles: RISK_ROLES, requires: "reason", consequence: "Brings the risk back onto the register." },
  ],
};
