import type { HrAuthorisationStatus } from "../../api/types";
import { fmtDay, StatusPill } from "../../me/parts";
import { useHrSettings } from "../useHrSettings";

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

/** Cover per competence; at or below HR Settings' thin-cover level is the risk the head of department hears about. */
export function coverLabel(holders: number, expiring: number, thin: number | null = null): { cls: string; label: string } {
  if (holders === 0) return { cls: "bad", label: "Nobody" };
  if (holders === 1) return { cls: thin != null && holders <= thin ? "bad" : "leave", label: expiring ? "1, expiring" : "1 person only" };
  if (thin != null && holders <= thin) return { cls: "bad", label: `${holders} people only` };
  if (expiring) return { cls: "leave", label: `${holders}, ${expiring} expiring` };
  return { cls: "ok", label: `${holders} people` };
}

/** Evidence kinds eswasa_hr accepts (GET /hr/settings lists.evidence_types). */
export function useEvidenceTypes(): string[] {
  return useHrSettings()?.lists.evidence_types ?? [];
}
