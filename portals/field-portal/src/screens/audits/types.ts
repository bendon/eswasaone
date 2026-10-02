import type { components } from "@eswasaone/shared-ui";

/** Contract schema from OpenAPI / shared-ui generated types. */
export type AuditSummary = components["schemas"]["AuditSummary"];

export type CertificationAuditsResponse = { items: AuditSummary[] };

/** Checklist verdict — local until contract carries checklist payloads. */
export type ChecklistVerdict = "C" | "NC" | "NA" | null;

export type ChecklistItem = {
  id: string;
  title: string;
  clauses: string;
  verdict: ChecklistVerdict;
};

export type NcSeverity = "major" | "minor" | "obs";

export type NonConformity = {
  id: string;
  clause: string;
  severity: NcSeverity;
  note: string;
  evidenceSlots: number;
};

export type SignOffState = {
  auditorSigned: boolean;
  auditorName: string;
  auditeeSigned: boolean;
  auditeeName: string;
};

/** Offline draft persisted to localStorage — syncs when submit API exists. */
export type AuditDraft = {
  auditId: string;
  checklist: ChecklistItem[];
  findings: NonConformity[];
  signOff: SignOffState;
  updatedAt: string;
  /** True after local submit confirmation (queued until PATCH exists). */
  locallySubmitted?: boolean;
};

/**
 * Display enrichment for list/detail. Contract AuditSummary has no company /
 * location — stub fields until Core extends the schema.
 */
export type FieldAuditRow = AuditSummary & {
  company?: string;
  location?: string;
  time_label?: string;
  stage?: string;
};

export type AuditSegment = "today" | "upcoming" | "submitted";
