/**
 * Field Visit and Sample primitives (workflow map §3.12, §5.7; gap 08). The Field PWA only knows these
 * two records, so new visit types need no new screens.
 */
import type { TaskModule } from "../tasks/store";
import type { WfRecord } from "../workflow/types";

export type VisitType =
  | "cert_audit"
  | "factory_inspection"
  | "market_sampling"
  | "complaint_investigation"
  | "onsite_calibration"
  | "batch_inspection"
  | "import_inspection"
  | "legal_metrology";

export type VisitState =
  | "Planned"
  | "Assigned"
  | "Accepted"
  | "Confirmed"
  | "In Progress"
  | "Submitted"
  | "Returned"
  | "Closed"
  | "Aborted"
  | "Cancelled";

export type VisitBody = "checklist" | "findings" | "samples" | "calibration" | "notes";

export type VisitTypeConfig = {
  label: string;
  short: string;
  module: TaskModule;
  /** Roles that plan and assign the visit. */
  planners: string[];
  /** Roles that review the submitted report (≠ lead). */
  reviewers: string[];
  body: VisitBody[];
  /** The customer confirms the date (announced visit). */
  confirm: boolean;
  /** Mandate not yet confirmed by ESWASA (confirmation pack F4). */
  toConfirm?: boolean;
  checklist: string;
};

export type ChecklistItem = { id: string; section: string; question: string; answer?: "yes" | "no" | "na"; note?: string };

export type VisitFinding = { id: string; clause: string; severity: "major" | "minor" | "observation"; statement: string; photos: string[] };

export type VisitPhoto = { id: string; at: string; name: string; caption?: string; hash: string; url?: string };

export type VisitSignature = { role: "client" | "witness" | "lead" | "team"; name: string; title?: string; at: string };

export type CalPoint = {
  id: string;
  instrument: string;
  nominal: number;
  unit: string;
  as_found: number;
  as_left: number;
  tolerance: number;
  uncertainty: number;
};

export type VisitParentRef = { doctype: string; name: string; label: string; link?: string };

export type FieldVisit = WfRecord & {
  id: string;
  type: VisitType;
  state: VisitState;
  title: string;
  parent?: VisitParentRef;
  client: string;
  client_email: string;
  site: { name: string; address: string; contact: string; phone?: string; directions?: string; gps?: { lat: number; lng: number } };
  planned_date: string;
  duration_days: number;
  auditor_days?: number;
  lead?: string;
  team: string[];
  scope?: string;
  created_at: string;
  created_by: string;
  /** Downloaded at Confirmed; the checklist version is frozen from then on (F4). */
  pack?: { downloaded_at: string; summary: string; previous_ncs: string[]; open_samples: string[] };
  checklist_version: string;
  checklist: ChecklistItem[];
  checkin?: { at: string; lat: number; lng: number; accuracy: number; by: string };
  findings: VisitFinding[];
  notes: string;
  photos: VisitPhoto[];
  signatures: VisitSignature[];
  cal_points: CalPoint[];
  sample_ids: string[];
  abort?: { code: "refused_access" | "premises_closed" | "safety" | "other"; reason: string; at: string; evidence?: string };
  review?: { by: string; at: string; outcome: "closed" | "returned"; note?: string };
  reschedule_request?: { at: string; proposed: string; reason: string };
  customer_confirmed_at?: string;
  claim_ref?: string;
  /** Raised by the device when the server state moved on while it was offline. */
  conflict?: { at: string; detail: string; resolved?: boolean };
};

export type SampleState = "Collected" | "In Transit" | "Received" | "Testing" | "Result" | "Rejected";

export type CustodyEvent = { at: string; actor: string; action: string; note?: string; gps?: { lat: number; lng: number } };

export type Sample = {
  id: string;
  seal: string;
  visit_id: string;
  parent?: VisitParentRef;
  product: string;
  brand?: string;
  batch?: string;
  quantity: string;
  split: { test: number; retained: number; client: number };
  collected_by: string;
  collected_at: string;
  witness?: string;
  photo?: string;
  state: SampleState;
  custody: CustodyEvent[];
  holder: string;
  condition?: "ok" | "damaged" | "seal_broken" | "mismatch";
  test_request_id?: string;
  tests?: string;
  result?: "pass" | "fail";
  result_note?: string;
};
