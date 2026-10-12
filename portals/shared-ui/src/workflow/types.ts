/**
 * Workflow definitions — hand-written from docs/EswasaOne_WORKFLOW_MAP.md until the registry
 * generator exists (gap 01 C3). Core will return allowed_actions[] from Frappe; these mirror it.
 */

export type Tone = "navy" | "amber" | "green" | "red" | "slate" | "purple" | "gold";

export type Actor = {
  name: string;
  roles: string[];
  /** Set when a delegate acts for an absent manager (L7). */
  on_behalf_of?: string;
};

export type TaskFamily = "approve" | "do" | "alert";

/** Task the system opens when a record enters a state (L1/L3). */
export type StateTask<R = any> = {
  family: TaskFamily;
  verb?: string;
  /** Role pool the task lands on until someone claims it. */
  role: string;
  /** Named assignee (planner/scheme manager choice), if any. */
  assignee?: (r: R) => string | undefined;
  title: (r: R) => string;
  sla_days: number;
  rule?: string;
};

export type StateDef<R = any> = {
  id: string;
  label: string;
  tone: Tone;
  /** SLA clock paused while in this state (Awaiting Customer…). */
  paused?: boolean;
  /** Gate artefact state — docstatus 1, can only be superseded. */
  gate?: boolean;
  terminal?: boolean;
  /** Customer / member wording (registry display.customer). */
  display?: { customer?: string; member?: string };
  task?: StateTask<R>;
};

export type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
};

export type Guard<R = any> =
  /** Separation of duties: the actor must not be anyone recorded against these steps. */
  | { kind: "not_actor_of"; steps: string[]; message: string }
  /** Free-form check — return a reason string to block, or null. */
  | { kind: "check"; test: (r: R, actor: Actor) => string | null };

export type Transition<R = any> = {
  action: string;
  label: string;
  from: string[] | "*";
  to: string;
  /** Roles allowed; "any_staff" = any signed-in staff user. */
  roles: string[] | "any_staff" | "customer" | "member" | "system";
  requires?: "reason" | "note" | "payload";
  fields?: FieldSpec[];
  danger?: boolean;
  primary?: boolean;
  consequence: string;
  rule?: string;
  guards?: Guard<R>[];
  /** Duty this transition records the actor against (for later SoD guards). */
  records?: string;
  /** Who gets a message, for the preview in the confirm dialog. */
  notifies?: "customer" | "member" | "owner";
};

export type WorkflowDef<R = any> = {
  doctype: string;
  label: string;
  module: string;
  states: StateDef<R>[];
  transitions: Transition<R>[];
};

/** What the Act model needs on any record (§1.2 invariant 1). */
export type WfRecord = {
  state: string;
  seq: number;
  history: HistoryEvent[];
  /** step → people who performed it (for SoD guards, C8). */
  duties?: Record<string, string[]>;
};

export type HistoryEvent = {
  at: string;
  actor: string;
  action: string;
  from?: string;
  to?: string;
  reason?: string;
  note?: string;
  rule?: string;
  on_behalf_of?: string;
  /** Field changes (C7). */
  changes?: { field: string; from?: string; to?: string }[];
};

export type ActionOption = {
  action: string;
  label: string;
  to?: string;
  requires?: "reason" | "note" | "payload";
  fields?: FieldSpec[];
  danger?: boolean;
  primary?: boolean;
  consequence?: string;
  rule?: string;
  notifies?: Transition["notifies"];
  /** Set when the action is legal for the state but this actor may not take it (SoD). */
  disabledReason?: string;
};

export type ActInput = {
  expected_state: string;
  reason?: string;
  note?: string;
  payload?: Record<string, string>;
  idempotency_key?: string;
};
