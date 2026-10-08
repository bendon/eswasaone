/**
 * Live Core approvals (GET /approvals) → the same Task shape as the local task store, so the inbox
 * renders one list. Family comes from the item when Core sends it; the title heuristic is only a
 * fallback for older Core rows. TODO: wire real — Core to return family/verb/role/link from the
 * registry (gap 02 A2), then delete the fallback.
 */
import { apiFetch, ApiError } from "@eswasaone/shared-ui";
import type { ActInput, ActionOption, Actor } from "@eswasaone/shared-ui/workflow";
import type { Task, TaskModule } from "@eswasaone/shared-ui/tasks";
import type { ApprovalItem } from "../api/types";
import { fromApprovalItem, moduleLabel } from "./inbox";

export type InboxTask = Task & { live?: boolean };

const ROUTE_BY_MODULE: Record<string, string> = {
  Certification: "/certification",
  Metrology: "/metrology",
  Standards: "/standards",
  Governance: "/board",
  "WTO/TBT": "/tbt",
  HR: "/hr",
  Finance: "/finance",
  CRM: "/crm",
};

export function liveToTask(item: ApprovalItem & { family?: Task["family"]; verb?: string; role?: string; link?: string }): InboxTask {
  const row = fromApprovalItem(item);
  const module = moduleLabel(item.module || "Governance") as TaskModule;
  const created = new Date().toISOString();
  return {
    id: `live|${item.doctype}|${item.name}`,
    doctype: item.doctype,
    name: item.name,
    state: item.status || "Pending",
    seq: 0,
    family: item.family ?? row.fam,
    verb: item.verb ?? row.verb,
    role: item.role ?? "Desk User",
    created_at: created,
    due: item.due_at ?? new Date(Date.now() + 5 * 86_400_000).toISOString(),
    title: item.title,
    module,
    link: item.link ?? ROUTE_BY_MODULE[module] ?? "/",
    priority: item.sla_breached ? "urgent" : "normal",
    facts: row.detail,
    log: [],
    live: true,
  };
}

export function liveActions(t: InboxTask): ActionOption[] {
  if (t.family === "approve")
    return [
      { action: "approve", label: t.verb === "signoff" ? "Sign off" : "Approve", primary: true, consequence: "Approves the item in Frappe and moves it to the next step." },
      { action: "return", label: "Request info", requires: "reason", consequence: "Returns it to the originator with your reason." },
      { action: "reject", label: "Reject", requires: "reason", danger: true, consequence: "Rejects the item. The reason is recorded and shown to the originator." },
    ];
  if (t.family === "alert") return [{ action: "approve", label: "Acknowledge", primary: true, consequence: "Marks the alert as handled." }];
  return [{ action: "approve", label: "Mark done", primary: true, consequence: "Completes the task in Frappe." }];
}

/** POST /approvals/{doctype}/{name}/act with reason + expected state (gap 02 A1, A11). */
export async function liveAct(t: InboxTask, action: string, input: ActInput): Promise<void> {
  try {
    await apiFetch(`/approvals/${encodeURIComponent(t.doctype)}/${encodeURIComponent(t.name)}/act`, {
      method: "POST",
      body: JSON.stringify({ action, confirm: true, reason: input.reason, expected_state: input.expected_state, idempotency_key: input.idempotency_key }),
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) throw new Error("Already handled by someone else. Reload the inbox.");
    throw e;
  }
}

/** POST /approvals/{doctype}/{name}/escalate — in the contract (R-A2). */
export async function liveEscalate(t: InboxTask, reason: string): Promise<void> {
  await apiFetch(`/approvals/${encodeURIComponent(t.doctype)}/${encodeURIComponent(t.name)}/escalate`, {
    method: "POST",
    body: JSON.stringify({ confirm: true, reason }),
  });
}

export function actorFrom(user: { full_name?: string; username?: string; roles?: string[] } | null | undefined): Actor {
  return { name: user?.full_name || user?.username || "Staff", roles: user?.roles ?? [] };
}
