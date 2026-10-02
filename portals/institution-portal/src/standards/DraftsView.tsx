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
import type { StandardDraftsResponse, StandardDraft } from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Drafts — Standards under development */

type StatusFilter = "all" | "draft" | "review" | "final";

const STATUS_ALL = "All statuses";
const STATUS_OPTIONS = [STATUS_ALL, "Draft", "Review", "Final"];

/** Coloured stage-chip for a draft status. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "var(--blue-l)", fg: "#075985", label: "Draft" },
  review: { bg: "var(--gold-l)", fg: "var(--gold-d)", label: "Review" },
  final: { bg: "var(--green-l)", fg: "#166534", label: "Final" },
  // TODO: wire real — contract carries free-text status; map new values here.
  default: { bg: "var(--bg)", fg: "var(--muted)", label: "Draft" },
};

function chipFor(status?: string): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase();
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("review")) return STATUS_CHIPS.review;
  if (key.includes("final") || key.includes("approved")) return STATUS_CHIPS.final;
  if (key.includes("draft") || key.includes("wip")) return STATUS_CHIPS.draft;
  return STATUS_CHIPS.default;
}

/** Bucket a draft into a summary category. */
type Bucket = "review" | "approved" | "rejected";
function bucketFor(d: StandardDraft): Bucket {
  const s = (d.status ?? "").toLowerCase();
  const stage = (d.stage ?? "").toLowerCase();
  const hay = `${s} ${stage}`;
  if (s.includes("reject") || s.includes("declined")) return "rejected";
  if (s.includes("approve") || hay.includes("final")) return "approved";
  return "review";
}

function matchesFilter(d: StandardDraft, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const s = (d.status ?? "").toLowerCase();
  const stage = (d.stage ?? "").toLowerCase();
  const hay = `${s} ${stage}`;
  if (filter === "draft") return hay.includes("draft") || hay.includes("wip");
  if (filter === "review") return hay.includes("review");
  if (filter === "final") return hay.includes("final") || hay.includes("approved");
  return true;
}

export function DraftsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<StandardDraftsResponse>("/standards/drafts", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<StandardDraft | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const summary: SummaryTile[] = useMemo(() => {
    const inReview = items.filter((d) => bucketFor(d) === "review").length;
    const approved = items.filter((d) => bucketFor(d) === "approved").length;
    const rejected = items.filter((d) => bucketFor(d) === "rejected").length;
    return [
      { label: "Total", value: items.length },
      { label: "In review", value: inReview, variant: "due" },
      { label: "Approved", value: approved, variant: "ok" },
      { label: "Rejected", value: rejected, variant: "breach" },
    ];
  }, [items]);

  const filtered = useMemo(
    () => items.filter((d) => matchesFilter(d, statusFilter)),
    [items, statusFilter],
  );

  function toast(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  }

  const filterValue =
    statusFilter === "all"
      ? STATUS_ALL
      : statusFilter === "draft"
        ? "Draft"
        : statusFilter === "review"
          ? "Review"
          : "Final";

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const d = selected as unknown as { [k: string]: unknown };
    return [
      {
        heading: "Content summary",
        content: (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            {readStr(d, "summary") ?? readStr(d, "description") ?? "No content summary available."}
          </p>
        ),
      },
      {
        heading: "Changes",
        content: (
          <KvGrid
            rows={[
              { label: "Version", value: readStr(d, "version") ?? "—" },
              { label: "Stage", value: selected.stage || chipFor(selected.status).label },
              { label: "Sector", value: selected.sector || "—" },
              { label: "Last modified", value: fmtDate(selected.updated) },
            ]}
          />
        ),
      },
      {
        heading: "Reviewer",
        content: (
          <KvGrid
            rows={[
              { label: "Reviewer", value: readStr(d, "reviewer") ?? readStr(d, "assignee") ?? "—" },
              { label: "Reviewed on", value: fmtDate(readStr(d, "reviewed") ?? readStr(d, "reviewed_at")) },
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
        label: "Open editor",
        icon: "i-open" as IconName,
        variant: "gold",
        onClick: () => toast(`Opening draft ${selected.id} — TODO`),
      },
      {
        label: "Copy ref",
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
        label="Loading drafts…"
      >
        <>
          <ModuleHeader
            title="Drafts"
            subtitle="Standards under development — track stages from draft to final approval."
            summary={summary}
          />

          <Toolbar
            filters={[
              {
                label: "Filter drafts by status",
                value: filterValue,
                options: STATUS_OPTIONS,
                onChange: (v) => {
                  if (v === STATUS_ALL) setStatusFilter("all");
                  else if (v === "Draft") setStatusFilter("draft");
                  else if (v === "Review") setStatusFilter("review");
                  else if (v === "Final") setStatusFilter("final");
                },
              },
            ]}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No drafts match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the status filter above."
                  : "Drafts will appear once standards development begins."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((d) => {
                const chip = chipFor(d.status);
                const meta: DataMetaItem[] = [
                  { label: d.id, mono: true },
                  { label: readStr(d as unknown as { [k: string]: unknown }, "version") ?? "v1", tag: true },
                  { label: chip.label },
                  { label: `Updated ${fmtDate(d.updated)}` },
                ];
                return (
                  <DataRow
                    key={d.id}
                    icon="i-file"
                    iconVariant="amber"
                    title={d.title}
                    badge={d.id}
                    meta={meta}
                    onOpen={() => setSelected(d)}
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