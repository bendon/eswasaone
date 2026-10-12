import type { ReactNode } from "react";

// CRM & Commercial + Service desk. LeadsView / DealsView / the old CrmPipelineView are superseded
// by Signals and Opportunities; /crm/leads and /crm/deals redirect to /crm/pipeline.
export { CrmOverviewView } from "./OverviewView";
export { CrmCasesView, CrmAppealsView } from "./CasesView";
export { CrmCaseWorkspace } from "./CaseWorkspace";
export { CrmClientsView } from "./ClientsView";
export { CrmClient360 } from "./Client360";
export { CrmSignalsView } from "./SignalsView";
export { CrmPipelineView } from "./PipelineView";
export { CrmQuotesView } from "./QuotesView";
export { CrmRenewalsView } from "./RenewalsView";
export { CrmInsightsView } from "./InsightsView";
export { CrmSettingsView } from "./SettingsView";

/* ---------- Shared helpers for CRM sub-views ---------- */

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

/** Format an amount with the "E " prefix (Rwandan/Eswatini currency shorthand). */
export function fmtMoney(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `E ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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