/**
 * Certification types — workflow map §3.1 (Application, Certification register, Nonconformity),
 * §5.6 (allocation and separation of duties). Shared by Service, Institution and Field.
 */
import type { WfRecord } from "../workflow/types";

export type CertFlowKind = "ms" | "product" | "ingelo" | "combined";

export type AppState =
  | "Submitted"
  | "Document Review"
  | "Awaiting Customer"
  | "Quoted"
  | "Audit Planned"
  | "Audit in Progress"
  | "NC Resolution"
  | "Technical Review"
  | "Decision"
  | "Certified"
  | "Rejected"
  | "Withdrawn";

export type DocStatus = "missing" | "received" | "acceptable" | "rejected";

export type AppDoc = {
  key: string;
  label: string;
  required: boolean;
  status: DocStatus;
  comment?: string;
  versions: { name: string; at: string; by: string }[];
};

export type InfoRequest = {
  id: string;
  at: string;
  by: string;
  items: { key: string; label: string; note?: string }[];
  message: string;
  due: string;
  responded_at?: string;
  response?: string;
};

export type FeeLine = { label: string; qty: number; unit_price: number };

export type CertQuote = {
  id: string;
  lines: FeeLine[];
  auditor_days: number;
  valid_until: string;
  issued_at: string;
  issued_by: string;
  deposit_pct: number;
  accepted_at?: string;
  agreement?: { name: string; title: string; at: string };
  invoice_id?: string;
  declined?: { at: string; reason: string };
};

export type AuditStage = { id: string; label: string; date: string; days: number; visit_id?: string };

export type NcState = "Raised" | "Response submitted" | "Accepted" | "Verified closed";

export type Nonconformity = {
  id: string;
  clause: string;
  severity: "major" | "minor" | "observation";
  statement: string;
  raised_at: string;
  raised_by: string;
  visit_id?: string;
  due: string;
  state: NcState;
  response?: { root_cause: string; correction: string; corrective_action: string; evidence: string[]; at: string; by: string };
  review?: { by: string; at: string; accepted: boolean; note: string };
  verified?: { by: string; at: string; note?: string };
  rejections: number;
};

export type TechReview = {
  by: string;
  at: string;
  checklist: { id: string; q: string; ok: boolean; note?: string }[];
  recommendation: "grant" | "refuse" | "more_info";
  justification: string;
};

export type CertDecision = {
  by: string;
  at: string;
  outcome: "grant" | "grant_conditions" | "refuse";
  body: "Certification Manager" | "Certification Approval Committee";
  note: string;
  conditions?: string;
  appeal_until?: string;
};

export type CertApplication = WfRecord & {
  id: string;
  state: AppState;
  flow: CertFlowKind;
  scheme: string;
  standard: string;
  org: string;
  client_id?: string;
  contact: string;
  customer_email: string;
  phone?: string;
  sites: { name: string; address: string; employees: number }[];
  employees: number;
  scope: string;
  channel: "portal" | "desk" | "email" | "renewal" | "transfer";
  created_at: string;
  officer?: string;
  documents: AppDoc[];
  info_requests: InfoRequest[];
  quote?: CertQuote;
  stages: AuditStage[];
  plan_sent_at?: string;
  findings: Nonconformity[];
  sample_ids: string[];
  technical_review?: TechReview;
  decision?: CertDecision;
  certificate_id?: string;
  renewal_of?: string;
  transfer_from?: { body: string; certificate: string; expires: string };
  /** Customer chases sent while paused (D+7, D+14) and stale flag (D+21) — §5.5. */
  chases?: { at: string; day: number }[];
};

export type RegState = "Active" | "Surveillance Due" | "Suspended" | "Withdrawn" | "Expired";

export type CertificateRec = WfRecord & {
  id: string;
  number: string;
  state: RegState;
  application_id: string;
  org: string;
  client_id?: string;
  customer_email: string;
  scheme: string;
  standard: string;
  scope: string;
  sites: string[];
  conditions?: string;
  issued_at: string;
  expires_at: string;
  cycle: { id: string; label: string; due: string; visit_id?: string; done_at?: string }[];
  token: string;
  scope_history: { at: string; by: string; from: string; to: string; reason: string }[];
};

export type MarkRequest = WfRecord & {
  id: string;
  state: "Submitted" | "Approved" | "Returned" | "Rejected";
  certificate_id: string;
  org: string;
  customer_email: string;
  usage: "packaging" | "advertising" | "website" | "vehicle" | "other";
  description: string;
  artwork: string;
  artwork_url?: string;
  submitted_at: string;
  comments?: string;
};

export type Competence = {
  name: string;
  role: "lead" | "auditor" | "technical_expert" | "trainee";
  schemes: string[];
  areas: string[];
  qualified_until: string;
  declaration_until?: string;
  /** Impartiality: consultancy / employment / family relationships. */
  relationships: { org: string; kind: string; until: string }[];
  /** Rotation: certification cycles led per client. */
  cycles: { org: string; count: number }[];
};

export type SchemeDef = {
  code: string;
  title: string;
  standard: string;
  flow: CertFlowKind;
  required_docs: { key: string; label: string }[];
  /** Decision taken by the CAC rather than the Certification Manager. */
  cac: boolean;
};

export type CertSettings = {
  day_rate: number;
  application_fee: number;
  certificate_fee: number;
  lab_fee: number;
  deposit_pct: number;
  nc_days: number;
  appeal_days: number;
  surveillance_lead_days: number;
  rotation_cycles: number;
  quote_valid_days: number;
  sla_document_review: number;
  sla_technical_review: number;
  sla_decision: number;
  /** auditor-days by employees (IAF MD5-style; to confirm). */
  fee_table: { max: number; days: number }[];
  schemes: SchemeDef[];
};
