import type { HrLeaveSummary, MeTab } from "./types";
import { ME_TABS } from "./types";

export function parseMeTab(raw: string | null): MeTab {
  if (raw && (ME_TABS as readonly string[]).includes(raw)) return raw as MeTab;
  return "leave";
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateRange(from?: string | null, to?: string | null): string {
  if (!from && !to) return "—";
  if (from && to && from === to) return fmtDate(from);
  if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
  return fmtDate(from || to);
}

export type StatusKind = "pend" | "done" | "rej" | "other";

export function statusKind(status?: string | null): StatusKind {
  const s = (status ?? "").toLowerCase();
  if (s.includes("reject") || s.includes("denied") || s.includes("cancel") || s.includes("not approved")) return "rej";
  if (s.includes("approve") || s.includes("granted") || s.includes("paid") || s.includes("submitted"))
    return "done";
  if (s.includes("pend") || s.includes("open") || s.includes("draft") || s.includes("waiting") || !s) return "pend";
  return "other";
}

export function statusLabel(status?: string | null): string {
  return status || "—";
}

/** "Annual Leave · 3 days" with HRMS's own count (holidays and half days included); no count when it sent none. */
export function leaveRowTitle(item: HrLeaveSummary): string {
  const days = item.days;
  return days == null ? item.leave_type : `${item.leave_type} · ${days} day${days === 1 ? "" : "s"}`;
}

/** An amount in the given currency (the claim's own, else the company's); just the number when none is known. */
export function fmtMoney(n: number | null | undefined, currency?: string | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  const v = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${v}` : v;
}
