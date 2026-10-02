import type { ReactNode } from "react";

export { CatalogueView } from "./CatalogueView";
export { DraftsView } from "./DraftsView";
export { WorkItemsView } from "./WorkItemsView";
export { BallotsView } from "./BallotsView";
export { CommentsView } from "./CommentsView";

/* ---------- Shared helpers for Standards sub-views ---------- */

/** Read a possibly-missing loose field as a trimmed string (or null). */
export function readStr(record: { [k: string]: unknown }, key: string): string | null {
  const v = record[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Format an ISO date string as a localized date, or "—" if missing/invalid. */
export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Key-value grid for drawer sections — matches `.data-kvs` pattern from DataRow. */
export function KvGrid({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="data-kvs">
      {rows.map((r) => (
        <div key={r.label}>
          <b>{r.label}</b>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  );
}