/**
 * Certification desk → Approvals tasks (gap 01 C4 / gap 02 A10), until certification moves onto
 * the shared workflow engine (Phase 2). Findings awaiting review, open appeals/complaints and
 * refusals each put a task in the inbox; it closes when the desk record moves on.
 */
import { closeRecordTasks, openTask, taskStore } from "@eswasaone/shared-ui/tasks";
import type { DeskCase, DeskDecision, DeskFinding } from "./deskApi";

const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* task store unavailable — never block a desk write */
  }
};

export function syncFindingTask(f: DeskFinding): void {
  safe(() => {
    if (f.status === "submitted") {
      openTask({
        doctype: "Nonconformity",
        name: f.id,
        state: "Response submitted",
        seq: 1,
        family: "approve",
        verb: "review",
        role: "Certification Manager",
        title: `Review corrective action ${f.id} — ${f.org} (${f.severity})`,
        module: "Certification",
        link: "/certification/findings",
        sla_days: f.severity === "major" ? 3 : 5,
        rule: "R-C2",
        facts: { Clause: f.clause, Severity: f.severity, Application: f.application_id },
      });
    } else if (f.status === "open") {
      closeRecordTasks("Nonconformity", f.id, "Returned to client", "System");
    } else {
      closeRecordTasks("Nonconformity", f.id, f.status === "accepted" ? "Accepted" : "Rejected", "System");
    }
  });
}

export function syncDeskCaseTask(c: DeskCase): void {
  safe(() => {
    if (c.status === "closed") return closeRecordTasks("Certification Case", c.id, "Closed", "System");
    openTask({
      doctype: "Certification Case",
      name: c.id,
      state: c.status,
      seq: 1,
      family: c.kind === "appeal" ? "approve" : "do",
      verb: c.kind === "appeal" ? "review" : "task",
      role: c.kind === "appeal" ? "Eswasa Appeals Panel" : "Certification Officer",
      title: `${c.kind === "appeal" ? "Appeal" : c.kind === "complaint" ? "Complaint" : "Client notice"} ${c.id} from ${c.from}`,
      module: "Certification",
      link: "/certification/register",
      sla_days: c.kind === "appeal" ? 30 : 10,
      rule: c.kind === "appeal" ? "F11" : undefined,
      facts: { From: c.from, ...(c.application_id ? { Application: c.application_id } : {}) },
    });
  });
}

/** A refusal opens the appeal window; any decision closes the decision task. */
export function syncDecisionTask(d: DeskDecision): void {
  safe(() => closeRecordTasks("Certification Decision", d.application_id, d.outcome === "granted" ? "Granted" : "Refused", d.decided_by));
}

let reconciled = false;
export function reconcileDeskTasks(findings: DeskFinding[], cases: DeskCase[]): void {
  if (reconciled) return;
  reconciled = true;
  safe(() => {
    const known = Object.keys(taskStore.read().tasks);
    for (const f of findings) if (f.status === "submitted" && !known.some((k) => k.startsWith(`Nonconformity|${f.id}|`))) syncFindingTask(f);
    for (const c of cases) if (c.status !== "closed" && !known.some((k) => k.startsWith(`Certification Case|${c.id}|`))) syncDeskCaseTask(c);
  });
}
