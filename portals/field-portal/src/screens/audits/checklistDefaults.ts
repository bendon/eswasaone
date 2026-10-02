import type { ChecklistItem, NonConformity } from "./types";

/** Default ISO 9001 clause groups for Stage 2 field capture (stub). */
export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: "cl-4",
    title: "4. Context of the organisation",
    clauses: "4.1–4.4",
    verdict: "C",
  },
  {
    id: "cl-5",
    title: "5. Leadership",
    clauses: "5.1–5.3",
    verdict: "C",
  },
  {
    id: "cl-7",
    title: "7. Support (resources, competence)",
    clauses: "7.1–7.5",
    verdict: "NC",
  },
  {
    id: "cl-8",
    title: "8. Operation",
    clauses: "8.1–8.7",
    verdict: "C",
  },
  {
    id: "cl-9",
    title: "9. Performance evaluation",
    clauses: "9.1–9.3",
    verdict: "NA",
  },
];

export const DEFAULT_FINDINGS: NonConformity[] = [
  {
    id: "nc-seed-1",
    clause: "Clause 7.2 — Competence",
    severity: "major",
    note: "Training records for 2 lab operators not maintained; no evidence of competence evaluation.",
    evidenceSlots: 2,
  },
];
