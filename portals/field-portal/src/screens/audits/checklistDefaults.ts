import type { AuditKind, ChecklistItem, FieldAuditRow, NonConformity } from "./types";

const item = (id: string, title: string, clauses: string): ChecklistItem => ({ id, title, clauses, verdict: null });

/** Stage 1 — documentation & site readiness (ISO/IEC 17021-1 §9.3.1.2). */
const STAGE1: ChecklistItem[] = [
  item("s1-scope", "Scope & sites confirmed", "Scope statement, sites, shifts, headcount"),
  item("s1-docs", "Documented information", "Policy, objectives, required procedures & records"),
  item("s1-legal", "Legal & regulatory requirements", "Register of applicable requirements"),
  item("s1-ia", "Internal audit completed", "At least one full cycle"),
  item("s1-mr", "Management review held", "Minutes with inputs/outputs"),
  item("s1-ready", "Ready for Stage 2", "Resources, dates and plan agreed"),
];

const ISO9001: ChecklistItem[] = [
  item("cl-4", "4. Context of the organisation", "4.1–4.4"),
  item("cl-5", "5. Leadership", "5.1–5.3"),
  item("cl-6", "6. Planning", "6.1–6.3"),
  item("cl-7", "7. Support (resources, competence)", "7.1–7.5"),
  item("cl-8", "8. Operation", "8.1–8.7"),
  item("cl-9", "9. Performance evaluation", "9.1–9.3"),
  item("cl-10", "10. Improvement", "10.1–10.3"),
];

const ISO14001: ChecklistItem[] = [
  item("e-4", "4. Context & scope", "4.1–4.4"),
  item("e-6a", "6.1.2 Environmental aspects", "Significant aspects identified"),
  item("e-6b", "6.1.3 Compliance obligations", "Permits, licences"),
  item("e-8", "8.1 Operational control", "Waste, effluent, emissions"),
  item("e-8b", "8.2 Emergency preparedness", "Spill / fire drills"),
  item("e-9", "9.1.2 Evaluation of compliance", "Records"),
];

const ISO22000: ChecklistItem[] = [
  item("f-prp", "8.2 Prerequisite programmes", "Hygiene, pest, cleaning"),
  item("f-haz", "8.5.2 Hazard analysis", "Hazards & control measures"),
  item("f-ccp", "8.5.4 Hazard control plan", "CCP / OPRP limits & monitoring"),
  item("f-trace", "8.3 Traceability", "One up / one down"),
  item("f-recall", "8.4 Emergency & recall", "Mock recall"),
  item("f-ver", "8.8 Verification", "Results analysed"),
];

const HACCP: ChecklistItem[] = [
  item("h-prp", "Prerequisite programmes", "SANS 10049 basics"),
  item("h-team", "HACCP team & scope", "Principle 0"),
  item("h-ha", "Hazard analysis", "Principle 1"),
  item("h-ccp", "CCPs & critical limits", "Principles 2–3"),
  item("h-mon", "Monitoring & corrective action", "Principles 4–5"),
  item("h-ver", "Verification & records", "Principles 6–7"),
];

const ISO45001: ChecklistItem[] = [
  item("o-5", "5.4 Worker consultation & participation", ""),
  item("o-6", "6.1.2 Hazard identification & risk assessment", ""),
  item("o-8", "8.1 Operational control", "PPE, permits to work"),
  item("o-8b", "8.2 Emergency preparedness", ""),
  item("o-10", "10.2 Incident investigation", ""),
];

/** Product certification — initial factory assessment (ISO/IEC 17065 type 5 scheme). */
const PRODUCT: ChecklistItem[] = [
  item("p-fpc", "Factory production control", "Documented FPC procedures"),
  item("p-raw", "Incoming materials", "Specs & supplier checks"),
  item("p-inproc", "In-process & final inspection", "Test records vs. standard"),
  item("p-equip", "Test & measuring equipment", "Calibration certificates"),
  item("p-trace", "Traceability & batch coding", "Batch → raw materials"),
  item("p-mark", "Marking & labelling", "Mark use, product label"),
  item("p-nc", "Non-conforming product", "Segregation & disposal"),
];

/** Pick the checklist template for an audit from its stage + scheme. */
export function auditKindOf(a: FieldAuditRow): AuditKind {
  const stage = (a.stage || "").toLowerCase();
  const scheme = (a.scheme || "").toLowerCase();
  if (scheme.includes("product") || scheme.includes("mark") || scheme.includes("ingelo") || stage.includes("factory") || stage.includes("initial"))
    return "product";
  if (stage.includes("stage 1") || stage.includes("stage1")) return "stage1";
  if (stage.includes("surveil")) return "surveillance";
  return "stage2";
}

export function checklistFor(a: FieldAuditRow, kind = auditKindOf(a)): ChecklistItem[] {
  if (kind === "stage1") return STAGE1.map((c) => ({ ...c }));
  if (kind === "product") return PRODUCT.map((c) => ({ ...c }));
  const scheme = (a.scheme || "").toLowerCase();
  const base = scheme.includes("14001")
    ? ISO14001
    : scheme.includes("22000")
      ? ISO22000
      : scheme.includes("haccp") || scheme.includes("10330")
        ? HACCP
        : scheme.includes("45001")
          ? ISO45001
          : ISO9001;
  // Surveillance samples the core clauses, not the full standard.
  return (kind === "surveillance" ? base.filter((_, i) => i % 2 === 0) : base).map((c) => ({ ...c }));
}

export const KIND_LABEL: Record<AuditKind, string> = {
  stage1: "Stage 1 — documentation & readiness",
  stage2: "Stage 2 — implementation",
  surveillance: "Surveillance",
  product: "Factory assessment & sampling",
};

/** @deprecated kept for older drafts/tests — new drafts use checklistFor(). */
export const DEFAULT_CHECKLIST: ChecklistItem[] = ISO9001.map((c) => ({ ...c }));
export const DEFAULT_FINDINGS: NonConformity[] = [];

export const LABS = [
  "ESWASA Chemistry Lab",
  "ESWASA Microbiology Lab",
  "ESWASA Textiles Lab",
  "ESWASA Civil & Mechanical Lab",
  "ESWASA Electrical Lab",
];
