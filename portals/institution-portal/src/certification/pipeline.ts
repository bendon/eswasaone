/**
 * Certification pipeline model, aligned with the backend workflow
 * (apps/eswasa_certification/workflow_map.py) and the three ESWASA flows
 * (management systems, product, Ingelo) plus combined.
 * Board data comes from GET /certification/applications.
 */

export type CertStage =
  | "application"
  | "assessment"
  | "scheduled"
  | "audit"
  | "nc"
  | "certified"
  | "surveillance"
  | "renewal"
  | "withdrawn";

export type CertFlow = "ms" | "product" | "ingelo" | "combined";

export type SlaKind = "breach" | "due" | "ok";

export type PipelineItem = {
  id: string;
  co: string;
  scheme: string;
  flow: CertFlow;
  stage: CertStage;
  aud: string;
  sla: SlaKind;
  slaText: string;
  applied: string;
  appliedIso?: string;
  auditDate?: string;
  cert?: string;
  nc?: number;
};

export const FLOW_LABEL: Record<CertFlow, string> = {
  ms: "Management system",
  product: "Product",
  ingelo: "Ingelo (MSME)",
  combined: "Combined",
};

export const STAGES: {
  key: CertStage;
  label: string;
  /** Canonical backend workflow_state. */
  state: string;
  color: string;
  chip: [string, string];
}[] = [
  { key: "application", label: "Submitted", state: "Application", color: "var(--blue)", chip: ["#E0F2FE", "#075985"] },
  { key: "assessment", label: "In review", state: "Assessment", color: "var(--indigo)", chip: ["#E8E7FB", "#3730A3"] },
  { key: "scheduled", label: "Audit scheduled", state: "Audit Scheduled", color: "var(--amber)", chip: ["#FEF3C7", "#92400E"] },
  { key: "audit", label: "Audit / testing", state: "Audit", color: "var(--orange)", chip: ["#FFEDD5", "#9A3412"] },
  { key: "nc", label: "NC resolution", state: "NC Resolution", color: "var(--red)", chip: ["#FDECEC", "#9F1239"] },
  { key: "certified", label: "Certified", state: "Certified", color: "var(--green)", chip: ["#DCFCE7", "#166534"] },
  { key: "surveillance", label: "Surveillance", state: "Surveillance", color: "var(--purple)", chip: ["#F0E9FB", "#5B21B6"] },
  { key: "renewal", label: "Renewal", state: "Renewal", color: "var(--slate)", chip: ["#EEF2F7", "#334155"] },
];

export const WITHDRAWN_CHIP: [string, string] = ["#EFF3F8", "#5A6B84"];

/** Backend action slugs (workflow_map.TRANSITIONS). */
export type CertAction =
  | "submit_for_assessment"
  | "schedule_audit"
  | "start_audit"
  | "raise_nc"
  | "clear_nc"
  | "certify"
  | "start_surveillance"
  | "start_renewal"
  | "reassess"
  | "withdraw";

export type NextStep = {
  label: string;
  ic: string;
  cls: "pri" | "gold" | "ghost";
  /** Backend transition, or a hand-off to another sub-view. */
  action?: CertAction;
  goto?: "decisions" | "findings" | "certificates" | "audits";
  to?: CertStage;
};

/** Primary next step per stage: the one button on each card. */
export const NEXT: Record<CertStage, NextStep | null> = {
  application: { label: "Confirm receipt & review", ic: "i-play", cls: "pri", action: "submit_for_assessment", to: "assessment" },
  assessment: { label: "Schedule audit", ic: "i-cal", cls: "pri", action: "schedule_audit", to: "scheduled" },
  scheduled: { label: "Start audit", ic: "i-clip", cls: "pri", action: "start_audit", to: "audit" },
  audit: { label: "Send to decision", ic: "i-scroll", cls: "gold", goto: "decisions" },
  nc: { label: "Review corrective actions", ic: "i-clip", cls: "pri", goto: "findings" },
  certified: { label: "Start surveillance", ic: "i-eye", cls: "pri", action: "start_surveillance", to: "surveillance" },
  surveillance: { label: "Start recertification", ic: "i-refresh", cls: "pri", action: "start_renewal", to: "renewal" },
  renewal: { label: "Reassess", ic: "i-play", cls: "pri", action: "reassess", to: "assessment" },
  withdrawn: null,
};

/** Secondary transitions shown in the drawer. */
export const SECONDARY: Partial<Record<CertStage, NextStep[]>> = {
  audit: [{ label: "Raise non-conformities", ic: "i-warn", cls: "ghost", action: "raise_nc", to: "nc" }],
  certified: [
    { label: "Start renewal", ic: "i-refresh", cls: "ghost", action: "start_renewal", to: "renewal" },
    { label: "Open certificate", ic: "i-award", cls: "ghost", goto: "certificates" },
  ],
  renewal: [{ label: "Schedule recertification audit", ic: "i-cal", cls: "ghost", action: "schedule_audit", to: "scheduled" }],
};

export function normalizeStage(status: string): CertStage {
  const s = status.toLowerCase();
  if (s.includes("withdraw")) return "withdrawn";
  if (s.includes("renew")) return "renewal";
  if (s.includes("surveil")) return "surveillance";
  if (s.includes("certified") || s === "certify") return "certified";
  if (s.includes("nc") || s.includes("corrective")) return "nc";
  if (s.includes("sched")) return "scheduled";
  if (s.includes("progress") || s === "audit") return "audit";
  if (s.includes("review") || s.includes("assess")) return "assessment";
  return "application";
}

export function flowForScheme(scheme: string): CertFlow {
  const s = scheme.toLowerCase();
  if (s.includes("ingelo")) return "ingelo";
  if (s.includes("combined") || s.includes("+")) return "combined";
  if (s.includes("product") || s.includes("mark") || s.includes("permit") || s.includes("sans 5")) return "product";
  return "ms";
}

/** Flow-specific sub-steps tracked under each backend state. */
export type SubStep = { key: string; label: string; stage: CertStage };

export const SUBSTEPS: Record<CertFlow, SubStep[]> = {
  ms: [
    { key: "receipt", label: "Receipt confirmed to client (≤5 working days)", stage: "application" },
    { key: "scope_review", label: "Scope, sites & IAF code reviewed; audit days set", stage: "assessment" },
    { key: "quote", label: "Quote accepted, contract signed", stage: "assessment" },
    { key: "payment", label: "Payment received", stage: "assessment" },
    { key: "team", label: "Audit team assigned (competence + impartiality)", stage: "scheduled" },
    { key: "stage1", label: "Stage 1 audit: documentation & readiness", stage: "audit" },
    { key: "stage2", label: "Stage 2 audit: implementation", stage: "audit" },
    { key: "report", label: "Audit report submitted", stage: "audit" },
    { key: "decision", label: "Independent certification decision", stage: "certified" },
    { key: "issued", label: "Certificate issued, register + QR updated", stage: "certified" },
  ],
  product: [
    { key: "receipt", label: "Receipt confirmed to client (≤5 working days)", stage: "application" },
    { key: "quote", label: "Quote accepted; assessment planned", stage: "assessment" },
    { key: "payment", label: "Payment received", stage: "assessment" },
    { key: "factory", label: "Initial assessment at factory/plant", stage: "audit" },
    { key: "sampling", label: "Samples drawn", stage: "audit" },
    { key: "lab", label: "Accredited laboratory results received", stage: "audit" },
    { key: "cac", label: "Submitted to Certification Approval Committee", stage: "audit" },
    { key: "permit", label: "Permit awarded (3 years)", stage: "certified" },
  ],
  ingelo: [
    { key: "eligibility", label: "Eligibility confirmed (Emaswati MSME, local production)", stage: "application" },
    { key: "receipt", label: "Receipt confirmed to client (≤5 working days)", stage: "application" },
    { key: "consultation", label: "Free consultation / gap-analysis workshop held", stage: "assessment" },
    { key: "assessment", label: "Certification assessment done", stage: "audit" },
    { key: "decision", label: "Certification decision", stage: "certified" },
    { key: "mark", label: "ESWASA Approved mark granted", stage: "certified" },
  ],
  combined: [
    { key: "receipt", label: "Receipt confirmed to client (≤5 working days)", stage: "application" },
    { key: "quote", label: "Quote accepted, contract signed, paid", stage: "assessment" },
    { key: "stage1", label: "Stage 1 audit", stage: "audit" },
    { key: "stage2", label: "Stage 2 audit + factory assessment", stage: "audit" },
    { key: "lab", label: "Sampling & laboratory results", stage: "audit" },
    { key: "cac", label: "CAC decision", stage: "certified" },
    { key: "issued", label: "Certificate + permit issued", stage: "certified" },
  ],
};

export const TIMELINE_STEPS: [string, string][] = [
  ["Submitted", "application received"],
  ["In review", "scope, quote & contract"],
  ["Audit scheduled", "team assigned"],
  ["Audit / testing", "stage 1 + 2 · factory · lab"],
  ["NC resolution", "findings & corrective actions"],
  ["Certified", "decision, certificate, register, QR"],
  ["Surveillance", "2 surveillance audits"],
  ["Renewal", "recertification"],
];

/** Service Charter (working days). */
export const CHARTER = { quoteDays: 5, receiptDays: 5, auditScheduleDays: 30, complaintDays: 30, appealDays: 90 };

export function workingDaysSince(iso?: string): number | null {
  if (!iso) return null;
  const from = new Date(iso);
  if (Number.isNaN(from.getTime())) return null;
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  let n = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) n += 1;
  }
  return n;
}

/** SLA from the Service Charter, using the applied date. */
export function slaFor(stage: CertStage, appliedIso?: string): { sla: SlaKind; text: string } {
  const wd = workingDaysSince(appliedIso);
  if (stage === "certified") return { sla: "ok", text: "certified" };
  if (stage === "withdrawn") return { sla: "ok", text: "withdrawn" };
  if (wd === null) return { sla: "due", text: stage === "surveillance" ? "surveillance due" : "pending" };
  if (stage === "application") {
    const left = CHARTER.receiptDays - wd;
    if (left < 0) return { sla: "breach", text: `receipt ${-left}wd late` };
    return { sla: left <= 1 ? "due" : "ok", text: `receipt in ${left}wd` };
  }
  if (stage === "assessment") {
    const left = CHARTER.auditScheduleDays - wd;
    if (left < 0) return { sla: "breach", text: `scheduling ${-left}wd late` };
    return { sla: left <= 5 ? "due" : "ok", text: `schedule in ${left}wd` };
  }
  return { sla: "ok", text: `${wd}wd open` };
}

export function auditorInitials(aud: string): string {
  if (aud === "Unassigned") return "—";
  const parts = aud.replace(/\./g, "").split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
