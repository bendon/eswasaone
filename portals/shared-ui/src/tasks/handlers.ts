/**
 * Per-doctype task handlers — how Approvals previews a task's record and which transitions it can
 * fire from the inbox (gap 02 A2/A3). Domain modules register on import; tasks without a handler
 * get the generic approve / reject / return / done set (reasons enforced).
 */
import type { ActInput, ActionOption, Actor, HistoryEvent } from "../workflow/types";
import { completeTask, type Task } from "./store";

export type TaskPreview = {
  facts: { label: string; value: string }[];
  history: HistoryEvent[];
  documents?: { name: string; kind?: string }[];
  /** Who did what on the record, for the four-eyes panel. */
  duties?: { step: string; people: string[] }[];
  summary?: string;
};

export type TaskHandler = {
  doctype: string;
  /** Current state of the record (for expected_state + conflict detection). */
  currentState: (t: Task) => string | null;
  actions: (t: Task, actor: Actor) => ActionOption[];
  act: (t: Task, action: string, actor: Actor, input: ActInput) => Promise<void>;
  preview: (t: Task, actor: Actor) => TaskPreview | null;
};

const registry = new Map<string, TaskHandler>();

export function registerTaskHandler(h: TaskHandler): void {
  registry.set(h.doctype, h);
}

export function taskHandler(doctype: string): TaskHandler {
  return registry.get(doctype) ?? genericHandler;
}

/** Generic set: works on any task by closing it with an outcome (modules without a store yet). */
const genericHandler: TaskHandler = {
  doctype: "*",
  currentState: (t) => (t.closed_at ? `closed:${t.outcome}` : t.state),
  actions: (t) => {
    if (t.family === "approve")
      return [
        { action: "approve", label: t.verb === "signoff" ? "Sign off" : "Approve", primary: true, consequence: "Approves the item and sends it to the next step." },
        { action: "return", label: "Request info", requires: "reason", consequence: "Sends it back to the originator with your reason; their SLA restarts." },
        { action: "reject", label: "Reject", requires: "reason", danger: true, consequence: "Rejects the item. The originator sees your reason and can appeal." },
      ];
    if (t.family === "alert")
      return [
        { action: "acknowledge", label: "Acknowledge", primary: true, consequence: "Marks the alert as seen and closes it." },
      ];
    return [{ action: "done", label: "Mark done", primary: true, consequence: "Closes the task as done." }];
  },
  act: async (t, action, actor, input) => {
    const label: Record<string, string> = { approve: "Approved", return: "Returned", reject: "Rejected", acknowledge: "Acknowledged", done: "Done" };
    await completeTask(t.id, actor, label[action] ?? action, input.reason);
  },
  preview: (t) => ({
    facts: Object.entries(t.facts ?? {}).map(([label, value]) => ({ label, value })),
    history: t.log.map((l) => ({ at: l.at, actor: l.actor, action: l.action, note: l.note })),
  }),
};
