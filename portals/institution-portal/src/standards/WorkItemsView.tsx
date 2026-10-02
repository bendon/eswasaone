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
  type IconName,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import type {
  StandardWorkItemsResponse,
  StandardWorkItem,
} from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Work Items — Active TC/SC work items */

type StatusFilter = "all" | "active" | "paused" | "done";

const STATUS_ALL = "All statuses";
const STATUS_OPTIONS = [STATUS_ALL, "Active", "Paused", "Completed"];

/** Coloured stage-chip for a work-item status. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: "var(--green-l)", fg: "#166534", label: "Active" },
  paused: { bg: "var(--gold-l)", fg: "var(--gold-d)", label: "Paused" },
  done: { bg: "var(--bg)", fg: "var(--muted)", label: "Completed" },
  // TODO: wire real — contract carries free-text status; map new values here.
  default: { bg: "var(--blue-l)", fg: "#075985", label: "Active" },
};

function chipFor(status?: string): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase();
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("active") || key.includes("open") || key.includes("progress"))
    return STATUS_CHIPS.active;
  if (key.includes("pause") || key.includes("hold") || key.includes("blocked"))
    return STATUS_CHIPS.paused;
  if (key.includes("done") || key.includes("complete") || key.includes("closed"))
    return STATUS_CHIPS.done;
  return STATUS_CHIPS.default;
}

/** Bucket a work item into a summary category. */
type Bucket = "active" | "withdrawn" | "published";
function bucketFor(w: StandardWorkItem): Bucket {
  const s = (w.status ?? "").toLowerCase();
  if (s.includes("withdraw") || s.includes("cancelled") || s.includes("canceled"))
    return "withdrawn";
  if (s.includes("publish") || s.includes("done") || s.includes("complete") || s.includes("closed"))
    return "published";
  return "active";
}

function matchesFilter(w: StandardWorkItem, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const s = (w.status ?? "").toLowerCase();
  if (filter === "active")
    return s.includes("active") || s.includes("open") || s.includes("progress");
  if (filter === "paused") return s.includes("pause") || s.includes("hold") || s.includes("blocked");
  if (filter === "done") return s.includes("done") || s.includes("complete") || s.includes("closed");
  return true;
}

export function WorkItemsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<StandardWorkItemsResponse>("/standards/workitems", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<StandardWorkItem | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const summary: SummaryTile[] = useMemo(() => {
    const active = items.filter((w) => bucketFor(w) === "active").length;
    const withdrawn = items.filter((w) => bucketFor(w) === "withdrawn").length;
    const published = items.filter((w) => bucketFor(w) === "published").length;
    return [
      { label: "Total", value: items.length },
      { label: "Active", value: active, variant: "ok" },
      { label: "Withdrawn", value: withdrawn, variant: "breach" },
      { label: "Published", value: published },
    ];
  }, [items]);

  const filtered = useMemo(
    () => items.filter((w) => matchesFilter(w, statusFilter)),
    [items, statusFilter],
  );

  function toast(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  }

  const filterValue =
    statusFilter === "all"
      ? STATUS_ALL
      : statusFilter === "active"
        ? "Active"
        : statusFilter === "paused"
          ? "Paused"
          : "Completed";

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const w = selected as unknown as { [k: string]: unknown };
    const commentsCount = readStr(w, "comments_count") ?? readStr(w, "comments") ?? "0";
    return [
      {
        heading: "Description",
        content: (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            {readStr(w, "description") ?? readStr(w, "scope") ?? "No description available."}
          </p>
        ),
      },
      {
        heading: "Timeline",
        content: (
          <KvGrid
            rows={[
              { label: "Stage", value: readStr(w, "stage") ?? chipFor(selected.status).label },
              { label: "Started", value: fmtDate(readStr(w, "started") ?? readStr(w, "created")) },
              { label: "Target", value: fmtDate(readStr(w, "target") ?? readStr(w, "due")) },
              { label: "Last update", value: fmtDate(readStr(w, "updated")) },
            ]}
          />
        ),
      },
      {
        heading: "Engagement",
        content: (
          <KvGrid
            rows={[
              { label: "Assignee", value: selected.assignee ?? "Unassigned" },
              { label: "Comments", value: commentsCount },
            ]}
          />
        ),
      },
    ];
  }, [selected]);

  const drawerActions: DrawerAction[] = useMemo(() => {
    if (!selected) return [];
    return [
      {
        label: "Open in editor",
        icon: "i-open" as IconName,
        variant: "gold",
        onClick: () => toast(`Opening work item ${selected.id} — TODO`),
      },
      {
        label: "Copy reference",
        icon: "i-clip" as IconName,
        variant: "ghost",
        onClick: () => {
          void navigator.clipboard?.writeText(selected.id);
          toast(`Copied ${selected.id}`);
        },
      },
    ];
  }, [selected, toast]);

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading work items…"
      >
        <>
          <ModuleHeader
            title="Work Items"
            subtitle="Active technical committee / sub-committee work items and their assignees."
            summary={summary}
          />

          <Toolbar
            filters={[
              {
                label: "Filter work items by status",
                value: filterValue,
                options: STATUS_OPTIONS,
                onChange: (v) => {
                  if (v === STATUS_ALL) setStatusFilter("all");
                  else if (v === "Active") setStatusFilter("active");
                  else if (v === "Paused") setStatusFilter("paused");
                  else if (v === "Completed") setStatusFilter("done");
                },
              },
            ]}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No work items match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the status filter above."
                  : "Work items will appear once committees start drafting."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((w) => {
                const chip = chipFor(w.status);
                const meta: DataMetaItem[] = [
                  { label: w.id, mono: true },
                  { label: chip.label, tag: true },
                  { label: w.assignee ?? "Unassigned" },
                ];
                return (
                  <DataRow
                    key={w.id}
                    icon="i-layers"
                    iconVariant="purple"
                    title={w.title}
                    badge={w.id}
                    meta={meta}
                    onOpen={() => setSelected(w)}
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
              ) : undefined
            }
            sections={drawerSections}
            actions={drawerActions}
          />

          <Toast message={flash} />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}