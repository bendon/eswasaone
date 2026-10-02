import type { AuditSegment, FieldAuditRow } from "./types";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSubmittedStatus(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s.includes("submit") ||
    s.includes("complete") ||
    s.includes("done") ||
    s.includes("closed")
  );
}

export function segmentFor(
  a: FieldAuditRow,
  locallySubmitted?: boolean,
): AuditSegment {
  if (locallySubmitted || isSubmittedStatus(a.status)) return "submitted";
  const due = a.due_date || "";
  const today = todayIso();
  if (due && due < today) {
    // Overdue still sits in Today for field action.
    return "today";
  }
  if (due === today) return "today";
  return "upcoming";
}

export function filterBySegment(
  items: FieldAuditRow[],
  segment: AuditSegment,
  locallySubmittedIds: Set<string>,
): FieldAuditRow[] {
  return items.filter(
    (a) => segmentFor(a, locallySubmittedIds.has(a.id)) === segment,
  );
}

/**
 * Prefer current user's audits when `auditor` is populated.
 * List API has no auditor= filter — // TODO: wire real server-side filter.
 */
export function filterForCurrentUser(
  items: FieldAuditRow[],
  username: string | null | undefined,
  fullName: string | null | undefined,
): FieldAuditRow[] {
  if (!username && !fullName) return items;
  const keys = [username, fullName]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  const matched = items.filter((a) => {
    if (!a.auditor) return true; // unassigned — show until API scopes
    const aud = a.auditor.toLowerCase();
    return keys.some((k) => aud.includes(k) || k.includes(aud));
  });
  // If nothing matches (demo mismatch), fall back to full list.
  return matched.length ? matched : items;
}

/** Build /audits?open=… deep-link for Home / push notifications. */
export function auditsHref(opts?: {
  open?: string;
  segment?: AuditSegment;
}): string {
  const params = new URLSearchParams();
  if (opts?.open) params.set("open", opts.open);
  if (opts?.segment) params.set("seg", opts.segment);
  const q = params.toString();
  return q ? `/audits?${q}` : "/audits";
}
