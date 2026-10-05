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
import type { StandardCommentsResponse, StandardComment } from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Public Comments — Public review comments */

/** Disposition tag → coloured pill. */
const DISPOSITION_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "var(--gold-l)", fg: "var(--gold-d)", label: "Pending" },
  resolved: { bg: "var(--green-l)", fg: "#166534", label: "Resolved" },
  rejected: { bg: "var(--red-l)", fg: "#9f1239", label: "Rejected" },
  // TODO: wire real — contract carries free-text disposition; map new values here.
  default: { bg: "var(--bg)", fg: "var(--muted)", label: "Pending" },
};

function chipFor(disposition?: string | null): { bg: string; fg: string; label: string } {
  if (!disposition) return DISPOSITION_CHIPS.default;
  const key = disposition.toLowerCase();
  if (key in DISPOSITION_CHIPS) return DISPOSITION_CHIPS[key];
  if (key.includes("pending") || key.includes("open")) return DISPOSITION_CHIPS.pending;
  if (key.includes("resolved") || key.includes("accepted") || key.includes("addressed"))
    return DISPOSITION_CHIPS.resolved;
  if (key.includes("reject") || key.includes("declined")) return DISPOSITION_CHIPS.rejected;
  return DISPOSITION_CHIPS.default;
}

/** Bucket a comment into a summary category. */
type Bucket = "pending" | "resolved" | "rejected";
function bucketFor(c: StandardComment): Bucket {
  const disp = readStr(c as unknown as { [k: string]: unknown }, "disposition") ??
    readStr(c as unknown as { [k: string]: unknown }, "status");
  const key = (disp ?? "").toLowerCase();
  if (key.includes("reject") || key.includes("declined")) return "rejected";
  if (key.includes("resolved") || key.includes("accepted") || key.includes("addressed"))
    return "resolved";
  return "pending";
}

export function CommentsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<StandardCommentsResponse>("/standards/comments", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<StandardComment | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const summary: SummaryTile[] = useMemo(() => {
    const pending = items.filter((c) => bucketFor(c) === "pending").length;
    const resolved = items.filter((c) => bucketFor(c) === "resolved").length;
    const rejected = items.filter((c) => bucketFor(c) === "rejected").length;
    return [
      { label: "Total", value: items.length },
      { label: "Pending", value: pending, variant: "due" },
      { label: "Resolved", value: resolved, variant: "ok" },
      { label: "Rejected", value: rejected, variant: "breach" },
    ];
  }, [items]);

  /** Newest-first ordering by date, with search applied first. */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? items.filter((c) => {
          const hay = `${c.author ?? ""} ${c.body ?? ""} ${c.standard ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : items.slice();
    return matched.sort((a, b) => {
      const ta = a.date ? Date.parse(a.date) : NaN;
      const tb = b.date ? Date.parse(b.date) : NaN;
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1; // undated comments sink to the bottom.
      if (Number.isNaN(tb)) return -1;
      return tb - ta; // newest first
    });
  }, [items, search]);

  function toast(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const c = selected as unknown as { [k: string]: unknown };
    const disp = readStr(c, "disposition") ?? readStr(c, "status");
    const chip = chipFor(disp);
    return [
      {
        heading: "Comment",
        content: (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            {selected.body || "No comment text provided."}
          </p>
        ),
      },
      {
        heading: "Response",
        content: (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            {readStr(c, "response") ?? readStr(c, "reply") ?? "No response recorded yet."}
          </p>
        ),
      },
      {
        heading: "Details",
        content: (
          <KvGrid
            rows={[
              { label: "Author", value: selected.author ?? "Anonymous" },
              { label: "On standard", value: selected.standard ?? "—" },
              { label: "Date", value: fmtDate(selected.date) },
              {
                label: "Status",
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
    ];
  }, [selected]);

  const drawerActions: DrawerAction[] = useMemo(() => {
    if (!selected) return [];
    return [
      {
        label: "Reply",
        icon: "i-send" as IconName,
        variant: "gold",
        onClick: () => toast(`Reply to ${selected.author ?? "anonymous"}: TODO`),
      },
      {
        label: "Mark resolved",
        icon: "i-check" as IconName,
        variant: "ghost",
        onClick: () => toast(`Marking comment ${selected.id} resolved: TODO`),
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
        label="Loading comments…"
      >
        <>
          <ModuleHeader
            title="Public Comments"
            subtitle="Public review comments on draft standards, newest first."
            summary={summary}
          />

          <Toolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search author, text or standard…",
            }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No comments match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search above."
                  : "Comments will appear once public review opens."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((c) => {
                const cRec = c as unknown as { [k: string]: unknown };
                const disp = readStr(cRec, "disposition") ?? readStr(cRec, "status");
                const chip = chipFor(disp);
                const meta: DataMetaItem[] = [
                  { label: c.standard ?? "General", tag: true },
                  { label: fmtDate(c.date), mono: true },
                  { label: chip.label },
                ];
                return (
                  <DataRow
                    key={c.id}
                    icon="i-mail"
                    iconVariant="navy"
                    title={c.author || "Anonymous"}
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
            title={selected?.author || "Anonymous comment"}
            subtitle={selected?.standard ? <span className="tag">{selected.standard}</span> : undefined}
            sections={drawerSections}
            actions={drawerActions}
          />

          <Toast message={flash} />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}