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
import type {
  MarketingCampaignsResponse,
  MarketingCampaignSummary,
} from "../api/types";
import { fmtDate, fmtMoney, KvGrid, readStr } from "./sub-views";

/** Campaigns — Marketing campaigns with filter, search, and a record drawer. */

type StatusFilter = "all" | "active" | "scheduled" | "completed" | "archived";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

/** Coloured stage-chip for a campaign status. */
const STATUS_CHIPS: Record<
  Exclude<StatusFilter, "all">,
  { bg: string; fg: string; label: string }
> = {
  active: { bg: "var(--green-l)", fg: "#166534", label: "Active" },
  scheduled: { bg: "var(--amber-l)", fg: "#92400e", label: "Scheduled" },
  completed: { bg: "var(--blue-l)", fg: "#075985", label: "Completed" },
  archived: { bg: "var(--bg)", fg: "var(--muted)", label: "Archived" },
};

/** Default chip for unknown status strings coming from the contract. */
const STATUS_DEFAULT = { bg: "var(--bg)", fg: "var(--muted)", label: "Unknown" };

function chipFor(status?: string): {
  bg: string;
  fg: string;
  label: string;
} {
  if (!status) return STATUS_DEFAULT;
  const key = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key as Exclude<StatusFilter, "all">];
  if (key.includes("active") || key.includes("live") || key.includes("running"))
    return STATUS_CHIPS.active;
  if (key.includes("schedul") || key.includes("upcoming") || key.includes("pending"))
    return STATUS_CHIPS.scheduled;
  if (key.includes("complete") || key.includes("done") || key.includes("closed"))
    return STATUS_CHIPS.completed;
  if (key.includes("archiv") || key.includes("expired") || key.includes("retired"))
    return STATUS_CHIPS.archived;
  // TODO: wire real — contract carries free-text status; map new values here.
  return { ...STATUS_DEFAULT, label: status };
}

/** Derived kind for filtering + KPIs. */
function kindFor(c: MarketingCampaignSummary): StatusFilter {
  const s = (c.status ?? "").toLowerCase();
  if (s.includes("archiv") || s.includes("expired") || s.includes("retired"))
    return "archived";
  if (s.includes("complete") || s.includes("done") || s.includes("closed"))
    return "completed";
  if (s.includes("schedul") || s.includes("upcoming") || s.includes("pending"))
    return "scheduled";
  if (s.includes("active") || s.includes("live") || s.includes("running"))
    return "active";
  return "scheduled"; // TODO: wire real — default when status omitted.
}

export function MarketingCampaignsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<MarketingCampaignsResponse>("/marketing/campaigns", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketingCampaignSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (statusFilter !== "all" && kindFor(c) !== statusFilter) return false;
      if (!q) return true;
      const hay = `${c.id} ${c.title} ${c.status ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, statusFilter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    let active = 0;
    let scheduled = 0;
    let completed = 0;
    for (const c of items) {
      const k = kindFor(c);
      if (k === "active") active++;
      else if (k === "scheduled") scheduled++;
      else if (k === "completed") completed++;
    }
    return [
      { label: "Total", value: items.length },
      { label: "Active", value: active, variant: "ok" },
      { label: "Scheduled", value: scheduled, variant: "due" },
      { label: "Completed", value: completed },
    ];
  }, [items]);

  function newCampaign() {
    // TODO: wire real — open a New Campaign composer / navigate to a create route.
    setFlash("New campaign composer: TODO");
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const chip = chipFor(selected.status);
    return [
      {
        heading: "Campaign details",
        content: (
          <KvGrid
            rows={[
              { label: "Name", value: selected.title },
              { label: "Channel", value: readStr(s, "channel") ?? "—" },
              {
                label: "Status",
                value: (
                  <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}>
                    <span className="d" style={{ background: chip.fg }} />
                    {chip.label}
                  </span>
                ),
              },
              { label: "Start", value: fmtDate(readStr(s, "start_date") ?? readStr(s, "starts_at")) },
              { label: "End", value: fmtDate(readStr(s, "end_date") ?? readStr(s, "ends_at")) },
            ]}
          />
        ),
      },
      {
        heading: "Performance",
        content: (
          <KvGrid
            rows={[
              { label: "Budget", value: fmtMoney(readStr(s, "budget") ? Number(readStr(s, "budget")) : null) },
              { label: "Reach", value: readStr(s, "reach") ?? "—" },
              { label: "Conversions", value: readStr(s, "conversions") ?? "—" },
              { label: "ROI", value: readStr(s, "roi") ?? "—" },
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
              label: "New campaign",
              icon: "i-plus",
              variant: "gold",
              onClick: newCampaign,
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
        label="Loading campaigns…"
      >
        <>
          <ModuleHeader
            title="Campaigns"
            subtitle="Marketing campaigns: track active, draft and completed work."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={newCampaign}>
                New campaign
              </button>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter campaigns by status",
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
              placeholder: "Search by title or ID…",
            }}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No campaigns match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search or status filter above."
                  : "Campaigns will appear once they are created."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((c) => {
                const chip = chipFor(c.status);
                const s = c as unknown as { [k: string]: unknown };
                const meta: DataMetaItem[] = [
                  { label: readStr(s, "channel") ?? "—", tag: true },
                  { label: fmtDate(readStr(s, "start_date") ?? readStr(s, "starts_at")) },
                  { label: chip.label },
                ];
                return (
                  <DataRow
                    key={c.id}
                    icon="i-mega"
                    iconVariant="purple"
                    title={c.title}
                    badge={c.id}
                    meta={meta}
                    onOpen={() => setSelected(c)}
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