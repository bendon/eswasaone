/**
 * Certification pipeline UI constants — stages, actions, timeline labels.
 * Board data comes from GET /certification/applications only.
 */

export type CertStage =
  | "submitted"
  | "review"
  | "scheduled"
  | "nc"
  | "certified"
  | "surveillance";

export type SlaKind = "breach" | "due" | "ok";

export type PipelineItem = {
  id: string;
  co: string;
  scheme: string;
  stage: CertStage;
  aud: string;
  sla: SlaKind;
  slaText: string;
  applied: string;
  auditDate?: string;
  cert?: string;
  nc?: number;
};

export const STAGES: {
  key: CertStage;
  label: string;
  color: string;
  chip: [string, string];
}[] = [
  { key: "submitted", label: "Submitted", color: "var(--blue)", chip: ["#E0F2FE", "#075985"] },
  { key: "review", label: "In Review", color: "var(--indigo)", chip: ["#E8E7FB", "#3730A3"] },
  { key: "scheduled", label: "Audit Scheduled", color: "var(--amber)", chip: ["#FEF3C7", "#92400E"] },
  { key: "nc", label: "NC / Corrective", color: "var(--red)", chip: ["#FDECEC", "#9F1239"] },
  { key: "certified", label: "Certified", color: "var(--green)", chip: ["#DCFCE7", "#166534"] },
  { key: "surveillance", label: "Surveillance", color: "var(--purple)", chip: ["#F0E9FB", "#5B21B6"] },
];

export const NEXT: Record<
  CertStage,
  { label: string; to: CertStage | null; ic: string; cls: string }
> = {
  submitted: { label: "Start review", to: "review", ic: "i-play", cls: "pri" },
  review: { label: "Schedule audit", to: "scheduled", ic: "i-cal", cls: "pri" },
  scheduled: { label: "Record outcome", to: "certified", ic: "i-clip", cls: "pri" },
  nc: { label: "Review corrective action", to: "certified", ic: "i-clip", cls: "pri" },
  certified: { label: "View certificate", to: null, ic: "i-eye", cls: "gold" },
  surveillance: { label: "Record surveillance", to: "certified", ic: "i-clip", cls: "pri" },
};

export const TIMELINE_STEPS: [string, string][] = [
  ["Submitted", "application received"],
  ["In Review", "readiness assessment"],
  ["Audit Scheduled", "stage 1 + 2 audit"],
  ["NC / Corrective", "findings & corrective actions"],
  ["Certified", "certificate + register + QR"],
  ["Surveillance", "annual"],
];

export function auditorInitials(aud: string): string {
  if (aud === "Unassigned") return "—";
  const parts = aud.replace(/\./g, "").split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}