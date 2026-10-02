import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  DataRow,
  Icon,
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
  MetrologyResultsResponse,
  MetrologyResult,
} from "../api/types";

/** Results — Calibration results */

type StatusFilter = "all" | "pass" | "fail" | "pending";

/** Coloured stage-chip for a result status. pass=green, fail=red, pending=amber. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  pass: { bg: "var(--green-l)", fg: "#166534", label: "Pass" },
  fail: { bg: "var(--red-l)", fg: "#9f1239", label: "Fail" },
  pending: { bg: "var(--amber-l)", fg: "#92400e", label: "Pending" },
  // TODO: wire real — contract carries free-text status; map new values here.
  default: { bg: "var(--bg)", fg: "var(--muted)", label: "Pending" },
};

function chipFor(status?: string): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase();
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("pass") || key.includes("ok") || key.includes("within") || key.includes("compliant"))
    return STATUS_CHIPS.pass;
  if (key.includes("fail") || key.includes("reject") || key.includes("out") || key.includes("non"))
    return STATUS_CHIPS.fail;
  if (key.includes("pend") || key.includes("wait") || key.includes("wip") || key.includes("progress"))
    return STATUS_CHIPS.pending;
  return STATUS_CHIPS.default;
}

function kindFor(r: MetrologyResult): StatusFilter {
  const s = (r.status ?? "").toLowerCase();
  if (s.includes("fail") || s.includes("reject") || s.includes("out") || s.includes("non"))
    return "fail";
  if (s.includes("pass") || s.includes("ok") || s.includes("within") || s.includes("compliant"))
    return "pass";
  return "pending"; // TODO: wire real — default when status omitted.
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** KV row rendered inside a drawer section. */
function kv(label: string, value: string | null | undefined) {
  return (
    <div className="kv">
      <b>{label}</b>
      <span>{value || "—"}</span>
    </div>
  );
}

const FILTER_OPTIONS = ["All statuses", "Pass", "Fail", "Pending"];

function filterValue(f: StatusFilter): string {
  switch (f) {
    case "all": return "All statuses";
    case "pass": return "Pass";
    case "fail": return "Fail";
    case "pending": return "Pending";
  }
}

function filterFrom(v: string): StatusFilter {
  switch (v) {
    case "Pass": return "pass";
    case "Fail": return "fail";
    case "Pending": return "pending";
    default: return "all";
  }
}

export function ResultsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<MetrologyResultsResponse>("/metrology/results", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const annotated = useMemo(
    () => items.map((r) => ({ r, kind: kindFor(r) })),
    [items],
  );

  const byStatus = useMemo(
    () =>
      statusFilter === "all"
        ? annotated
        : annotated.filter(({ kind }) => kind === statusFilter),
    [annotated, statusFilter],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(({ r }) => {
      const hay = `${r.id} ${r.job ?? ""} ${r.instrument ?? ""} ${r.result ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [byStatus, search]);

  const summary: SummaryTile[] = useMemo(() => {
    const pass = annotated.filter(({ kind }) => kind === "pass").length;
    const fail = annotated.filter(({ kind }) => kind === "fail").length;
    const pending = annotated.filter(({ kind }) => kind === "pending").length;
    return [
      { label: "Total", value: items.length },
      { label: "Pass", value: pass, variant: "ok" },
      { label: "Fail", value: fail, variant: "breach" },
      { label: "Pending", value: pending, variant: "due" },
    ];
  }, [annotated, items.length]);

  const openResult = annotated.find(({ r }) => r.id === openId)?.r ?? null;

  const drawerSections: DrawerSection[] = openResult
    ? [
        {
          heading: "Result details",
          content: (
            <>
              {kv("Result ref", openResult.id)}
              {kv("Job", openResult.job)}
              {kv("Instrument", openResult.instrument)}
              {kv("Parameter", (openResult as MetrologyResult & { parameter?: string | null }).parameter)}
              {kv("Value", openResult.result)}
              {kv("Method", (openResult as MetrologyResult & { method?: string | null }).method)}
              {kv("Uncertainty", (openResult as MetrologyResult & { uncertainty?: string | null }).uncertainty)}
              {kv("Spec limits", (openResult as MetrologyResult & { spec_limits?: string | null }).spec_limits)}
              {kv("Operator", (openResult as MetrologyResult & { operator?: string | null }).operator)}
              {kv("Status", chipFor(openResult.status).label)}
              {kv("Date", fmtDate(openResult.date))}
            </>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = openResult
    ? [
        {
          label: "Download report",
          icon: "i-download",
          variant: "gold",
          onClick: () => {
            // TODO: wire real — GET /metrology/results/{id}/report
            setFlash(`Report download — TODO (${openResult.id})`);
          },
        },
        {
          label: "Close",
          variant: "ghost",
          onClick: () => setOpenId(null),
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
        label="Loading results…"
      >
        <>
          <ModuleHeader
            title="Results"
            subtitle="Calibration results with pass / fail / pending status."
            summary={summary}
          />

          <Toolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search by result, job or instrument…",
            }}
            filters={[
              {
                label: "Filter results by status",
                value: filterValue(statusFilter),
                options: FILTER_OPTIONS,
                onChange: (v) => setStatusFilter(filterFrom(v)),
              },
            ]}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No results match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search or status filter above."
                  : "Results will appear once calibration jobs are completed."
              }
            />
          ) : (
            <div className="data-list" style={{ marginTop: 14 }}>
              {filtered.map(({ r, kind }) => {
                const chip = chipFor(r.status);
                const meta: DataMetaItem[] = [
                  { label: `Job ${r.job || "—"}`, mono: true },
                  { label: r.instrument || "No instrument" },
                  { label: r.result || "—", mono: true },
                  { label: chip.label, tag: true },
                ];
                return (
                  <DataRow
                    key={r.id}
                    icon="i-clipboard"
                    iconVariant={kind === "fail" ? "red" : kind === "pass" ? "green" : "amber"}
                    title={r.id}
                    badge={chip.label}
                    meta={meta}
                    onOpen={() => setOpenId(r.id)}
                    expanded={expandedId === r.id}
                    onToggleExpand={() =>
                      setExpandedId((cur) => (cur === r.id ? null : r.id))
                    }
                    detail={[
                      { label: "Result ref", value: r.id },
                      { label: "Job", value: r.job || "—" },
                      { label: "Instrument", value: r.instrument || "—" },
                      { label: "Value", value: r.result || "—" },
                      { label: "Date", value: fmtDate(r.date) },
                    ]}
                    actions={
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(r.id);
                        }}
                      >
                        <Icon name="i-eye" />
                        View
                      </button>
                    }
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={Boolean(openResult)}
            onClose={() => setOpenId(null)}
            reference={openResult?.id}
            title={openResult?.id ?? "Result"}
            subtitle={openResult ? `Job: ${openResult.job || "—"}` : null}
            sections={drawerSections}
            actions={drawerActions}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}