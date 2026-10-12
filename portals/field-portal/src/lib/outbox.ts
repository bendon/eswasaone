/**
 * Field outbox (gap 08 F1, F6): every write from the device is queued with its status — pending, sent,
 * failed or conflict — and sent when the device is online. A conflict (the record moved on while the
 * officer was offline) is flagged on the visit for the supervisor; nothing fails silently.
 * "Work offline" lets demos show the queue without pulling the network cable.
 * TODO: wire real — IndexedDB persistence and PATCH /field/visits/{id}/captures with Idempotency-Key.
 */
import {
  actOnVisit,
  addSignature,
  addVisitFinding,
  addVisitPhoto,
  checkIn,
  collectSample,
  flagConflict,
  handOverSample,
  saveCalPoints,
  saveChecklist,
  saveVisitNotes,
  type CalPoint,
  type ChecklistItem,
  type VisitFinding,
  type VisitSignature,
} from "@eswasaone/shared-ui/field";
import { createLocalStore, nowIso, uid } from "@eswasaone/shared-ui/store";
import type { ActInput, Actor } from "@eswasaone/shared-ui/workflow";

export type OutboxOp =
  | { kind: "act"; visit: string; action: string; input: ActInput }
  | { kind: "checkin"; visit: string; gps: { lat: number; lng: number; accuracy: number } }
  | { kind: "checklist"; visit: string; items: ChecklistItem[] }
  | { kind: "finding"; visit: string; finding: Omit<VisitFinding, "id"> }
  | { kind: "photo"; visit: string; name: string; caption?: string; url?: string }
  | { kind: "notes"; visit: string; notes: string }
  | { kind: "signature"; visit: string; sig: Omit<VisitSignature, "at"> }
  | { kind: "cal"; visit: string; points: CalPoint[] }
  | { kind: "sample"; visit: string; sample: Parameters<typeof collectSample>[1] }
  | { kind: "handover"; seal: string; to: string };

export type OutboxItem = {
  key: string;
  label: string;
  op: OutboxOp;
  actor: Actor;
  status: "pending" | "sent" | "failed" | "conflict";
  attempts: number;
  at: string;
  sent_at?: string;
  error?: string;
};

type OutboxState = { v: 1; offline: boolean; items: OutboxItem[] };

export const outbox = createLocalStore<OutboxState>({ key: "eswasaone.field.outbox.v1", v: 1, seed: () => ({ v: 1, offline: false, items: [] }) });

export function isOffline(): boolean {
  return outbox.read().offline || (typeof navigator !== "undefined" && !navigator.onLine);
}

export function setSimulatedOffline(off: boolean): void {
  outbox.mutate((s) => {
    s.offline = off;
  });
  if (!off) void flush();
}

async function run(op: OutboxOp, actor: Actor): Promise<void> {
  switch (op.kind) {
    case "act":
      await actOnVisit(op.visit, op.action, actor, op.input);
      return;
    case "checkin":
      await checkIn(op.visit, op.gps, actor);
      return;
    case "checklist":
      saveChecklist(op.visit, op.items, actor);
      return;
    case "finding":
      addVisitFinding(op.visit, op.finding, actor);
      return;
    case "photo":
      addVisitPhoto(op.visit, { name: op.name, caption: op.caption, url: op.url }, actor);
      return;
    case "notes":
      saveVisitNotes(op.visit, op.notes, actor);
      return;
    case "signature":
      addSignature(op.visit, op.sig, actor);
      return;
    case "cal":
      saveCalPoints(op.visit, op.points, actor);
      return;
    case "sample":
      collectSample(op.visit, op.sample, actor);
      return;
    case "handover":
      handOverSample(op.seal, actor, op.to);
      return;
  }
}

function isConflict(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /StaleState|changed while|can't change the report while|isn't allowed while/i.test(m);
}

let flushing = false;
export async function flush(): Promise<void> {
  if (flushing || isOffline()) return;
  flushing = true;
  try {
    const pending = outbox.read().items.filter((i) => i.status === "pending");
    for (const it of pending) {
      let status: OutboxItem["status"] = "sent";
      let error: string | undefined;
      try {
        await run(it.op, it.actor);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        if (isConflict(e)) {
          status = "conflict";
          if ("visit" in it.op) {
            try {
              flagConflict(it.op.visit, `${it.label}: ${error}`);
            } catch {
              /* ignore */
            }
          }
        } else status = "failed";
      }
      outbox.mutate((s) => {
        const x = s.items.find((y) => y.key === it.key);
        if (!x) return;
        x.status = status;
        x.error = error;
        x.attempts += 1;
        if (status === "sent") x.sent_at = nowIso();
      });
      // Later writes depend on this one (e.g. submit after checklist) — stop at the first problem.
      if (status !== "sent") break;
    }
  } finally {
    flushing = false;
  }
}

/** Queue a write and try to send it at once. Resolves with the item's final status for this attempt. */
export async function enqueue(label: string, op: OutboxOp, actor: Actor): Promise<OutboxItem> {
  const item: OutboxItem = { key: uid("OB"), label, op, actor, status: "pending", attempts: 0, at: nowIso() };
  outbox.mutate((s) => {
    s.items.unshift(item);
    s.items = s.items.slice(0, 200);
  });
  await flush();
  return outbox.view((s) => s.items.find((x) => x.key === item.key)!);
}

export function retry(key: string): Promise<void> {
  outbox.mutate((s) => {
    const x = s.items.find((y) => y.key === key);
    if (x && (x.status === "failed" || x.status === "conflict")) {
      x.status = "pending";
      x.error = undefined;
    }
  });
  return flush();
}

export function discard(key: string): void {
  outbox.mutate((s) => {
    s.items = s.items.filter((x) => x.key !== key);
  });
}

export function clearSent(): void {
  outbox.mutate((s) => {
    s.items = s.items.filter((x) => x.status !== "sent");
  });
}

export function outboxSummary(): { pending: number; failed: number; conflict: number; label: string } {
  const items = outbox.read().items;
  const pending = items.filter((i) => i.status === "pending").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const conflict = items.filter((i) => i.status === "conflict").length;
  const off = isOffline();
  const label = conflict ? `${conflict} conflict${conflict > 1 ? "s" : ""} — needs attention` : failed ? `${failed} failed · ${pending} pending` : pending ? `${pending} waiting to send${off ? " (offline)" : ""}` : off ? "Offline · nothing waiting" : "All synced";
  return { pending, failed, conflict, label };
}

if (typeof window !== "undefined") window.addEventListener("online", () => void flush());
