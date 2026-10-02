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
import type { FinanceRevenueResponse, FinanceRevenueLine } from "../api/types";

/** Revenue — revenue breakdown by service line. */

/** Format a Swazi Lilangeni amount with the `E ` prefix. */
function fmtMoney(n?: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `E ${n.toLocaleString()}`;
}

/** Whether a revenue line is recognised (i.e. has an amount and a period). */
function isRecognized(line: FinanceRevenueLine): boolean {
  return line.amount != null && Boolean(line.period);
}

export function RevenueView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<FinanceRevenueResponse>(
    "/finance/revenue",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [search, setSearch] = useState("");
  const [openRef, setOpenRef] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const total = useMemo(
    () => items.reduce((sum, l) => sum + (l.amount ?? 0), 0),
    [items],
  );

  const thisMonth = useMemo(() => {
    const now = new Date();
    const monthLabel = now.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    return items
      .filter((l) => {
        if (!l.period) return false;
        const p = l.period.toLowerCase();
        return (
          p === now.toISOString().slice(0, 7) ||
          p.includes(String(now.getMonth() + 1).padStart(2, "0")) ||
          p === monthLabel.toLowerCase()
        );
      })
      .reduce((sum, l) => sum + (l.amount ?? 0), 0);
  }, [items]);

  const pending = useMemo(
    () => items.filter((l) => !isRecognized(l)).length,
    [items],
  );
  const recognized = useMemo(
    () => items.filter((l) => isRecognized(l)).length,
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((l) => {
      const hay = `${l.id} ${l.label} ${l.period ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const selected = items.find((l) => l.id === openRef) ?? null;

  const tiles: SummaryTile[] = [
    { label: "Total revenue", value: fmtMoney(total) },
    { label: "This month", value: fmtMoney(thisMonth), variant: "due" },
    { label: "Pending", value: pending, variant: pending ? "due" : "ok" },
    { label: "Recognized", value: recognized, variant: "ok" },
  ];

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Revenue line",
          content: (
            <>
              <div className="kv">
                <b>Reference</b>
                <span className="mono">{selected.id}</span>
              </div>
              <div className="kv">
                <b>Source</b>
                <span>{selected.label}</span>
              </div>
              <div className="kv">
                <b>Account</b>
                <span>{(selected as FinanceRevenueLine & { account?: string }).account ?? "—"}</span>
              </div>
              <div className="kv">
                <b>Category</b>
                <span>{(selected as FinanceRevenueLine & { category?: string }).category ?? "—"}</span>
              </div>
            </>
          ),
        },
        {
          heading: "Amount & period",
          content: (
            <>
              <div className="kv">
                <b>Amount</b>
                <span>{fmtMoney(selected.amount)}</span>
              </div>
              <div className="kv">
                <b>Period</b>
                <span>{selected.period ?? "—"}</span>
              </div>
              <div className="kv">
                <b>Date</b>
                <span>{(selected as FinanceRevenueLine & { date?: string | null }).date ?? selected.period ?? "—"}</span>
              </div>
            </>
          ),
        },
        {
          heading: "Notes",
          content: (
            <div className="kv">
              <b>Notes</b>
              <span>{(selected as FinanceRevenueLine & { notes?: string | null }).notes ?? "—"}</span>
            </div>
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
        label="Loading revenue…"
      >
        <>
          <ModuleHeader
            title="Revenue"
            subtitle="Revenue breakdown by service line and period."
            summary={tiles}
          />

          <Toolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search label, period or line ID…",
            }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No revenue lines match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search above."
                  : "Revenue lines will appear once the backend is populated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((line) => {
                const meta: DataMetaItem[] = [
                  { label: line.label },
                  { label: line.period ?? "—" },
                  { label: fmtMoney(line.amount) },
                ];
                return (
                  <DataRow
                    key={line.id}
                    icon="i-dollar"
                    iconVariant="green"
                    title={line.id}
                    badge={line.period ?? undefined}
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
            subtitle={selected ? <span className="stagechip">{selected.period ?? "Revenue"}</span> : null}
            sections={drawerSections}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}