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

/** Executive Reports — list of executive reports with filter, search, and a record drawer.
 *  Pulls the shared `/analytics/reports` feed and filters to executive-flavoured reports. */

type TypeFilter = "all" | "this_quarter" | "archived" | "pending";

const FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "this_quarter", label: "This quarter" },
  { value: "archived", label: "Archived" },
  { value: "pending", label: "Pending" },
];

type ReportState = "this_quarter" | "archived" | "pending" | "other";

function stateFor(r: AnalyticsReportSummary): ReportState {
  const s = r as unknown as { [k: string]: unknown };
  const status = readStr(s, "status")?.toLowerCase();
  if (status?.includes("archiv") || status?.includes("retired")) return "archived";
  if (status?.includes("pending") || status?.includes("draft") || status?.includes("queued")) return "pending";
  const period = readStr(s, "period")?.toLowerCase() ?? "";
  if (period.includes("q") || period.includes("quarter") || period.includes("this")) return "this_quarter";
  return "other";
}

export function ExecutiveReportsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<AnalyticsReportsResponse>("/analytics/reports", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnalyticsReportSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  // Executive reports: those whose loose `type`/`category` hints executive, or all
  // when the backend does not distinguish. // TODO: wire real — dedicated exec filter.
  const execItems = useMemo(
    () =>
      items.filter((r) => {
        const s = r as unknown as { [k: string]: unknown };
        const t = (readStr(s, "type") ?? readStr(s, "category") ?? "executive").toLowerCase();
        return t.includes("exec") || t.includes("board") || t.includes("strategy") || t === "executive";
      }).length > 0
        ? items.filter((r) => {
            const s = r as unknown as { [k: string]: unknown };
            const t = (readStr(s, "type") ?? readStr(s, "category") ?? "executive").toLowerCase();
            return t.includes("exec") || t.includes("board") || t.includes("strategy") || t === "executive";
          })
        : items,
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return execItems.filter((r) => {
      if (filter !== "all" && stateFor(r) !== filter) return false;
      if (!q) return true;
      const s = r as unknown as { [k: string]: unknown };
      const hay = `${r.id} ${r.title} ${readStr(s, "type") ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [execItems, filter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    let quarter = 0;
    let archived = 0;
    let pending = 0;
    for (const r of execItems) {
      const st = stateFor(r);
      if (st === "this_quarter") quarter++;
      else if (st === "archived") archived++;
      else if (st === "pending") pending++;
    }
    return [
      { label: "Total", value: execItems.length },
      { label: "This quarter", value: quarter, variant: "ok" },
      { label: "Archived", value: archived },
      { label: "Pending", value: pending, variant: pending ? "due" : "ok" },
    ];
  }, [execItems]);

  function exportPdf() {
    // TODO: wire real — POST /reports/executive/export to render a PDF pack.
    setFlash("PDF export — TODO");
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    return [
      {
        heading: "Report summary",
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
              { label: "Title", value: selected.title },
              { label: "Period", value: selected.period ?? "—" },
              { label: "Type", value: readStr(s, "type") ?? readStr(s, "category") ?? "Executive" },
              { label: "Generated", value: fmtDate(readStr(s, "generated_at") ?? readStr(s, "created_at")) },
              { label: "Author", value: readStr(s, "author") ?? "—" },
            ]}
          />
        ),
      },
      {
        heading: "Download",
        content: (
          <KvGrid
            rows={[
              {
                label: "Download link",
                value: readStr(s, "download_url")
                  ? <a href={readStr(s, "download_url") ?? undefined} target="_blank" rel="noreferrer">Open report ↗</a>
                  : "—",
              },
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
        label="Loading executive reports…"
      >
        <>
          <ModuleHeader
            title="Executive Reports"
            subtitle="High-level executive reports — revenue, plan, and trend."
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
                label: "Filter executive reports",
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
              title={execItems.length ? "No reports match" : "Nothing here yet"}
              detail={
                execItems.length
                  ? "Adjust the search or filter above."
                  : "Reports will appear once they are generated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((r) => {
                const s = r as unknown as { [k: string]: unknown };
                const meta: DataMetaItem[] = [
                  { label: r.period ?? "—", tag: true },
                  { label: readStr(s, "type") ?? readStr(s, "category") ?? "Executive" },
                  { label: fmtDate(readStr(s, "generated_at") ?? readStr(s, "created_at")) },
                ];
                return (
                  <DataRow
                    key={r.id}
                    icon="i-chart"
                    iconVariant="navy"
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