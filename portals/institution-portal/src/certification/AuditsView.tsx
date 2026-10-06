import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type {
  CertificationAuditsResponse,
  AuditSummary,
} from "../api/types";
import {
  AuthError,
  DataRow,
  ModuleHeader,
  StaffPickerDrawer,
  RecordDrawer,
  Toolbar,
  Toast,
  type SummaryTile,
  type DataMetaItem,
  type DrawerSection,
  type DrawerAction,
  DateField,
} from "@eswasaone/shared-ui";
import { patchAudit } from "./deskApi";

const AUDIT_TYPES = [
  "Stage 1 audit",
  "Stage 2 audit",
  "Initial factory assessment",
  "Ingelo certification assessment",
  "Surveillance audit 1",
  "Surveillance audit 2",
  "Recertification audit",
  "Post-permit inspection & sampling",
  "Special audit (CER_PR_028)",
];

/** Audits — scheduled, completed and overdue audits with SLA tracking. */

type StatusFilter = "all" | "scheduled" | "completed" | "overdue";

/** SLA kind, matching the `.sla` CSS variants (breach / due / ok). */
type SlaKind = "breach" | "due" | "ok";

/** Coloured stage-chip for an audit status. */
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  overdue: "Overdue",
};

function labelFor(status: string): string {
  const key = status.toLowerCase();
  if (key in STATUS_LABELS) return STATUS_LABELS[key];
  if (key.includes("sched")) return STATUS_LABELS.scheduled;
  if (key.includes("complete") || key.includes("done") || key.includes("closed"))
    return STATUS_LABELS.completed;
  if (key.includes("overdue") || key.includes("late") || key.includes("breach"))
    return STATUS_LABELS.overdue;
  return "Pending";
}

/** Derive an SLA indicator from status + due date.
 *  Until the contract carries an explicit SLA signal, infer from dates. */
function slaFor(a: AuditSummary): { kind: SlaKind; text: string } {
  const s = a.status.toLowerCase();
  if (s.includes("complete") || s.includes("done") || s.includes("closed")) {
    return { kind: "ok", text: "done" };
  }
  if (s.includes("overdue") || s.includes("late") || s.includes("breach")) {
    return { kind: "breach", text: "breached" };
  }
  // Scheduled: compare due_date to today.
  const due = a.due_date ? Date.parse(a.due_date) : NaN;
  if (!Number.isNaN(due)) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days = Math.round((due - now.getTime()) / 86_400_000);
    if (days < 0) return { kind: "breach", text: `${Math.abs(days)}d late` };
    if (days <= 7) return { kind: "due", text: `due in ${days}d` };
    return { kind: "ok", text: `in ${days}d` };
  }
  return { kind: "due", text: "pending" }; // TODO: wire real SLA signal
}

function matchesFilter(a: AuditSummary, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const s = a.status.toLowerCase();
  if (filter === "scheduled") return s.includes("sched");
  if (filter === "completed")
    return s.includes("complete") || s.includes("done") || s.includes("closed");
  if (filter === "overdue")
    return s.includes("overdue") || s.includes("late") || s.includes("breach");
  return true;
}

/** Build a simple status timeline from the audit's state. */
function timelineFor(a: AuditSummary): { label: string; state: string }[] {
  const s = a.status.toLowerCase();
  const steps = ["Scheduled", "In progress", "Completed", "Closed"];
  const idx = (() => {
    if (s.includes("closed")) return 3;
    if (s.includes("complete") || s.includes("done")) return 2;
    if (s.includes("overdue") || s.includes("late")) return 1;
    return 0;
  })();
  return steps.map((label, i) => ({
    label,
    state: i < idx ? "done" : i === idx ? "cur" : "todo",
  }));
}

export function AuditsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const [params] = useSearchParams();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<CertificationAuditsResponse>("/certification/audits", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  // Overdue count is fetched separately per the contract's /overdue endpoint.
  const overdue = useApiResource<CertificationAuditsResponse>(
    "/certification/audits/overdue",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [draftDue, setDraftDue] = useState("");
  const [draftType, setDraftType] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function act(
    a: AuditSummary,
    action: "reschedule" | "assign" | "complete",
    payload: Record<string, unknown>,
    ok: string,
  ) {
    setBusy(true);
    try {
      await patchAudit(a.id, action, payload);
      setFlash(ok);
      reload();
      overdue.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  useEffect(() => {
    if (overdue.authRequired) openAuth("Staff sign-in required");
  }, [overdue.authRequired, openAuth]);

  // Deep-link from dashboard: /certification/audits?open=ID&date=YYYY-MM-DD
  useEffect(() => {
    const openId = params.get("open");
    const date = params.get("date");
    if (openId) setOpenRef(openId);
    if (date) setDraftDue(date);
  }, [params]);

  const items = data?.items ?? [];
  const overdueCount = overdue.data?.items?.length ?? 0;

  const filtered = useMemo(
    () => items.filter((a) => matchesFilter(a, statusFilter)),
    [items, statusFilter],
  );

  const selected = items.find((a) => a.id === openRef) ?? null;

  useEffect(() => {
    if (selected && !draftDue) setDraftDue(selected.due_date || "");
  }, [selected, draftDue]);

  const inProgressCount = useMemo(
    () =>
      items.filter((a) => {
        const s = a.status.toLowerCase();
        return (
          s.includes("sched") &&
          !s.includes("complete") &&
          !s.includes("closed")
        );
      }).length,
    [items],
  );
  const completedCount = useMemo(
    () =>
      items.filter((a) => {
        const s = a.status.toLowerCase();
        return (
          s.includes("complete") || s.includes("done") || s.includes("closed")
        );
      }).length,
    [items],
  );

  const summary: SummaryTile[] = [
    { label: "Total", value: items.length },
    { label: "In progress", value: inProgressCount, variant: "due" },
    { label: "Completed", value: completedCount, variant: "ok" },
    { label: "Overdue", value: overdueCount, variant: overdueCount ? "breach" : "ok" },
  ];

  const statusOptions = ["All statuses", "Scheduled", "Completed", "Overdue"];

  function onFilterChange(v: string) {
    const key = v.toLowerCase().replace("all ", "") as StatusFilter;
    setStatusFilter(key === "all" ? "all" : key);
  }

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Details",
          content: (
            <>
              <div className="kv">
                <b>Reference</b>
                <span className="mono">{selected.id}</span>
              </div>
              <div className="kv">
                <b>Application</b>
                <span className="mono">{selected.application_id}</span>
              </div>
              <div className="kv">
                <b>Auditor</b>
                <span>{selected.auditor || "Unassigned"}</span>
              </div>
              <div className="kv">
                <b>Scheme</b>
                <span>{selected.scheme || "—"}</span>
              </div>
              <div className="kv">
                <b>Scheduled date</b>
                <DateField
                  value={draftDue || selected.due_date || ""}
                  onChange={setDraftDue}
                  ariaLabel="Scheduled date"
                  required
                />
              </div>
              <div className="kv">
                <b>Status</b>
                <span className="stagechip">{labelFor(selected.status)}</span>
              </div>
            </>
          ),
        },
        {
          heading: "Scope",
          content: (
            <>
              <div className="kv">
                <b>Scope</b>
                <span>{selected.scheme || "Certification audit"}</span>
              </div>
              <div className="kv">
                <b>Application</b>
                <span>{selected.application_id}</span>
              </div>
            </>
          ),
        },
        {
          heading: "Audit type",
          content: (
            <div className="kv">
              <b>Type</b>
              <select
                className="sel"
                aria-label="Audit type"
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
              >
                <option value="">Per schedule</option>
                {AUDIT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          ),
        },
        {
          heading: "Findings",
          content: (
            <div className="kv">
              <b>Findings</b>
              <span>
                <Link to={`/certification/findings?open=${encodeURIComponent(selected.application_id)}`}>
                  View / raise findings for {selected.application_id}
                </Link>
              </span>
            </div>
          ),
        },
        {
          heading: "Status timeline",
          content: (
            <div className="timeline">
              {timelineFor(selected).map((t) => (
                <div className={`tl-step ${t.state}`} key={t.label}>
                  <span className="tl-dot" />
                  <div>
                    <b>{t.label}</b>
                  </div>
                </div>
              ))}
            </div>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          label: busy ? "…" : "Confirm reschedule",
          variant: "gold",
          disabled: busy || !draftDue,
          onClick: () =>
            void act(
              selected,
              "reschedule",
              { due_date: draftDue, audit_type: draftType || undefined },
              `Rescheduled ${selected.id} to ${draftDue}. The client is notified.`,
            ),
        },
        {
          label: selected.auditor ? "Reassign auditor" : "Assign auditor",
          variant: "pri",
          disabled: busy,
          onClick: () => setPicking(true),
        },
        ...(!/complete|done|closed/i.test(selected.status)
          ? [
              {
                label: "Mark complete",
                variant: "ghost" as const,
                disabled: busy,
                onClick: () => void act(selected, "complete", { audit_type: draftType || undefined }, `${selected.id} marked complete`),
              },
            ]
          : []),
        {
          label: "Close",
          variant: "ghost",
          onClick: () => setOpenRef(null),
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
        label="Loading audits…"
      >
        <>
          <ModuleHeader
            title="Audits"
            subtitle="Scheduled, completed and overdue certification audits."
            summary={summary}
          />

          <Toolbar
            filters={[
              {
                label: "Filter audits by status",
                value: statusOptions[["all", "scheduled", "completed", "overdue"].indexOf(statusFilter)] ?? statusOptions[0],
                options: statusOptions,
                onChange: onFilterChange,
              },
            ]}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title="No audits match"
              detail="Adjust the status filter above."
            />
          ) : (
            <div className="data-list">
              {filtered.map((a) => {
                const sla = slaFor(a);
                const meta: DataMetaItem[] = [
                  { label: a.scheme || a.application_id, tag: true },
                  { label: `Due ${a.due_date || "—"}` },
                  { label: sla.text, sla: sla.kind },
                ];
                return (
                  <DataRow
                    key={a.id}
                    icon="i-clipboard"
                    iconVariant="navy"
                    title={a.scheme || a.application_id}
                    badge={a.id}
                    meta={meta}
                    onOpen={() => setOpenRef(a.id)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={!!selected}
            onClose={() => setOpenRef(null)}
            reference={selected?.id}
            title={selected ? selected.scheme || selected.application_id : ""}
            subtitle={
              selected ? (
                <span className="stagechip">{labelFor(selected.status)}</span>
              ) : null
            }
            sections={drawerSections}
            actions={drawerActions}
          />
          <StaffPickerDrawer
            open={picking}
            title="Assign auditor"
            roleFilter="Certification Auditor"
            onClose={() => setPicking(false)}
            onPick={(staff) => {
              setPicking(false);
              if (selected)
                void act(
                  selected,
                  "assign",
                  {
                    auditor: staff.email || staff.username,
                    auditor_name: staff.full_name,
                  },
                  `${staff.full_name || staff.username} assigned to ${selected.id}`,
                );
            }}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}