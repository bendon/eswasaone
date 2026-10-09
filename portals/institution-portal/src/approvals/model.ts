/**
 * Inbox data: local task store (demo / modules without Core yet) merged with live Core approvals.
 * Domain handlers are registered by importing their modules (CRM, governance).
 */
import { useMemo } from "react";
import { useApiResource } from "../hooks/useApiResource";
import "@eswasaone/shared-ui/crm";
import "@eswasaone/shared-ui/governance";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import {
  listTasks,
  taskHandler,
  taskSla,
  taskStore,
  type TaskPreview,
  type TaskQueue,
} from "@eswasaone/shared-ui/tasks";
import { govStore } from "@eswasaone/shared-ui/governance";
import type { ActInput, ActionOption, Actor } from "@eswasaone/shared-ui/workflow";
import type { ApprovalsResponse } from "../api/types";
import { liveAct, liveActions, liveToTask, type InboxTask } from "./live";

export type { InboxTask };

export type Handler = {
  actions: (actor: Actor) => ActionOption[];
  act: (action: string, actor: Actor, input: ActInput) => Promise<void>;
  preview: (actor: Actor) => TaskPreview | null;
  currentState: () => string | null;
};

export function handlerFor(t: InboxTask): Handler {
  if (t.live) {
    return {
      actions: () => liveActions(t),
      act: (action, _actor, input) => liveAct(t, action, input),
      preview: () => ({ facts: Object.entries(t.facts ?? {}).map(([label, value]) => ({ label, value })), history: [] }),
      currentState: () => t.state,
    };
  }
  const h = taskHandler(t.doctype);
  return {
    actions: (actor) => (t.closed_at ? [] : h.actions(t, actor)),
    act: (action, actor, input) => h.act(t, action, actor, input),
    preview: (actor) => h.preview(t, actor),
    currentState: () => h.currentState(t),
  };
}

/** The record moved on but the task is still open → show "already handled" (gap 02 A11). */
export function conflictOf(t: InboxTask): string | null {
  if (t.live || t.closed_at) return null;
  const cur = handlerFor(t).currentState();
  if (cur === null || cur === t.state || cur.startsWith("closed:")) return null;
  if (t.state.endsWith("(escalated)") || t.doctype === "Board Pack Section" || t.doctype === "Risk Appetite Breach") return null;
  return `This record is now "${cur}". It was handled elsewhere — refresh to clear.`;
}

export function useInbox(actor: Actor, queue: TaskQueue, enabledLive: boolean, refreshKey: string) {
  const live = useApiResource<ApprovalsResponse>("/approvals?limit=100", { enabled: enabledLive, refreshKey });
  const local = useStoreResource([taskStore, govStore], () => listTasks(actor, { queue }), [actor.name, actor.roles.join("|"), queue]);
  const tasks = useMemo<InboxTask[]>(() => {
    const liveRows = queue === "done" ? [] : (live.data?.items ?? []).map(liveToTask);
    return [...(local.data ?? []), ...liveRows];
  }, [local.data, live.data, queue]);
  return {
    tasks,
    loading: local.loading && !local.data,
    error: local.error,
    liveError: live.error,
    liveCount: live.data?.items?.length ?? 0,
    reload: () => {
      local.reload();
      live.reload();
    },
  };
}

export function slaOf(t: InboxTask) {
  return taskSla(t);
}

export const FAMILY_LABEL: Record<InboxTask["family"], string> = { approve: "Approvals", do: "Tasks", alert: "Alerts" };
