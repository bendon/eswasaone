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
  MetrologyJobsResponse,
  MetrologyJobSummary,
} from "../api/types";

/** Jobs — Calibration and test jobs */

type StatusFilter = "all" | "pending" | "in_progress" | "completed" | "overdue";

/** Coloured stage-chip for a job status. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "var(--gold-l)", fg: "var(--gold-d)", label: "Pending" },
  in_progress: { bg: "var(--blue-l)", fg: "#075985", label: "In Progress" },
  completed: { bg: "var(--green-l)", fg: "#166534", label: "Completed" },
  overdue: { bg: "var(--red-l)", fg: "#9f1239", label: "Overdue" },
  // TODO: wire real — contract carries free-text status; map new values here.
  default: { bg: "var(--bg)", fg: "var(--muted)", label: "Pending" },
};

function chipFor(status?: string): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("progress") || key.includes("active") || key.includes("wip"))
    return STATUS_CHIPS.in_progress;
  if (key.includes("complete") || key.includes("done") || key.includes("closed"))
    return STATUS_CHIPS.completed;
  if (key.includes("overdue") || key.includes("late")) return STATUS_CHIPS.overdue;
  if (key.includes("pending") || key.includes("queued") || key.includes("waiting"))
    return STATUS_CHIPS.pending;
  return STATUS_CHIPS.default;
}

/** Derived job kind (used for both filter + KPIs). */
function kindFor(job: MetrologyJobSummary): StatusFilter {
  const s = (job.status ?? "").toLowerCase();
  if (s.includes("overdue") || s.includes("late")) return "overdue";
  if (s.includes("progress") || s.includes("active") || s.includes("wip"))
    return "in_progress";
  if (s.includes("complete") || s.includes("done") || s.includes("closed"))
    return "completed";
  if (s.includes("pending") || s.includes("queued") || s.includes("waiting"))
    return "pending";
  // Fall back to due-date arithmetic when status text is ambiguous.
  if (job.due_date) {
    const t = Date.parse(job.due_date);
    if (!Number.isNaN(t) && t < Date.now() && !s.includes("complete"))
      return "overdue";
  }
  return "pending"; // TODO: wire real — default when contract omits status/dates.
}

/** Due-date SLA pill kind. */
type SlaKind = "ok" | "due" | "breach";
const SLA_LABEL: Record<SlaKind, string> = {
  ok: "On track",
  due: "Due soon",
  breach: "Overdue",
};

function slaFor(job: MetrologyJobSummary): SlaKind {
  const kind = kindFor(job);
  if (kind === "overdue") return "breach";
  if (kind === "completed") return "ok";
  if (!job.due_date) return "ok";
  const t = Date.parse(job.due_date);
  if (Number.isNaN(t)) return "ok";
  const days = (t - Date.now()) / 86_400_000;
  if (days < 0) return "breach";
  if (days <= 7) return "due";
  return "ok";
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

const FILTER_OPTIONS = [
  "All statuses",
  "Pending",
  "In progress",
  "Completed",
  "Overdue",
];

function filterValue(f: StatusFilter): string {
  switch (f) {
    case "all": return "All statuses";
    case "pending": return "Pending";
    case "in_progress": return "In progress";
    case "completed": return "Completed";
    case "overdue": return "Overdue";
  }
}

function filterFrom(v: string): StatusFilter {
  switch (v) {
    case "Pending": return "pending";
    case "In progress": return "in_progress";
    case "Completed": return "completed";
    case "Overdue": return "overdue";
    default: return "all";
  }
}

export function JobsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<MetrologyJobsResponse>("/metrology/jobs", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const annotated = useMemo(
    () => items.map((j) => ({ j, kind: kindFor(j) })),
    [items],
  );

  const summary: SummaryTile[] = useMemo(() => {
    const inProgress = annotated.filter(({ kind }) => kind === "in_progress").length;
    const completed = annotated.filter(({ kind }) => kind === "completed").length;
    const overdue = annotated.filter(({ kind }) => kind === "overdue").length;
    return [
      { label: "Total", value: items.length },
      { label: "In progress", value: inProgress },
      { label: "Completed", value: completed, variant: "ok" },
      { label: "Overdue", value: overdue, variant: "breach" },
    ];
  }, [annotated, items.length]);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? annotated
        : annotated.filter(({ kind }) => kind === statusFilter),
    [annotated, statusFilter],
  );

  const openJob = annotated.find(({ j }) => j.id === openId)?.j ?? null;

  const drawerSections: DrawerSection[] = openJob
    ? [
        {
          heading: "Job details",
          content: (
            <>
              {kv("Job ID", openJob.id)}
              {kv("Instrument / sample", openJob.instrument)}
              {kv("Test type", openJob.status)}
              {kv("Customer / client", openJob.customer)}
              {kv("Method", (openJob as MetrologyJobSummary & { method?: string | null }).method)}
              {kv("Results summary", (openJob as MetrologyJobSummary & { results?: string | null }).results)}
              {kv("Due date", fmtDate(openJob.due_date))}
            </>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = openJob
    ? [
        {
          label: "Generate certificate",
          icon: "i-award",
          variant: "gold",
          onClick: () => {
            // TODO: wire real — POST /metrology/jobs/{job}/certificate
            setFlash(`Certificate generation — TODO (job ${openJob.id})`);
          },
        },
        {
          label: "Close",
          variant: "ghost",
          onClick: () => setOpenId(null),
        },
      ]
    : [];

  function newJob() {
    // TODO: wire real — open a New Job composer / navigate to job form.
    setFlash("New job composer — TODO");
  }

  function generateCertificate(job: MetrologyJobSummary) {
    // TODO: wire real — POST /metrology/jobs/{job}/certificate
    setFlash(`Certificate generation — TODO (job ${job.id})`);
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading jobs…"
      >
        <>
          <ModuleHeader
            title="Jobs"
            subtitle="Calibration and test jobs — track due dates and generate certificates."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={newJob}>
                <Icon name="i-plus" />
                New job
              </button>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter jobs by status",
                value: filterValue(statusFilter),
                options: FILTER_OPTIONS,
                onChange: (v) => setStatusFilter(filterFrom(v)),
              },
            ]}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No jobs match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the status filter above."
                  : "Jobs will appear once calibration work is scheduled."
              }
            />
          ) : (
            <div className="data-list" style={{ marginTop: 14 }}>
              {filtered.map(({ j, kind }) => {
                const chip = chipFor(j.status);
                const sla = slaFor(j);
                const meta: DataMetaItem[] = [
                  { label: `Sample ${j.instrument}`, mono: false },
                  { label: j.customer || "No customer" },
                  { label: chip.label, tag: true },
                ];
                if (kind !== "completed") {
                  meta.push({ label: SLA_LABEL[sla], sla: sla });
                }
                return (
                  <DataRow
                    key={j.id}
                    icon="i-clipboard"
                    iconVariant={kind === "overdue" ? "red" : kind === "in_progress" ? "navy" : kind === "completed" ? "green" : "amber"}
                    title={j.instrument}
                    badge={j.id}
                    meta={meta}
                    onOpen={() => setOpenId(j.id)}
                    expanded={expandedId === j.id}
                    onToggleExpand={() =>
                      setExpandedId((cur) => (cur === j.id ? null : j.id))
                    }
                    detail={[
                      { label: "Job ID", value: j.id },
                      { label: "Customer", value: j.customer || "—" },
                      { label: "Status", value: chip.label },
                      { label: "Due date", value: fmtDate(j.due_date) },
                    ]}
                    actions={
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateCertificate(j);
                        }}
                      >
                        <Icon name="i-award" />
                        Certificate
                      </button>
                    }
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={Boolean(openJob)}
            onClose={() => setOpenId(null)}
            reference={openJob?.id}
            title={openJob?.instrument ?? "Job"}
            subtitle={openJob ? `Customer: ${openJob.customer || "—"}` : null}
            sections={drawerSections}
            actions={drawerActions}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}