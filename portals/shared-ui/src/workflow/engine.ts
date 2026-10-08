/**
 * The one transition model (workflow map §1.2, §5.2): allowed actions are computed, reasons are
 * enforced, and expected_state protects against acting on a record that moved on.
 * Pure functions — the domain stores call `applyTransition` inside their `mutate`.
 */
import type { ActInput, ActionOption, Actor, HistoryEvent, StateDef, Transition, WfRecord, WorkflowDef } from "./types";

/** Invariant 4: reason is mandatory on these, whatever a definition says. */
const REASON_VERBS = /^(reject|return|reassign|suspend|withdraw|cancel|override|refuse|lapse|defer)/;

export const SUPER_ROLES = ["System Manager", "Administrator"];

export class StaleStateError extends Error {
  constructor(public current: string, public by?: string, public at?: string) {
    super("This record changed while you were looking at it. Reload.");
    this.name = "StaleStateError";
  }
}

export class ReasonRequiredError extends Error {
  constructor(what = "A reason") {
    super(`${what} is required for this action.`);
    this.name = "ReasonRequiredError";
  }
}

export class TransitionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionNotAllowedError";
  }
}

export function needsReason(t: Pick<Transition, "action" | "requires">): boolean {
  return t.requires === "reason" || REASON_VERBS.test(t.action);
}

export function stateDef<R>(def: WorkflowDef<R>, state: string): StateDef<R> | undefined {
  return def.states.find((s) => s.id === state);
}

function roleOk(t: Transition, actor: Actor): boolean {
  if (t.roles === "system") return false;
  if (t.roles === "customer") return actor.roles.includes("Customer") || actor.roles.includes("Portal Customer");
  if (t.roles === "member") return actor.roles.includes("Eswasa Board Member");
  if (actor.roles.some((r) => SUPER_ROLES.includes(r))) return true;
  if (t.roles === "any_staff") return actor.roles.length > 0;
  return actor.roles.some((r) => (t.roles as string[]).includes(r));
}

function guardBlock<R extends WfRecord>(t: Transition<R>, rec: R, actor: Actor): string | undefined {
  for (const g of t.guards ?? []) {
    if (g.kind === "not_actor_of") {
      const people = new Set(g.steps.flatMap((s) => rec.duties?.[s] ?? []));
      if (people.has(actor.name) || (actor.on_behalf_of && people.has(actor.on_behalf_of))) return g.message;
    } else {
      const msg = g.test(rec, actor);
      if (msg) return msg;
    }
  }
  return undefined;
}

function fromOk(t: Transition, state: string): boolean {
  return t.from === "*" || t.from.includes(state);
}

/**
 * Legal next steps for this actor. Actions blocked only by a separation-of-duties guard are
 * returned with `disabledReason`, so the UI can say why ("You recorded these results…").
 */
export function allowedActions<R extends WfRecord>(def: WorkflowDef<R>, rec: R, actor: Actor): ActionOption[] {
  const out: ActionOption[] = [];
  for (const t of def.transitions) {
    if (!fromOk(t, rec.state) || !roleOk(t, actor)) continue;
    out.push({
      action: t.action,
      label: t.label,
      to: t.to,
      requires: needsReason(t) ? "reason" : t.requires,
      fields: t.fields,
      danger: t.danger,
      primary: t.primary,
      consequence: t.consequence,
      rule: t.rule,
      notifies: t.notifies,
      disabledReason: guardBlock(t, rec, actor),
    });
  }
  return out;
}

export function findTransition<R>(def: WorkflowDef<R>, action: string, state: string): Transition<R> | undefined {
  return def.transitions.find((t) => t.action === action && fromOk(t, state));
}

/**
 * Apply a transition in place (call inside the store's `mutate`).
 * Enforces: expected_state (L-stale), role, guards, reason and required fields.
 */
export function applyTransition<R extends WfRecord>(
  def: WorkflowDef<R>,
  rec: R,
  action: string,
  actor: Actor,
  input: ActInput,
): { from: string; to: string; transition: Transition<R>; event: HistoryEvent } {
  if (input.expected_state !== rec.state) {
    const last = rec.history[rec.history.length - 1];
    throw new StaleStateError(rec.state, last?.actor, last?.at);
  }
  const t = findTransition(def, action, rec.state);
  if (!t) throw new TransitionNotAllowedError(`"${action}" isn't allowed while this ${def.label.toLowerCase()} is ${rec.state}.`);
  if (!roleOk(t, actor)) throw new TransitionNotAllowedError(`Your role can't "${t.label}" a ${def.label.toLowerCase()}.`);
  const blocked = guardBlock(t, rec, actor);
  if (blocked) throw new TransitionNotAllowedError(blocked);
  if (needsReason(t) && !input.reason?.trim()) throw new ReasonRequiredError();
  if (t.requires === "note" && !input.note?.trim() && !input.reason?.trim()) throw new ReasonRequiredError("A note");
  for (const f of t.fields ?? []) {
    if (f.required && !input.payload?.[f.key]?.trim()) throw new ReasonRequiredError(f.label);
  }

  const from = rec.state;
  const event: HistoryEvent = {
    at: new Date().toISOString(),
    actor: actor.name,
    action: t.label,
    from,
    to: t.to,
    reason: input.reason?.trim() || undefined,
    note: input.note?.trim() || undefined,
    rule: t.rule,
    on_behalf_of: actor.on_behalf_of,
  };
  rec.state = t.to;
  rec.seq = (rec.seq ?? 0) + 1;
  rec.history.push(event);
  if (t.records) {
    rec.duties ??= {};
    const list = (rec.duties[t.records] ??= []);
    if (!list.includes(actor.name)) list.push(actor.name);
  }
  return { from, to: t.to, transition: t, event };
}

/** Customer / member wording for a state (gap 01 C9). Staff see the state id. */
export function displayState<R>(def: WorkflowDef<R>, state: string, audience: "staff" | "customer" | "member" = "staff"): string {
  const s = stateDef(def, state);
  if (!s) return state;
  if (audience === "customer") return s.display?.customer ?? s.label;
  if (audience === "member") return s.display?.member ?? s.display?.customer ?? s.label;
  return s.label;
}

export function stateTone<R>(def: WorkflowDef<R>, state: string) {
  return stateDef(def, state)?.tone ?? "slate";
}

/** Short "who did what" list for the independence panel (C8). */
export function dutyList(rec: Pick<WfRecord, "duties">): { step: string; people: string[] }[] {
  return Object.entries(rec.duties ?? {}).map(([step, people]) => ({ step, people }));
}
