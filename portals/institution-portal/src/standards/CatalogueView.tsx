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
import type { StandardsResponse, StandardSummary } from "../api/types";
import { fmtDate, KvGrid, readStr } from "./sub-views";

/** Catalogue — Published standards catalogue */

const DOMAIN_ALL = "All domains";

/** Coloured stage-chip for a published standard status. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  published: { bg: "var(--green-l)", fg: "#166534", label: "Published" },
  active: { bg: "var(--green-l)", fg: "#166534", label: "Active" },
  withdrawn: { bg: "var(--red-l)", fg: "#9f1239", label: "Withdrawn" },
  superseded: { bg: "var(--bg)", fg: "var(--muted)", label: "Superseded" },
  draft: { bg: "var(--blue-l)", fg: "#075985", label: "Draft" },
  // TODO: wire real — contract carries free-text status; map new values here.
  default: { bg: "var(--bg)", fg: "var(--muted)", label: "Published" },
};

function chipFor(status?: string): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase();
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("publish") || key.includes("active")) return STATUS_CHIPS.published;
  if (key.includes("withdraw")) return STATUS_CHIPS.withdrawn;
  if (key.includes("super")) return STATUS_CHIPS.superseded;
  if (key.includes("draft")) return STATUS_CHIPS.draft;
  return STATUS_CHIPS.default;
}

/** Bucket a standard into a summary category. */
type Bucket = "published" | "draft" | "review";
function bucketFor(s: StandardSummary): Bucket {
  const key = (s.status ?? "").toLowerCase();
  if (key.includes("draft")) return "draft";
  if (key.includes("review")) return "review";
  return "published";
}

export function CatalogueView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<StandardsResponse>("/standards", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<string>(DOMAIN_ALL);
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<StandardSummary | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const domains = useMemo(() => {
    const seen = new Set<string>();
    for (const it of items) {
      if (it.sector) seen.add(it.sector);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const summary: SummaryTile[] = useMemo(() => {
    const published = items.filter((s) => bucketFor(s) === "published").length;
    const draft = items.filter((s) => bucketFor(s) === "draft").length;
    const review = items.filter((s) => bucketFor(s) === "review").length;
    return [
      { label: "Total", value: items.length },
      { label: "Published", value: published, variant: "ok" },
      { label: "Draft", value: draft },
      { label: "Under review", value: review, variant: "due" },
    ];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((s) => {
      if (domain !== DOMAIN_ALL && (s.sector ?? "") !== domain) return false;
      if (!q) return true;
      const hay = `${s.code} ${s.title} ${s.sector ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, domain]);

  const domainOptions = useMemo(
    () => [DOMAIN_ALL, ...domains],
    [domains],
  );

  function toast(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  }

  const drawerSections: DrawerSection[] = useMemo(() => {
    if (!selected) return [];
    const s = selected as unknown as { [k: string]: unknown };
    const chip = chipFor(selected.status);
    return [
      {
        heading: "Overview",
        content: (
          <KvGrid
            rows={[
              { label: "Status", value: <span className="stagechip" style={{ background: chip.bg, color: chip.fg }}><span className="d" style={{ background: chip.fg }} />{chip.label}</span> },
              { label: "Sector", value: selected.sector || "—" },
              { label: "ICS classification", value: readStr(s, "ics") ?? readStr(s, "ics_code") ?? "—" },
              { label: "Publication date", value: fmtDate(readStr(s, "published") ?? readStr(s, "publication_date")) },
            ]}
          />
        ),
      },
      {
        heading: "Scope",
        content: (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            {readStr(s, "scope") ?? readStr(s, "description") ?? "No scope summary available."}
          </p>
        ),
      },
      {
        heading: "Acquisition",
        content: (
          <KvGrid
            rows={[
              { label: "Price", value: readStr(s, "price") ?? "—" },
              { label: "Buy link", value: selected.buy_url ? <a href={selected.buy_url} target="_blank" rel="noreferrer">Open e-store ↗</a> : "—" },
            ]}
          />
        ),
      },
    ];
  }, [selected]);

  const drawerActions: DrawerAction[] = useMemo(() => {
    if (!selected) return [];
    const actions: DrawerAction[] = [];
    if (selected.buy_url) {
      actions.push({
        label: "Buy in e-store",
        icon: "i-cart" as IconName,
        variant: "gold",
        onClick: () => window.open(selected.buy_url, "_blank", "noreferrer"),
      });
    }
    actions.push({
      label: "Copy code",
      icon: "i-clip" as IconName,
      variant: "ghost",
      onClick: () => {
        void navigator.clipboard?.writeText(selected.code);
        toast(`Copied ${selected.code}`);
      },
    });
    return actions;
  }, [selected]);

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="list"
        label="Loading catalogue…"
      >
        <>
          <ModuleHeader
            title="Standards Catalogue"
            subtitle="Published ESWASA standards. Search, filter by domain, and link to the e-store."
            summary={summary}
          />

          <Toolbar
            filters={[
              {
                label: "Filter standards by domain",
                value: domain,
                options: domainOptions,
                onChange: setDomain,
              },
            ]}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search by code or title…",
            }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No standards match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search or domain filter above."
                  : "Standards will appear once the catalogue is populated."
              }
            />
          ) : (
            <div className="data-list">
              {filtered.map((s) => {
                const chip = chipFor(s.status);
                const meta: DataMetaItem[] = [
                  { label: s.code, mono: true },
                  { label: s.sector || "Uncategorised", tag: true },
                  { label: chip.label },
                ];
                return (
                  <DataRow
                    key={s.code}
                    icon="i-book"
                    iconVariant="navy"
                    title={s.title}
                    badge={s.code}
                    meta={meta}
                    onOpen={() => setSelected(s)}
                  />
                );
              })}
            </div>
          )}

          <RecordDrawer
            open={Boolean(selected)}
            onClose={() => setSelected(null)}
            reference={selected?.code}
            title={selected?.title ?? ""}
            subtitle={selected?.sector ? <span className="tag">{selected.sector}</span> : undefined}
            sections={drawerSections}
            actions={drawerActions}
          />

          <Toast message={flash} />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}