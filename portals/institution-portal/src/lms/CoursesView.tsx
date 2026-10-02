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
import type { TrainingCoursesResponse, TrainingCourseSummary } from "../api/types";
import { fmtMoney, KvGrid, readStr } from "./sub-views";

/** Courses — Training course catalogue with search, filter, and a record drawer. */

type CourseFilter = "all" | "active" | "draft" | "archived";

const FILTER_OPTIONS: { value: CourseFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

/** Course state derived from `published` + loose contract fields. */
type CourseState = "active" | "draft" | "archived";

function stateFor(c: TrainingCourseSummary): CourseState {
  const s = c as unknown as { [k: string]: unknown };
  const status = readStr(s, "status")?.toLowerCase();
  if (status?.includes("archiv") || status?.includes("expired")) return "archived";
  if (c.published) return "active";
  return "draft";
}

/** stagechip colour pairs for course states. */
const STATE_CHIPS: Record<CourseState, { bg: string; fg: string; label: string }> = {
  active: { bg: "var(--green-l)", fg: "#166534", label: "Active" },
  draft: { bg: "var(--amber-l)", fg: "#92400e", label: "Draft" },
  archived: { bg: "var(--bg)", fg: "var(--muted)", label: "Archived" },
};

function bucketFor(c: TrainingCourseSummary): CourseFilter {
  const st = stateFor(c);
  return st;
}

export function CoursesView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<TrainingCoursesResponse>("/training/courses", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CourseFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrainingCourseSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (filter !== "all" && bucketFor(c) !== filter) return false;
      if (!q) return true;
      const hay = `${c.id} ${c.title}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter, search]);

  const summary: SummaryTile[] = useMemo(() => {
    let active = 0;
    let draft = 0;
    let archived = 0;
    for (const c of items) {
      const st = stateFor(c);
      if (st === "active") active++;
      else if (st === "draft") draft++;
      else archived++;
    }
    return [
      { label: "Total", value: items.length },
      { label: "Active", value: active, variant: "ok" },
      { label: "Draft", value: draft, variant: "due" },
      { label: "Archived", value: archived },
    ];
  }, [items]);

  function newCourse() {
    // TODO: wire real — navigate to course builder
    setFlash("Opening the course editor…");
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const chip = STATE_CHIPS[stateFor(selected)];
    return [
      {
        heading: "Course details",
        content: (
          <KvGrid
            rows={[
              { label: "Code", value: selected.id },
              { label: "Title", value: selected.title },
              {
                label: "State",
                value: (
                  <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}>
                    <span className="d" style={{ background: chip.fg }} />
                    {chip.label}
                  </span>
                ),
              },
              { label: "Category", value: readStr(s, "category") ?? "—" },
            ]}
          />
        ),
      },
      {
        heading: "Description",
        content: (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            {readStr(s, "description") ?? "No description available."}
          </p>
        ),
      },
      {
        heading: "Delivery & pricing",
        content: (
          <KvGrid
            rows={[
              { label: "Duration", value: readStr(s, "duration") ?? "—" },
              { label: "Instructor", value: readStr(s, "instructor") ?? "—" },
              { label: "Price", value: fmtMoney(readStr(s, "price") ? Number(readStr(s, "price")) : null) },
              { label: "Enrollments", value: readStr(s, "enrollments") ?? "—" },
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
              label: "New course",
              icon: "i-plus",
              variant: "gold",
              onClick: newCourse,
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
        label="Loading courses…"
      >
        <>
          <ModuleHeader
            title="Courses"
            subtitle="Training catalogue — publish, draft, and review courses."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={newCourse}>
                New course
              </button>
            }
          />

          <Toolbar
            filters={[
              {
                label: "Filter courses by state",
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
              placeholder: "Search title or course ID…",
            }}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No courses match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the filters above."
                  : "Courses will appear once they are created."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((c) => {
                const st = stateFor(c);
                const chip = STATE_CHIPS[st];
                const s = c as unknown as { [k: string]: unknown };
                const meta: DataMetaItem[] = [
                  { label: c.id, mono: true },
                  { label: readStr(s, "category") ?? "Uncategorised", tag: true },
                  { label: `${readStr(s, "enrollments") ?? "0"} enrolled` },
                  { label: chip.label },
                ];
                return (
                  <DataRow
                    key={c.id}
                    icon="i-cap"
                    iconVariant="navy"
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