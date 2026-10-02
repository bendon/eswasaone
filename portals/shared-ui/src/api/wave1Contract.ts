/**
 * Wave 1 contract shapes (F0b) — use until full openapi↔types regen.
 * Prefer these for S1/I1/I2/X1/I3 clients; do not invent parallel types.
 */

export type AllowedAction = {
  action: string;
  label: string;
  rule_id?: string | null;
  danger?: boolean;
  consequence?: string | null;
};

export type AuditPatchBody = {
  action: string;
  confirm: boolean;
  payload?: Record<string, unknown>;
};

export type BallotVoteBody = {
  vote: "approve" | "disapprove" | "abstain";
  comment?: string;
  confirm: boolean;
};

export type EstoreCartItem = { code: string; qty: number };
export type EstoreCart = {
  cart_id: string;
  items: EstoreCartItem[];
  count: number;
};

export type EstoreOrderStatus = {
  order_id: string;
  status: string;
  allowed_actions?: AllowedAction[];
  payment_ref?: string | null;
  momo_reference?: string | null;
  licence_id?: string | null;
};

export type FieldSummary = {
  next_audit?: { id: string; due_date?: string; title?: string } | null;
  schedule?: unknown[];
  leave_balance?: number | null;
  unread?: number;
  outbox_pending?: number;
};
