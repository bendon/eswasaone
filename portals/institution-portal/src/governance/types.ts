/**
 * Governance UI helpers.
 * Prefer contract types from `../api/types` — this file only holds view-local adapters.
 * TODO: wire real — drop adapters once all views consume OpenAPI shapes directly.
 */

export type {
  PackSection,
  PackSectionStatus,
  PackTrack as PackTrackData,
  GovernanceOverview,
  GovernanceKpis,
  GovernanceMeeting,
  GovernancePack,
  GovernanceResolution,
  ResolutionAction,
  GovernanceRisk,
  BoardMember,
  GovernanceBody,
  GovernanceDeclaration,
  GovernanceCalendarItem,
} from "../api/types";

/** CSS segment class for a pack section status. */
export function packSegClass(status: string): "ready" | "wait" | "late" {
  const k = status.toLowerCase();
  if (k === "ready" || k.includes("ready") || k.includes("done")) return "ready";
  if (k === "overdue" || k.includes("late") || k.includes("overdue")) return "late";
  return "wait";
}

export function packStatusLabel(status: string): { tone: "ok" | "warn" | "bad"; label: string } {
  const seg = packSegClass(status);
  if (seg === "ready") return { tone: "ok", label: "Ready" };
  if (seg === "late") return { tone: "bad", label: "Overdue" };
  return { tone: "warn", label: "Awaiting owner" };
}

export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

export function riskBand(score: number): { tone: "bad" | "warn" | "info" | "ok"; label: string } {
  if (score >= 15) return { tone: "bad", label: "Critical" };
  if (score >= 10) return { tone: "warn", label: "High" };
  if (score >= 5) return { tone: "info", label: "Medium" };
  return { tone: "ok", label: "Low" };
}

export function heatLevel(score: number): 1 | 2 | 3 | 4 {
  if (score >= 15) return 4;
  if (score >= 10) return 3;
  if (score >= 5) return 2;
  return 1;
}

export function trendTone(trend?: string | null): { tone: "bad" | "ok" | "mute"; label: string } {
  const k = (trend ?? "").toLowerCase();
  if (k.includes("worsen") || k === "up") return { tone: "bad", label: "Worsening" };
  if (k.includes("improv") || k === "down") return { tone: "ok", label: "Improving" };
  return { tone: "mute", label: "Stable" };
}
