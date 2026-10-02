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
  MetrologyInstrumentsResponse,
  MetrologyInstrument,
} from "../api/types";

/** Instruments — Registered instruments */

type StatusFilter = "all" | "active" | "due" | "out_of_service";

/** Coloured stage-chip for an instrument status. */
const STATUS_CHIPS: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: "var(--green-l)", fg: "#166534", label: "Active" },
  due: { bg: "var(--amber-l)", fg: "#92400e", label: "Calibration due" },
  out_of_service: { bg: "var(--red-l)", fg: "#9f1239", label: "Out of service" },
  // TODO: wire real — contract carries free-text status; map new values here.
  default: { bg: "var(--blue-l)", fg: "#075985", label: "Active" },
};

function chipFor(status?: string): { bg: string; fg: string; label: string } {
  if (!status) return STATUS_CHIPS.default;
  const key = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (key in STATUS_CHIPS) return STATUS_CHIPS[key];
  if (key.includes("due") || key.includes("expir") || key.includes("overdue"))
    return STATUS_CHIPS.due;
  if (key.includes("out") || key.includes("down") || key.includes("fault") || key.includes("broken"))
    return STATUS_CHIPS.out_of_service;
  if (key.includes("active") || key.includes("ok") || key.includes("ready") || key.includes("calibrated"))
    return STATUS_CHIPS.active;
  return STATUS_CHIPS.default;
}

/** Derived kind for filtering + KPIs. */
function kindFor(inst: MetrologyInstrument): StatusFilter {
  const s = (inst.status ?? "").toLowerCase();
  if (s.includes("out") || s.includes("down") || s.includes("fault") || s.includes("broken"))
    return "out_of_service";
  if (s.includes("due") || s.includes("expir") || s.includes("overdue")) return "due";
  // Fall back to next_calibration date arithmetic.
  if (inst.next_calibration) {
    const t = Date.parse(inst.next_calibration);
    if (!Number.isNaN(t)) {
      const days = (t - Date.now()) / 86_400_000;
      if (days < 0) return "due";
      if (days <= 14) return "due";
    }
  }
  return "active"; // TODO: wire real — default when status omitted.
}

/** SLA pill kind for next-calibration proximity. */
function slaFor(inst: MetrologyInstrument): "ok" | "due" | "breach" {
  const kind = kindFor(inst);
  if (kind === "out_of_service") return "breach";
  if (kind === "due") return "due";
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

const FILTER_OPTIONS = ["All statuses", "Active", "Calibration due", "Out of service"];

function filterValue(f: StatusFilter): string {
  switch (f) {
    case "all": return "All statuses";
    case "active": return "Active";
    case "due": return "Calibration due";
    case "out_of_service": return "Out of service";
  }
}

function filterFrom(v: string): StatusFilter {
  switch (v) {
    case "Active": return "active";
    case "Calibration due": return "due";
    case "Out of service": return "out_of_service";
    default: return "all";
  }
}

export function InstrumentsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing, error,
    authRequired,
    reload,
  } = useApiResource<MetrologyInstrumentsResponse>("/metrology/instruments", {
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
    () => items.map((i) => ({ i, kind: kindFor(i) })),
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
    return byStatus.filter(({ i }) => {
      const hay = `${i.id} ${i.name} ${i.serial ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [byStatus, search]);

  const summary: SummaryTile[] = useMemo(() => {
    const calibrated = annotated.filter(({ kind }) => kind === "active").length;
    const due = annotated.filter(({ kind }) => kind === "due").length;
    const overdue = annotated.filter(({ kind }) => kind === "out_of_service").length;
    return [
      { label: "Total", value: items.length },
      { label: "Calibrated", value: calibrated, variant: "ok" },
      { label: "Due soon", value: due, variant: "due" },
      { label: "Overdue", value: overdue, variant: "breach" },
    ];
  }, [annotated, items.length]);

  const openInst = annotated.find(({ i }) => i.id === openId)?.i ?? null;

  const drawerSections: DrawerSection[] = openInst
    ? [
        {
          heading: "Instrument details",
          content: (
            <>
              {kv("Asset tag", openInst.id)}
              {kv("Name", openInst.name)}
              {kv("Serial", openInst.serial)}
              {kv("Location", (openInst as MetrologyInstrument & { location?: string | null }).location)}
              {kv("Range", (openInst as MetrologyInstrument & { range?: string | null }).range)}
              {kv("Calibration status", chipFor(openInst.status).label)}
              {kv("Last calibrated", fmtDate(openInst.last_calibrated))}
              {kv("Next calibration", fmtDate(openInst.next_calibration))}
              {kv("Certificate", (openInst as MetrologyInstrument & { certificate?: string | null }).certificate)}
            </>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = openInst
    ? [
        {
          label: "Schedule calibration",
          icon: "i-clock",
          variant: "gold",
          onClick: () => {
            // TODO: wire real — POST /metrology/instruments/{id}/calibrate
            setFlash(`Schedule calibration — TODO (${openInst.id})`);
          },
        },
        {
          label: "Close",
          variant: "ghost",
          onClick: () => setOpenId(null),
        },
      ]
    : [];

  function registerInstrument() {
    // TODO: wire real — open a Register Instrument composer.
    setFlash("Register instrument composer — TODO");
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
        label="Loading instruments…"
      >
        <>
          <ModuleHeader
            title="Instruments"
            subtitle="Registered metrology instruments with calibration status."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={registerInstrument}>
                <Icon name="i-plus" />
                Register instrument
              </button>
            }
          />

          <Toolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search by name or ID…",
            }}
            filters={[
              {
                label: "Filter instruments by status",
                value: filterValue(statusFilter),
                options: FILTER_OPTIONS,
                onChange: (v) => setStatusFilter(filterFrom(v)),
              },
            ]}
          />

          <Toast message={flash} />

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length ? "No instruments match" : "Nothing here yet"}
              detail={
                items.length
                  ? "Adjust the search or status filter above."
                  : "Instruments will appear once they are registered."
              }
            />
          ) : (
            <div className="data-list" style={{ marginTop: 14 }}>
              {filtered.map(({ i, kind }) => {
                const chip = chipFor(i.status);
                const sla = slaFor(i);
                const meta: DataMetaItem[] = [
                  { label: i.id, mono: true },
                  { label: `Next: ${fmtDate(i.next_calibration)}` },
                  { label: chip.label, tag: true },
                  { label: sla === "breach" ? "Overdue" : sla === "due" ? "Due soon" : "On track", sla },
                ];
                return (
                  <DataRow
                    key={i.id}
                    icon="i-gauge"
                    iconVariant={kind === "out_of_service" ? "red" : kind === "due" ? "amber" : "green"}
                    title={i.name}
                    badge={i.serial ? `S/N ${i.serial}` : undefined}
                    meta={meta}
                    onOpen={() => setOpenId(i.id)}
                    expanded={expandedId === i.id}
                    onToggleExpand={() =>
                      setExpandedId((cur) => (cur === i.id ? null : i.id))
                    }
                    detail={[
                      { label: "Asset tag", value: i.id },
                      { label: "Serial", value: i.serial || "—" },
                      { label: "Last calibrated", value: fmtDate(i.last_calibrated) },
                      { label: "Next calibration", value: fmtDate(i.next_calibration) },
                    ]}
                    actions={
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(i.id);
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
            open={Boolean(openInst)}
            onClose={() => setOpenId(null)}
            reference={openInst?.id}
            title={openInst?.name ?? "Instrument"}
            subtitle={openInst ? `Serial: ${openInst.serial || "—"}` : null}
            sections={drawerSections}
            actions={drawerActions}
          />
        </>
      </ResourceGate>
    </RequireStaff>
  );
}