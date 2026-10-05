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
  Toast,
  type DataMetaItem,
  type DrawerAction,
  type DrawerSection,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import type { CrmDealsResponse, CrmDealSummary } from "../api/types";
import { fmtDate, fmtMoney, KvGrid, readStr } from "./sub-views";

/** Deals — open deals with KPI summary, status filter, search, and a record drawer. */

type StatusFilter = "all" | "open" | "negotiation" | "won" | "lost";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

/** Coloured stage-chip for a deal status.
 *  // TODO: wire real — contract carries free-text status; map new values here. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  open: { bg: "var(--blue-l)", fg: "#1e40af", label: "Open" },
  negotiation: { bg: "var(--gold-l)", fg: "#92400e", label: "Negotiation" },
  won: { bg: "var(--green-l)", fg: "#166534", label: "Won" },
  lost: { bg: "#fee2e2", fg: "#991b1b", label: "Lost" },
  default: { bg: "var(--bg)", fg: "var(--muted)", label: "—" },
};

function chipFor(status?: string | null): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase();
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("open") || key.includes("progress") || key.includes("active")) return STATUS_CHIPS.open;
  if (key.includes("negot") || key.includes("proposal") || key.includes("quote")) return STATUS_CHIPS.negotiation;
  if (key.includes("won") || key.includes("close") || key.includes("convert")) return STATUS_CHIPS.won;
  if (key.includes("lost") || key.includes("drop") || key.includes("cancel")) return STATUS_CHIPS.lost;
  return { ...STATUS_CHIPS.default, label: status };
}

function bucketFor(item: CrmDealSummary): StatusFilter {
  const s = (item.status ?? "").toLowerCase();
  if (s.includes("open") || s.includes("progress") || s.includes("active")) return "open";
  if (s.includes("negot") || s.includes("proposal") || s.includes("quote")) return "negotiation";
  if (s.includes("won") || s.includes("close") || s.includes("convert")) return "won";
  if (s.includes("lost") || s.includes("drop") || s.includes("cancel")) return "lost";
  return "all";
}

function matchesFilter(item: CrmDealSummary, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return bucketFor(item) === filter;
}

export function DealsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<CrmDealsResponse>(
    "/crm/deals",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<CrmDealSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!matchesFilter(i, statusFilter)) return false;
      if (!q) return true;
      return `${i.id} ${i.title}`.toLowerCase().includes(q);
    });
  }, [items, statusFilter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    const open = items.filter((i) => bucketFor(i) === "open").length;
    const won = items.filter((i) => bucketFor(i) === "won").length;
    const lost = items.filter((i) => bucketFor(i) === "lost").length;
    return [
      { label: "Total", value: items.length },
      { label: "Open", value: open, variant: "due" },
      { label: "Won", value: won, variant: "ok" },
      { label: "Lost", value: lost, variant: lost ? "breach" : "ok" },
    ];
  }, [items]);

  function newDeal() {
    // TODO: wire real — POST /crm/deals with confirm dialog once create form is built
    setFlash("New deal form coming soon");
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const chip = chipFor(selected.status);
    return [
      {
        heading: "Deal details",
        content: (
          <KvGrid
            rows={[
              { label: "Title", value: selected.title },
              {
                label: "Stage",
                value: (
                  <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}>
                    <span className="d" style={{ background: chip.fg }} />
                    {chip.label}
                  </span>
                ),
              },
              { label: "Value", value: fmtMoney(selected.amount) },
              { label: "Lead", value: readStr(s, "lead") ?? readStr(s, "lead_id") ?? "—" },
            ]}
          />
        ),
      },
      {
        heading: "Probability & owner",
        content: (
          <KvGrid
            rows={[
              { label: "Probability", value: readStr(s, "probability") ?? "—" },
              { label: "Owner", value: readStr(s, "owner") ?? "—" },
              { label: "Close date", value: fmtDate(readStr(s, "close_date") ?? readStr(s, "expected_close")) },
            ]}
          />
        ),
      },
      {
        heading: "Activities",
        content: (
          <KvGrid
            rows={[
              { label: "Next activity", value: readStr(s, "next_activity") ?? "—" },
              { label: "Last contact", value: fmtDate(readStr(s, "last_contact")) },
              { label: "Notes", value: readStr(s, "notes") ?? "—" },
            ]}
          />
        ),
      },
    ];
  }, [selected]);

  const drawerActions: DrawerAction[] = useMemo(
    () =>
      selected
        ? [
            {
              label: "New deal",
              icon: "i-plus",
              variant: "gold",
              onClick: newDeal,
            },
            {
              label: "Close",
              variant: "ghost",
              onClick: () => setSelected(null),
            },
          ]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading deals…"
      >
        <>
          <ModuleHeader
            title="Deals"
            subtitle="Commercial opportunities and their value."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={newDeal}>
                New deal
              </button>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter deals by status",
                value: statusFilter,
                options: STATUS_OPTIONS.map((o) => o.label),
                onChange: (v) => {
                  const found = STATUS_OPTIONS.find((o) => o.label === v);
                  setStatusFilter(found ? found.value : "all");
                },
              },
            ]}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search title or ID…",
            }}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No deals match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the filter or search above."
                  : "Deals will appear once the backend is populated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((item) => {
                const chip = chipFor(item.status);
                const meta: DataMetaItem[] = [
                  { label: fmtMoney(item.amount), mono: true },
                  { label: chip.label, tag: true },
                ];
                return (
                  <DataRow
                    key={item.id}
                    icon="i-briefcase"
                    iconVariant="purple"
                    title={item.title}
                    badge={item.id}
                    meta={meta}
                    onOpen={() => setSelected(item)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={Boolean(selected)}
            onClose={() => setSelected(null)}
            reference={selected?.id}
            title={selected?.title ?? ""}
            subtitle={
              selected ? (
                <span className="stagechip" style={{ background: chipFor(selected.status).bg, color: chipFor(selected.status).fg }}>
                  <span className="d" style={{ background: chipFor(selected.status).fg }} />
                  {chipFor(selected.status).label}
                </span>
              ) : null
            }
            sections={drawerSections}
            actions={drawerActions}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}