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

export function dayCount(from?: string | null, to?: string | null): number {
  if (!from || !to) return 1;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
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
  if (!status) return "Pending";
  return status;
}

export function leaveRowTitle(item: HrLeaveSummary): string {
  const days = dayCount(item.from_date, item.to_date);
  return `${item.leave_type} · ${days} day${days === 1 ? "" : "s"}`;
}

export function fmtSzl(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "SZL —";
  return `SZL ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function ytdFromSlips(
  items: Array<{ period?: string | null; net_pay?: number | null }>,
  year = new Date().getFullYear(),
): number {
  return items.reduce((sum, s) => {
    const p = s.period ?? "";
    if (p.includes(String(year)) || (!p && year === new Date().getFullYear())) {
      return sum + (Number(s.net_pay) || 0);
    }
    return sum;
  }, 0);
}
