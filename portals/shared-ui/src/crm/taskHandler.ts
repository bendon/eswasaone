/**
 * Approvals handler for CRM cases: preview + the case's legal staff actions from the inbox.
 */
import { registerTaskHandler } from "../tasks/handlers";
import type { ActionOption } from "../workflow/types";
import { staffActions, type CaseActionId } from "./caseFlow";
import { actOnCase, peekCase } from "./store";

registerTaskHandler({
  doctype: "Case",
  currentState: (t) => peekCase(t.name)?.state ?? null,
  actions: (t, actor) => {
    const c = peekCase(t.name);
    if (!c) return [];
    return staffActions(c, actor).map<ActionOption>((a) => ({
      action: a.action,
      label: a.label,
      to: a.to,
      danger: a.danger,
      consequence: a.consequence,
      primary: ["triage", "start", "resolve", "take_over", "resume"].includes(a.action),
      notifies: ["request_info", "resolve", "mark_duplicate"].includes(a.action) ? "customer" : undefined,
      requires: a.requires === "reason" ? "reason" : a.requires === "resolution" ? "note" : a.requires === "duplicate_ref" ? "payload" : undefined,
      fields: a.requires === "duplicate_ref" ? [{ key: "duplicate_ref", label: "Original case reference", required: true }] : undefined,
    }));
  },
  act: async (t, action, actor, input) => {
    const c = peekCase(t.name);
    if (!c) throw new Error("Case not found.");
    if (c.state !== input.expected_state) throw new Error(`Already moved to ${c.state} by ${c.events[c.events.length - 1]?.actor ?? "someone else"}.`);
    await actOnCase(t.name, action as CaseActionId, actor, { note: input.reason ?? input.note, duplicate_ref: input.payload?.duplicate_ref });
  },
  preview: (t) => {
    const c = peekCase(t.name);
    if (!c) return null;
    return {
      summary: c.description,
      facts: [
        { label: "Reference", value: c.ref },
        { label: "Type", value: c.type.replace(/_/g, " ") },
        { label: "State", value: c.state },
        { label: "Team", value: c.team },
        { label: "Assignee", value: c.assignee ?? "Unassigned" },
        { label: "Priority", value: c.priority },
        ...(c.about ? [{ label: "About", value: c.about.label }] : []),
      ],
      history: c.events.slice(-3).reverse().map((e) => ({ at: e.at, actor: e.actor, action: e.action, from: e.from, to: e.to, note: e.note })),
      documents: c.thread.flatMap((m) => (m.attachments ?? []).map((a) => ({ name: a }))),
      duties: c.decision_maker ? [{ step: "Original decision", people: [c.decision_maker] }] : undefined,
    };
  },
});
