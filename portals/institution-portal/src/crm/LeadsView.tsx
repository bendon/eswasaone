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
import type { CrmLeadsResponse, CrmLeadSummary } from "../api/types";
import { fmtDate, fmtMoney, KvGrid, readStr } from "./sub-views";

/** Leads — active leads with status filter, search, and a record drawer. */

type StatusFilter = "all" | "new" | "contacted" | "qualified" | "converted" | "lost";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

/** Coloured stage-chip for a lead status.
 *  // TODO: wire real — contract carries free-text status; map new values here. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "var(--blue-l)", fg: "#1e40af", label: "New" },
  contacted: { bg: "var(--gold-l)", fg: "#92400e", label: "Contacted" },
  qualified: { bg: "#e0e7ff", fg: "#3730a3", label: "Qualified" },
  converted: { bg: "var(--green-l)", fg: "#166534", label: "Converted" },
  lost: { bg: "#fee2e2", fg: "#991b1b", label: "Lost" },
  default: { bg: "var(--bg)", fg: "var(--muted)", label: "—" },
};

function chipFor(status?: string | null): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase();
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("new")) return STATUS_CHIPS.new;
  if (key.includes("contact")) return STATUS_CHIPS.contacted;
  if (key.includes("qualif")) return STATUS_CHIPS.qualified;
  if (key.includes("convert") || key.includes("won")) return STATUS_CHIPS.converted;
  if (key.includes("lost") || key.includes("drop")) return STATUS_CHIPS.lost;
  return { ...STATUS_CHIPS.default, label: status };
}

function bucketFor(item: CrmLeadSummary): StatusFilter {
  const s = (item.status ?? "").toLowerCase();
  if (s.includes("new")) return "new";
  if (s.includes("contact")) return "contacted";
  if (s.includes("qualif")) return "qualified";
  if (s.includes("convert") || s.includes("won")) return "converted";
  if (s.includes("lost") || s.includes("drop")) return "lost";
  return "all";
}

function matchesFilter(item: CrmLeadSummary, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return bucketFor(item) === filter;
}

export function LeadsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<CrmLeadsResponse>(
    "/crm/leads",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<CrmLeadSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!matchesFilter(i, statusFilter)) return false;
      if (!q) return true;
      return `${i.id} ${i.title} ${i.organization ?? ""}`.toLowerCase().includes(q);
    });
  }, [items, statusFilter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    const counts = { new: 0, qualified: 0, converted: 0 } as Record<string, number>;
    for (const i of items) {
      const b = bucketFor(i);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    return [
      { label: "Total", value: items.length },
      { label: "New", value: counts.new ?? 0 },
      { label: "Qualified", value: counts.qualified ?? 0, variant: "due" },
      { label: "Converted", value: counts.converted ?? 0, variant: "ok" },
    ];
  }, [items]);

  function newLead() {
    // TODO: wire real — POST /crm/leads with confirm dialog once create form is built
    setFlash("New lead form coming soon");
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const chip = chipFor(selected.status);
    return [
      {
        heading: "Lead details",
        content: (
          <KvGrid
            rows={[
              { label: "Title", value: selected.title },
              {
                label: "Status",
                value: (
                  <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}>
                    <span className="d" style={{ background: chip.fg }} />
                    {chip.label}
                  </span>
                ),
              },
              { label: "Source", value: readStr(s, "source") ?? "—" },
              {
                label: "Value",
                value: fmtMoney(readStr(s, "value") ? Number(readStr(s, "value")) : null),
              },
            ]}
          />
        ),
      },
      {
        heading: "Contact & organization",
        content: (
          <KvGrid
            rows={[
              { label: "Organization", value: selected.organization || "—" },
              { label: "Contact", value: readStr(s, "contact") ?? "—" },
              { label: "Email", value: readStr(s, "email") ?? "—" },
              { label: "Phone", value: readStr(s, "phone") ?? "—" },
            ]}
          />
        ),
      },
      {
        heading: "Notes & ownership",
        content: (
          <KvGrid
            rows={[
              { label: "Owner", value: readStr(s, "owner") ?? "—" },
              { label: "Notes", value: readStr(s, "notes") ?? "—" },
              { label: "Created", value: fmtDate(readStr(s, "created_at")) },
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
              label: "New lead",
              icon: "i-plus",
              variant: "gold",
              onClick: newLead,
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
        label="Loading leads…"
      >
        <>
          <ModuleHeader
            title="Leads"
            subtitle="Active prospects across the inbound funnel."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={newLead}>
                New lead
              </button>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter leads by status",
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
              placeholder: "Search title, organization or ID…",
            }}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No leads match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the filter or search above."
                  : "Leads will appear once the backend is populated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((item) => {
                const chip = chipFor(item.status);
                const meta: DataMetaItem[] = [
                  { label: readStr(item as unknown as Record<string, unknown>, "source") ?? "Unknown source" },
                  { label: chip.label, tag: true },
                ];
                return (
                  <DataRow
                    key={item.id}
                    icon="i-users"
                    iconVariant="navy"
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