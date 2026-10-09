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

export type EvidencePhoto = { key: string; name: string; url: string };

export type NonConformity = {
  id: string;
  clause: string;
  severity: NcSeverity;
  /** Statement of non-conformity. */
  note: string;
  /** Objective evidence observed. */
  evidence?: string;
  /** Legacy placeholder count (kept for drafts saved before photo upload). */
  evidenceSlots: number;
  photos?: EvidencePhoto[];
};

/** Product audits — samples drawn and sealed on site for accredited lab testing. */
export type SampleRecord = {
  id: string;
  product: string;
  batch: string;
  qty: string;
  sealNo: string;
  lab: string;
  drawnAt: string;
};

/** Which checklist template applies. */
export type AuditKind = "stage1" | "stage2" | "surveillance" | "product";

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
  /** True after submit confirmation — either synced or queued for sync. */
  locallySubmitted?: boolean;
  /** Sync state of a submitted draft: queued (offline / server refused) or synced. */
  syncState?: "queued" | "synced";
  /** Stable Idempotency-Key minted at first submit so retries never double-submit. */
  submitKey?: string;
  /** Checklist template used — lets a draft survive scheme metadata changes. */
  kind?: AuditKind;
  samples?: SampleRecord[];
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
