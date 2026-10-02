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
import type { StandardBallotsResponse, StandardBallot } from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Ballots — Open, closed and upcoming ballots */

type BallotKind = "open" | "closed" | "upcoming" | "passed";
type StatusFilter = "all" | "open" | "closed" | "upcoming";

const STATUS_ALL = "All ballots";
const STATUS_OPTIONS = [STATUS_ALL, "Open", "Upcoming", "Closed"];

/** Coloured pills for a ballot. open=green, closed=gray, upcoming=amber, passed=green-strong. */
const KIND_CHIP: Record<BallotKind, { bg: string; fg: string; label: string }> = {
  open: { bg: "var(--green-l)", fg: "#166534", label: "Open" },
  closed: { bg: "var(--bg)", fg: "var(--muted)", label: "Closed" },
  upcoming: { bg: "var(--gold-l)", fg: "var(--gold-d)", label: "Upcoming" },
  passed: { bg: "var(--green-l)", fg: "#166534", label: "Passed" },
};

function kindFor(b: StandardBallot): BallotKind {
  const now = Date.now();
  const opens = b.opens ? Date.parse(b.opens) : NaN;
  const closes = b.closes ? Date.parse(b.closes) : NaN;
  const s = (b.status ?? "").toLowerCase();
  if (s.includes("passed") || s.includes("approved")) return "passed";
  if (s.includes("closed") || s.includes("ended")) return "closed";
  if (s.includes("open") || s.includes("active")) {
    if (!Number.isNaN(closes) && closes < now) return "closed";
    return "open";
  }
  if (s.includes("upcoming") || s.includes("scheduled") || s.includes("pending"))
    return "upcoming";
  if (!Number.isNaN(opens) && opens > now) return "upcoming";
  if (!Number.isNaN(closes) && closes < now) return "closed";
  return "open"; // TODO: wire real — default when contract omits dates/status.
}

function matchesFilter(kind: BallotKind, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  // "passed" is treated as "closed" for filtering purposes.
  if (filter === "closed") return kind === "closed" || kind === "passed";
  return kind === filter;
}

export function BallotsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<StandardBallotsResponse>("/standards/ballots", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<StandardBallot | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const annotated = useMemo(
    () => items.map((b) => ({ b, kind: kindFor(b) })),
    [items],
  );

  const summary: SummaryTile[] = useMemo(() => {
    const open = annotated.filter(({ kind }) => kind === "open").length;
    const closed = annotated.filter(({ kind }) => kind === "closed" || kind === "passed").length;
    const passed = annotated.filter(({ kind }) => kind === "passed").length;
    return [
      { label: "Total", value: items.length },
      { label: "Open", value: open, variant: "ok" },
      { label: "Closed", value: closed },
      { label: "Passed", value: passed, variant: "ok" },
    ];
  }, [annotated, items.length]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? annotated : annotated.filter(({ kind }) => matchesFilter(kind, statusFilter))),
    [annotated, statusFilter],
  );

  function toast(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  }

  const filterValue =
    statusFilter === "all"
      ? STATUS_ALL
      : statusFilter === "open"
        ? "Open"
        : statusFilter === "upcoming"
          ? "Upcoming"
          : "Closed";

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const b = selected as unknown as { [k: string]: unknown };
    const kind = kindFor(selected);
    const chip = KIND_CHIP[kind];
    return [
      {
        heading: "Options",
        content: (
          <KvGrid
            rows={[
              { label: "Approve", value: readStr(b, "approve") ?? readStr(b, "yes") ?? "0" },
              { label: "Reject", value: readStr(b, "reject") ?? readStr(b, "no") ?? "0" },
              { label: "Abstain", value: readStr(b, "abstain") ?? "0" },
            ]}
          />
        ),
      },
      {
        heading: "Votes tally",
        content: (
          <KvGrid
            rows={[
              { label: "Total votes", value: readStr(b, "votes") ?? readStr(b, "total_votes") ?? "0" },
              {
                label: "Result",
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
        heading: "Participants",
        content: (
          <KvGrid
            rows={[
              { label: "Eligible", value: readStr(b, "eligible") ?? readStr(b, "participants") ?? "—" },
              { label: "Submitted", value: readStr(b, "submitted") ?? readStr(b, "voters") ?? "—" },
              { label: "Opens", value: fmtDate(selected.opens) },
              { label: "Closes", value: fmtDate(selected.closes) },
            ]}
          />
        ),
      },
    ];
  }, [selected]);

  const drawerActions: DrawerAction[] = useMemo(() => {
    if (!selected) return [];
    const kind = kindFor(selected);
    const actions: DrawerAction[] = [];
    if (kind === "open") {
      actions.push({
        label: "Cast vote",
        icon: "i-check" as IconName,
        variant: "gold",
        onClick: () => toast(`Voting on ${selected.id} — TODO`),
      });
    }
    actions.push({
      label: "Copy ref",
      icon: "i-clip" as IconName,
      variant: "ghost",
      onClick: () => {
        void navigator.clipboard?.writeText(selected.id);
        toast(`Copied ${selected.id}`);
      },
    });
    return actions;
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
        label="Loading ballots…"
      >
        <>
          <ModuleHeader
            title="Ballots"
            subtitle="Open, upcoming and closed member ballots on draft standards."
            summary={summary}
          />

          <Toolbar
            filters={[
              {
                label: "Filter ballots by status",
                value: filterValue,
                options: STATUS_OPTIONS,
                onChange: (v) => {
                  if (v === STATUS_ALL) setStatusFilter("all");
                  else if (v === "Open") setStatusFilter("open");
                  else if (v === "Upcoming") setStatusFilter("upcoming");
                  else if (v === "Closed") setStatusFilter("closed");
                },
              },
            ]}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No ballots match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the status filter above."
                  : "Ballots will appear once voting cycles are scheduled."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map(({ b, kind }) => {
                const chip = KIND_CHIP[kind];
                const standard = readStr(b as unknown as { [k: string]: unknown }, "standard");
                const meta: DataMetaItem[] = [
                  { label: standard ?? "—", tag: true },
                  { label: `${fmtDate(b.opens)} → ${fmtDate(b.closes)}`, mono: true },
                  { label: chip.label },
                ];
                return (
                  <DataRow
                    key={b.id}
                    icon="i-clipboard"
                    iconVariant="navy"
                    title={b.title}
                    badge={b.id}
                    meta={meta}
                    onOpen={() => setSelected(b)}
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
                <span className="stagechip" style={{ background: KIND_CHIP[kindFor(selected)].bg, color: KIND_CHIP[kindFor(selected)].fg }}>
                  <span className="d" style={{ background: KIND_CHIP[kindFor(selected)].fg }} />
                  {KIND_CHIP[kindFor(selected)].label}
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