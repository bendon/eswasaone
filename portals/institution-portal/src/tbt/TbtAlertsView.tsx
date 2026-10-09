import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  TbtNotificationsResponse,
  TbtNotificationSummary,
} from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Alerts — WTO/TBT notifications with SLA, filter, search, and a record drawer. */

type Impact = "high" | "medium" | "low";
type ImpactFilter = "all" | Impact;

const IMPACT_OPTIONS: { value: ImpactFilter; label: string }[] = [
  { value: "all", label: "All impacts" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** Coloured stage-chip for an alert impact. high=red, medium=amber, low=green. */
const IMPACT_CHIPS: Record<Impact, { bg: string; fg: string; label: string }> = {
  high: { bg: "var(--red-l)", fg: "#9f1239", label: "High" },
  medium: { bg: "var(--amber-l)", fg: "#92400e", label: "Medium" },
  low: { bg: "var(--green-l)", fg: "#166534", label: "Low" },
};

/** SLA bucket for an alert derived from unread + impact. */
function slaFor(a: TbtNotificationSummary): "breach" | "due" | "ok" {
  if (a.impact === "high" && a.unread) return "breach";
  if (a.unread) return "due";
  return "ok";
}

/** Alert state for summary: New / Action needed / Resolved. */
type AlertState = "new" | "action_needed" | "resolved";

function stateFor(a: TbtNotificationSummary): AlertState {
  if (!a.unread) return "resolved";
  return a.impact === "high" ? "action_needed" : "new";
}

function impactOf(a: TbtNotificationSummary): Impact {
  return (a.impact as Impact) ?? "low";
}

export function TbtAlertsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<TbtNotificationsResponse>("/tbt/alerts", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [search, setSearch] = useState("");
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<TbtNotificationSummary | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  // Deep-link from dashboard: /tbt?id=ALERT_ID
  useEffect(() => {
    if (deepLinkHandled || items.length === 0) return;
    const openId = searchParams.get("id");
    if (!openId) return;
    const match = items.find((a) => a.id === openId || a.symbol === openId);
    setDeepLinkHandled(true);
    if (match) setSelected(match);
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    setSearchParams(next, { replace: true });
  }, [items, searchParams, deepLinkHandled, setSearchParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (impactFilter !== "all" && impactOf(a) !== impactFilter) return false;
      if (!q) return true;
      const hay = `${a.id} ${a.symbol} ${a.title}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, impactFilter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    const newCount = data?.new_count ?? items.filter((a) => stateFor(a) === "new").length;
    const actionNeeded = items.filter((a) => stateFor(a) === "action_needed").length;
    const resolved = items.filter((a) => stateFor(a) === "resolved").length;
    return [
      { label: "Total", value: items.length },
      { label: "New", value: newCount },
      { label: "Action needed", value: actionNeeded, variant: actionNeeded ? "breach" : "ok" },
      { label: "Resolved", value: resolved, variant: "ok" },
    ];
  }, [items, data?.new_count]);

  function openAlert(a: TbtNotificationSummary) {
    setSelected(a);
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const chip = IMPACT_CHIPS[impactOf(selected)];
    return [
      {
        heading: "Notification summary",
        content: (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            {readStr(s, "summary") ?? readStr(s, "description") ?? "No summary available."}
          </p>
        ),
      },
      {
        heading: "Details",
        content: (
          <KvGrid
            rows={[
              { label: "Symbol", value: selected.symbol },
              { label: "Country", value: readStr(s, "country") ?? readStr(s, "jurisdiction") ?? "—" },
              { label: "Type", value: readStr(s, "type") ?? readStr(s, "notification_type") ?? "—" },
              { label: "Published", value: fmtDate(selected.published_at) },
              {
                label: "Impact",
                value: (
                  <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}>
                    <span className="d" style={{ background: chip.fg }} />
                    {chip.label}
                  </span>
                ),
              },
            ]}
          />
        ),
      },
      {
        heading: "Scope & products",
        content: (
          <KvGrid
            rows={[
              { label: "Scope", value: readStr(s, "scope") ?? "—" },
              { label: "Products affected", value: readStr(s, "products") ?? readStr(s, "products_affected") ?? "—" },
              { label: "Deadline", value: fmtDate(readStr(s, "deadline") ?? readStr(s, "comment_deadline")) },
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
              label: "Subscribe",
              icon: "i-mail",
              variant: "gold",
              onClick: () => setFlash("Subscribe (TODO: wire real)"),
            },
            {
              label: "Close",
              variant: "ghost",
              onClick: () => setSelected(null),
            },
          ]
        : [],
    [],
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
        label="Loading TBT alerts…"
      >
        <>
          <ModuleHeader
            title="TBT Alerts"
            subtitle="WTO/TBT notifications: track new and high-impact alerts."
            summary={summary}
            extra={
              <Link to="/tbt/subscriptions" className="btn ghost">
                Subscribe
              </Link>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter alerts by impact",
                value: impactFilter,
                options: IMPACT_OPTIONS.map((o) => o.label),
                onChange: (v) => {
                  const found = IMPACT_OPTIONS.find((o) => o.label === v);
                  setImpactFilter(found ? found.value : "all");
                },
              },
            ]}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search by symbol or title…",
            }}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No alerts match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search or impact filter above."
                  : "Alerts will appear once the backend is populated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((a) => {
                const impact = impactOf(a);
                const chip = IMPACT_CHIPS[impact];
                const s = a as unknown as { [k: string]: unknown };
                const meta: DataMetaItem[] = [
                  { label: a.symbol, mono: true },
                  { label: readStr(s, "country") ?? readStr(s, "jurisdiction") ?? "—", tag: true },
                  { label: readStr(s, "type") ?? "Notification" },
                  { label: fmtDate(a.published_at) },
                  { label: chip.label, sla: slaFor(a) },
                ];
                return (
                  <DataRow
                    key={a.id}
                    icon="i-bell"
                    iconVariant={impact === "high" ? "red" : impact === "medium" ? "amber" : "green"}
                    title={a.title}
                    badge={a.unread ? "New" : undefined}
                    meta={meta}
                    onOpen={() => openAlert(a)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={Boolean(selected)}
            onClose={() => setSelected(null)}
            reference={selected?.symbol}
            title={selected?.title ?? ""}
            subtitle={
              selected ? (
                <span className="stagechip" style={{ background: IMPACT_CHIPS[impactOf(selected)].bg, color: IMPACT_CHIPS[impactOf(selected)].fg }}>
                  <span className="d" style={{ background: IMPACT_CHIPS[impactOf(selected)].fg }} />
                  {IMPACT_CHIPS[impactOf(selected)].label}
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