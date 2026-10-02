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
  AnalyticsReportsResponse,
  AnalyticsReportSummary,
} from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Operations Reports — list of operations reports with filter, search, and a record drawer.
 *  Pulls the shared `/analytics/reports` feed and filters to operations-flavoured reports. */

type ReportKind = "daily" | "weekly" | "monthly" | "other";
type KindFilter = "all" | ReportKind;

const FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const KIND_LABEL: Record<ReportKind, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  other: "Report",
};

function kindFor(r: AnalyticsReportSummary): ReportKind {
  const s = r as unknown as { [k: string]: unknown };
  const t = (readStr(s, "type") ?? readStr(s, "frequency") ?? readStr(s, "category") ?? "").toLowerCase();
  const p = (r.period ?? "").toLowerCase();
  if (t.includes("daily") || p.includes("daily")) return "daily";
  if (t.includes("weekly") || p.includes("weekly")) return "weekly";
  if (t.includes("month") || p.includes("month")) return "monthly";
  return "other";
}

export function OperationsReportsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<AnalyticsReportsResponse>("/analytics/reports", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<KindFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnalyticsReportSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  // Operations reports: those whose loose `type`/`category` hints operations, or all
  // when the backend does not distinguish. // TODO: wire real — dedicated ops filter.
  const opsItems = useMemo(() => {
    const hinted = items.filter((r) => {
      const s = r as unknown as { [k: string]: unknown };
      const t = (readStr(s, "type") ?? readStr(s, "category") ?? "").toLowerCase();
      return (
        t.includes("operat") ||
        t.includes("daily") ||
        t.includes("weekly") ||
        t.includes("monthly") ||
        t.includes("metric") ||
        t.includes("throughput")
      );
    });
    return hinted.length > 0 ? hinted : items;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opsItems.filter((r) => {
      if (filter !== "all" && kindFor(r) !== filter) return false;
      if (!q) return true;
      const s = r as unknown as { [k: string]: unknown };
      const hay = `${r.id} ${r.title} ${readStr(s, "type") ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [opsItems, filter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    let daily = 0;
    let weekly = 0;
    let monthly = 0;
    for (const r of opsItems) {
      const k = kindFor(r);
      if (k === "daily") daily++;
      else if (k === "weekly") weekly++;
      else if (k === "monthly") monthly++;
    }
    return [
      { label: "Total", value: opsItems.length },
      { label: "Daily", value: daily },
      { label: "Weekly", value: weekly, variant: "due" },
      { label: "Monthly", value: monthly, variant: "ok" },
    ];
  }, [opsItems]);

  function exportPdf() {
    // TODO: wire real — POST /reports/operations/export to render a PDF pack.
    setFlash("PDF export — TODO");
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const k = kindFor(selected);
    return [
      {
        heading: "Report details",
        content: (
          <KvGrid
            rows={[
              { label: "Title", value: selected.title },
              { label: "Period", value: selected.period ?? "—" },
              { label: "Frequency", value: KIND_LABEL[k] },
              { label: "Generated", value: fmtDate(readStr(s, "generated_at") ?? readStr(s, "created_at")) },
            ]}
          />
        ),
      },
      {
        heading: "Metrics & highlights",
        content: (
          <KvGrid
            rows={[
              { label: "Metrics", value: readStr(s, "metrics") ?? readStr(s, "summary") ?? "—" },
              { label: "Highlights", value: readStr(s, "highlights") ?? "—" },
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
              label: "Export PDF",
              icon: "i-download",
              variant: "gold",
              onClick: exportPdf,
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
        skeleton="panel"
        label="Loading operations reports…"
      >
        <>
          <ModuleHeader
            title="Operations Reports"
            subtitle="Operational KPIs, plan health, and trend."
            summary={summary}
            extra={
              <button type="button" className="btn ghost" onClick={exportPdf}>
                Export PDF
              </button>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter operations reports",
                value: filter,
                options: FILTER_OPTIONS.map((o) => o.label),
                onChange: (v) => {
                  const found = FILTER_OPTIONS.find((o) => o.label === v);
                  setFilter(found ? found.value : "all");
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
              title={opsItems.length ? "No reports match" : "Nothing here yet"}
              detail={
                opsItems.length
                  ? "Adjust the search or filter above."
                  : "Reports will appear once they are generated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((r) => {
                const s = r as unknown as { [k: string]: unknown };
                const k = kindFor(r);
                const meta: DataMetaItem[] = [
                  { label: r.period ?? "—", tag: true },
                  { label: KIND_LABEL[k] },
                  { label: fmtDate(readStr(s, "generated_at") ?? readStr(s, "created_at")) },
                ];
                return (
                  <DataRow
                    key={r.id}
                    icon="i-gauge"
                    iconVariant="amber"
                    title={r.title}
                    badge={r.id}
                    meta={meta}
                    onOpen={() => setSelected(r)}
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
            subtitle={selected?.period ? <span className="tag">{selected.period}</span> : undefined}
            sections={drawerSections}
            actions={drawerActions}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}