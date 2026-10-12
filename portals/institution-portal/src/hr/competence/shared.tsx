import type { HrAuthorisationStatus } from "../../api/types";
import { fmtDay, StatusPill } from "../../me/parts";

const CLS: Record<HrAuthorisationStatus, string> = {
  Current: "ok",
  Expiring: "leave",
  "In training": "info",
  Expired: "bad",
  Withdrawn: "mute",
};

/** One authorisation status as a pill; Expiring shows its end date. */
export function AuthPill({ status, validTo }: { status: HrAuthorisationStatus; validTo?: string | null }) {
  const label = status === "Expiring" && validTo ? `To ${fmtDay(validTo)}` : status;
  return <StatusPill cls={CLS[status] ?? "mute"} label={label} />;
}

/** Cover per competence: "1 person only" is the risk the head of department hears about (R-H4). */
export function coverLabel(holders: number, expiring: number): { cls: string; label: string } {
  if (holders === 0) return { cls: "bad", label: "Nobody" };
  if (holders === 1) return { cls: "bad", label: expiring ? "1, expiring" : "1 person only" };
  if (expiring) return { cls: "leave", label: `${holders}, ${expiring} expiring` };
  return { cls: "ok", label: `${holders} people` };
}

export const EVIDENCE_TYPES = ["Training Result", "Witnessed audit", "Proficiency test", "File", "Other"] as const;
