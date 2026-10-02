import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  DataRow,
  ModuleHeader,
  RecordDrawer,
  Toolbar,
  type SummaryTile,
  type DataMetaItem,
  type DrawerSection,
} from "@eswasaone/shared-ui";
import type { FinanceBudgetResponse, FinanceBudgetLine } from "../api/types";

/** Budget — budget vs actual by cost centre, with utilisation bars. */

type StatusFilter = "all" | "on_track" | "over" | "under";

/** Format a Swazi Lilangeni amount with the `E ` prefix. */
function fmtMoney(n?: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `E ${n.toLocaleString()}`;
}

/** Variance % colour: positive (under budget) = green, negative (over) = red. */
function varianceSla(pct?: number): "ok" | "breach" | "due" {
  if (pct == null || Number.isNaN(pct)) return "due";
  return pct >= 0 ? "ok" : "breach";
}

function fmtPct(pct?: number): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Coarse status bucket derived from variance. */
function statusBucket(line: FinanceBudgetLine): StatusFilter {
  if (line.variance_pct == null) return "all";
  if (line.variance_pct < -10) return "over";
  if (line.variance_pct > 10) return "under";
  return "on_track";
}

function matchesFilter(line: FinanceBudgetLine, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return statusBucket(line) === filter;
}

export function BudgetView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<FinanceBudgetResponse>(
    "/finance/budget",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [openRef, setOpenRef] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const summary = useMemo(() => {
    const budget = items.reduce((s, l) => s + (l.budget ?? 0), 0);
    const actual = items.reduce((s, l) => s + (l.actual ?? 0), 0);
    const active = items.filter((l) => statusBucket(l) === "on_track").length;
    const variance = budget - actual;
    return { budget, actual, active, variance };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((l) => {
      if (!matchesFilter(l, statusFilter)) return false;
      if (!q) return true;
      return `${l.id} ${l.label}`.toLowerCase().includes(q);
    });
  }, [items, statusFilter, search]);

  const selected = items.find((l) => l.id === openRef) ?? null;

  const tiles: SummaryTile[] = [
    { label: "Total budgets", value: items.length },
    { label: "Active", value: summary.active, variant: "ok" },
    { label: "Allocated", value: fmtMoney(summary.budget) },
    { label: "Variance", value: fmtMoney(summary.variance), variant: summary.variance >= 0 ? "ok" : "breach" },
  ];

  const statusOptions = ["All lines", "On track", "Over budget", "Under budget"];

  function onFilterChange(v: string) {
    const key = v.toLowerCase().replace("all ", "").replace(" budget", "").replace(" ", "_") as StatusFilter;
    setStatusFilter(key === "all" ? "all" : key);
  }

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Cost centre",
          content: (
            <>
              <div className="kv">
                <b>Line ID</b>
                <span className="mono">{selected.id}</span>
              </div>
              <div className="kv">
                <b>Company</b>
                <span>{(selected as FinanceBudgetLine & { company?: string }).company ?? "EswasaOne"}</span>
              </div>
              <div className="kv">
                <b>Cost centre</b>
                <span>{selected.label}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span className="stagechip">{statusBucket(selected) === "over" ? "Over budget" : statusBucket(selected) === "under" ? "Under budget" : "On track"}</span>
              </div>
            </>
          ),
        },
        {
          heading: "Breakdown",
          content: (
            <>
              <div className="kv">
                <b>Budget</b>
                <span>{fmtMoney(selected.budget)}</span>
              </div>
              <div className="kv">
                <b>Actual</b>
                <span>{fmtMoney(selected.actual)}</span>
              </div>
              <div className="kv">
                <b>Variance</b>
                <span>{fmtMoney((selected.budget ?? 0) - (selected.actual ?? 0))}</span>
              </div>
              <div className="kv">
                <b>Variance %</b>
                <span>{fmtPct(selected.variance_pct)}</span>
              </div>
            </>
          ),
        },
      ]
    : [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading budget…"
      >
        <>
          <ModuleHeader
            title="Budget"
            subtitle="Budget vs actual by cost centre, with utilisation bars."
            summary={tiles}
          />

          <Toolbar
            filters={[
              {
                label: "Filter budget lines by status",
                value: statusOptions[["all", "on_track", "over", "under"].indexOf(statusFilter)] ?? statusOptions[0],
                options: statusOptions,
                onChange: onFilterChange,
              },
            ]}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search category or line ID…",
            }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No budget lines match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the filter or search above."
                  : "Budget lines will appear once the backend is populated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((line) => {
                const meta: DataMetaItem[] = [
                  { label: `Budget ${fmtMoney(line.budget)}` },
                  { label: `Actual ${fmtMoney(line.actual)}` },
                  { label: fmtPct(line.variance_pct), sla: varianceSla(line.variance_pct) },
                ];
                return (
                  <DataRow
                    key={line.id}
                    icon="i-chart"
                    iconVariant="navy"
                    title={line.label}
                    badge={line.id}
                    meta={meta}
                    onOpen={() => setOpenRef(line.id)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenRef(null)}
            reference={selected?.id}
            title={selected ? selected.label : ""}
            subtitle={selected ? <span className="stagechip">Cost centre</span> : null}
            sections={drawerSections}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}