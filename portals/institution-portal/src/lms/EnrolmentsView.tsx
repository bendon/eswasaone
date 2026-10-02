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
import type { TrainingEnrolmentsResponse, TrainingEnrolmentSummary } from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Enrolments — Course enrolment roster with search, filter, and a record drawer. */

type StatusFilter = "all" | "in_progress" | "completed" | "dropped";

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

type EnrolState = "in_progress" | "completed" | "dropped";

/** Normalise a raw status string into a known bucket for filtering + chips. */
function stateFor(e: TrainingEnrolmentSummary): EnrolState {
  const s = (e.status ?? "").toLowerCase();
  if (s.includes("complete")) return "completed";
  if (s.includes("drop") || s.includes("cancel")) return "dropped";
  if (s.includes("progress") || s.includes("enrol") || s.includes("active")) return "in_progress";
  return "in_progress";
}

/** stagechip colour pairs for each enrolment status. */
const STATE_CHIPS: Record<EnrolState, { bg: string; fg: string; label: string }> = {
  in_progress: { bg: "rgba(59,130,246,0.15)", fg: "#1e40af", label: "In progress" },
  completed: { bg: "rgba(34,197,94,0.15)", fg: "#166534", label: "Completed" },
  dropped: { bg: "rgba(239,68,68,0.15)", fg: "#991b1b", label: "Dropped" },
};

export function EnrolmentsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<TrainingEnrolmentsResponse>("/training/enrolments", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrainingEnrolmentSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (statusFilter !== "all" && stateFor(e) !== statusFilter) return false;
      if (!q) return true;
      const hay = `${e.id} ${e.course} ${e.member ?? ""} ${e.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, statusFilter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    let inProgress = 0;
    let completed = 0;
    let dropped = 0;
    for (const e of items) {
      const st = stateFor(e);
      if (st === "in_progress") inProgress++;
      else if (st === "completed") completed++;
      else dropped++;
    }
    return [
      { label: "Total", value: items.length },
      { label: "In progress", value: inProgress, variant: "due" },
      { label: "Completed", value: completed, variant: "ok" },
      { label: "Dropped", value: dropped, variant: dropped ? "breach" : "ok" },
    ];
  }, [items]);

  function newEnrolment() {
    // TODO: wire real — navigate to enrol wizard
    setFlash("Opening the enrolment form…");
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const chip = STATE_CHIPS[stateFor(selected)];
    return [
      {
        heading: "Enrolment details",
        content: (
          <KvGrid
            rows={[
              { label: "Learner", value: selected.member ?? "—" },
              { label: "Course", value: selected.course },
              {
                label: "Status",
                value: (
                  <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}>
                    <span className="d" style={{ background: chip.fg }} />
                    {chip.label}
                  </span>
                ),
              },
              { label: "Enrolment date", value: fmtDate(readStr(s, "enrolled_at") ?? readStr(s, "enrollment_date")) },
            ]}
          />
        ),
      },
      {
        heading: "Progress & result",
        content: (
          <KvGrid
            rows={[
              { label: "Progress", value: readStr(s, "progress") ?? "—" },
              { label: "Completion", value: fmtDate(readStr(s, "completed_at") ?? readStr(s, "completion_date")) },
              { label: "Score", value: readStr(s, "score") ?? "—" },
              { label: "Certificate", value: readStr(s, "certificate") ?? readStr(s, "certificate_id") ?? "—" },
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
              label: "Enrol member",
              icon: "i-plus",
              variant: "gold",
              onClick: newEnrolment,
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
        label="Loading enrolments…"
      >
        <>
          <ModuleHeader
            title="Enrolments"
            subtitle="Participants registered in training courses."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={newEnrolment}>
                Enrol member
              </button>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter enrolments by status",
                value: statusFilter,
                options: FILTER_OPTIONS.map((o) => o.label),
                onChange: (v) => {
                  const found = FILTER_OPTIONS.find((o) => o.label === v);
                  setStatusFilter(found ? found.value : "all");
                },
              },
            ]}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search member, course or ID…",
            }}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No enrolments match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the filters above."
                  : "Enrolments will appear once members register."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((e) => {
                const st = stateFor(e);
                const chip = STATE_CHIPS[st];
                const s = e as unknown as { [k: string]: unknown };
                const meta: DataMetaItem[] = [
                  { label: e.course, tag: true },
                  { label: e.member ?? "Unassigned" },
                  { label: readStr(s, "progress") ?? "—" },
                  { label: chip.label },
                ];
                return (
                  <DataRow
                    key={e.id}
                    icon="i-users"
                    iconVariant="green"
                    title={e.course}
                    badge={e.id}
                    meta={meta}
                    onOpen={() => setSelected(e)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={Boolean(selected)}
            onClose={() => setSelected(null)}
            reference={selected?.id}
            title={selected?.course ?? ""}
            subtitle={
              selected ? (
                <span className="stagechip" style={{ background: STATE_CHIPS[stateFor(selected)].bg, color: STATE_CHIPS[stateFor(selected)].fg }}>
                  <span className="d" style={{ background: STATE_CHIPS[stateFor(selected)].fg }} />
                  {STATE_CHIPS[stateFor(selected)].label}
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