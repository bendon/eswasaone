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
import type { FinanceInvoicesResponse, FinanceInvoiceSummary } from "../api/types";

/** Invoices — sales invoices with overdue tracking. */

type StatusFilter = "all" | "paid" | "unpaid" | "overdue";

/** Format a Swazi Lilangeni amount with the `E ` prefix. */
function fmtMoney(n?: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `E ${n.toLocaleString()}`;
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Normalise the free-text status from the contract to a filter bucket. */
function statusBucket(item: FinanceInvoiceSummary): StatusFilter {
  if (item.overdue) return "overdue";
  const s = (item.status ?? "").toLowerCase();
  if (s.includes("paid") || s.includes("settled") || s.includes("closed")) return "paid";
  return "unpaid";
}

/** SLA kind for an invoice status bucket. */
function slaFor(bucket: StatusFilter): "ok" | "due" | "breach" {
  if (bucket === "paid") return "ok";
  if (bucket === "overdue") return "breach";
  return "due";
}

/** Label for an invoice status bucket. */
function labelFor(bucket: StatusFilter): string {
  if (bucket === "paid") return "Paid";
  if (bucket === "overdue") return "Overdue";
  return "Unpaid";
}

function matchesFilter(item: FinanceInvoiceSummary, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return statusBucket(item) === filter;
}

export function InvoicesView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<FinanceInvoicesResponse>(
    "/finance/invoices",
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
    const overdue = items.filter((i) => i.overdue).length;
    const paidCount = items.filter((i) => statusBucket(i) === "paid").length;
    const totalValue = items.reduce((sum, i) => sum + i.grand_total, 0);
    const paidValue = items
      .filter((i) => statusBucket(i) === "paid")
      .reduce((sum, i) => sum + i.grand_total, 0);
    const outstanding = totalValue - paidValue;
    return { count: items.length, overdue, paidCount, totalValue, outstanding, paidValue };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!matchesFilter(i, statusFilter)) return false;
      if (!q) return true;
      return `${i.id} ${i.customer}`.toLowerCase().includes(q);
    });
  }, [items, statusFilter, search]);

  const selected = items.find((i) => i.id === openRef) ?? null;

  const tiles: SummaryTile[] = [
    { label: "Total", value: summary.count },
    { label: "Outstanding", value: fmtMoney(summary.outstanding), variant: "due" },
    { label: "Overdue", value: summary.overdue, variant: summary.overdue ? "breach" : "ok" },
    { label: "Paid", value: fmtMoney(summary.paidValue), variant: "ok" },
  ];

  const statusOptions = ["All statuses", "Paid", "Unpaid", "Overdue"];

  function onFilterChange(v: string) {
    const key = v.toLowerCase().replace("all ", "") as StatusFilter;
    setStatusFilter(key === "all" ? "all" : key);
  }

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Invoice",
          content: (
            <>
              <div className="kv">
                <b>Invoice #</b>
                <span className="mono">{selected.id}</span>
              </div>
              <div className="kv">
                <b>Customer</b>
                <span>{selected.customer}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span className="stagechip">{labelFor(statusBucket(selected))}</span>
              </div>
              <div className="kv">
                <b>Due date</b>
                <span>{fmtDate(selected.due_date)}</span>
              </div>
            </>
          ),
        },
        {
          heading: "Items & totals",
          content: (
            <>
              <div className="kv">
                <b>Subtotal</b>
                <span>{fmtMoney((selected as FinanceInvoiceSummary & { subtotal?: number }).subtotal)}</span>
              </div>
              <div className="kv">
                <b>Tax</b>
                <span>{fmtMoney((selected as FinanceInvoiceSummary & { tax?: number }).tax)}</span>
              </div>
              <div className="kv">
                <b>Grand total</b>
                <span>{fmtMoney(selected.grand_total)}</span>
              </div>
              <div className="kv">
                <b>Payment status</b>
                <span>{selected.overdue ? "Overdue" : labelFor(statusBucket(selected))}</span>
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
        label="Loading invoices…"
      >
        <>
          <ModuleHeader
            title="Invoices"
            subtitle="Sales invoices across revenue lines, with overdue tracking."
            summary={tiles}
          />

          <Toolbar
            filters={[
              {
                label: "Filter invoices by status",
                value: statusOptions[["all", "paid", "unpaid", "overdue"].indexOf(statusFilter)] ?? statusOptions[0],
                options: statusOptions,
                onChange: onFilterChange,
              },
            ]}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search invoice ID or customer…",
            }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No invoices match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the filter or search above."
                  : "Invoices will appear once the backend is populated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((item) => {
                const bucket = statusBucket(item);
                const meta: DataMetaItem[] = [
                  { label: item.customer },
                  { label: fmtMoney(item.grand_total) },
                  { label: `Due ${fmtDate(item.due_date)}` },
                  { label: labelFor(bucket), sla: slaFor(bucket) },
                ];
                return (
                  <DataRow
                    key={item.id}
                    icon="i-file"
                    iconVariant="navy"
                    title={item.id}
                    badge={item.customer}
                    meta={meta}
                    onOpen={() => setOpenRef(item.id)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenRef(null)}
            reference={selected?.id}
            title={selected ? selected.id : ""}
            subtitle={selected ? <span className="stagechip">{labelFor(statusBucket(selected))}</span> : null}
            sections={drawerSections}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}