import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  Icon,
  ModuleHeader,
  Toast,
  type IconName,
  type SummaryTile,
} from "@eswasaone/shared-ui";
import type { CrmPipeline } from "../api/types";

/** CRM Pipeline — stages, company count, and a visual pipeline bar.
 *  Kanban-style distribution kept; wrapped in the shared `ModuleHeader`. */

/** Distinct colours cycled across pipeline stages for the bar segments. */
const STAGE_COLORS = [
  "#2563eb", // blue
  "#0891b2", // cyan
  "#7c3aed", // violet
  "#db2777", // pink
  "#ea580c", // orange
  "#16a34a", // green
  "#ca8a04", // gold
  "#475569", // slate
];

/** Icons cycled across stage KPI cards for visual variety. */
const ICONS_BY_INDEX: IconName[] = [
  "i-spark",
  "i-phone",
  "i-check",
  "i-award",
  "i-chart",
  "i-users",
  "i-star",
  "i-trend",
];

type PipelineStage = { name: string; count: number };

export function CrmPipelineView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { data, loading, refreshing, error, authRequired, reload } = useApiResource<CrmPipeline>(
    "/crm/pipeline",
    { enabled: Boolean(user), refreshKey: sessionKey },
  );

  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const stages: PipelineStage[] = data?.stages ?? [];
  const totalLeads = useMemo(
    () => stages.reduce((sum, s) => sum + (s.count ?? 0), 0),
    [stages],
  );

  const summary: SummaryTile[] = useMemo(() => {
    const tiles: SummaryTile[] = [
      { label: "Companies", value: data?.companies ?? 0 },
      { label: "Total leads", value: totalLeads },
    ];
    const top = stages.slice(0, 2);
    for (const t of top) {
      tiles.push({ label: t.name, value: t.count });
    }
    return tiles;
  }, [data?.companies, totalLeads, stages]);

  function newLead() {
    // TODO: wire real — route to /institution/crm/leads?new=1 or open create drawer
    setFlash("New lead form coming soon");
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="dashboard"
        label="Loading pipeline…"
      >
        {data ? (
        <>
          <ModuleHeader
            title="CRM pipeline"
            subtitle="Where every lead and deal sits across the funnel."
            summary={summary}
            extra={
              <button type="button" className="btn gold" onClick={newLead}>
                New lead
              </button>
            }
          />

          <Toast message={flash} />

          <section
            className="kpis"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
          >
            {stages.map((s, i) => {
              const color = STAGE_COLORS[i % STAGE_COLORS.length];
              return (
                <div className="kpi" key={s.name}>
                  <div className="kpi__top">
                    <span className="kpi__label">{s.name}</span>
                    <span className="kpi__ic" style={{ background: color }}>
                      <Icon name={(ICONS_BY_INDEX[i % ICONS_BY_INDEX.length] ?? "i-chart") as IconName} />
                    </span>
                  </div>
                  <div className="kpi__val">{s.count.toLocaleString()}</div>
                </div>
              );
            })}
          </section>

          {/* Visual pipeline bar — stages rendered as proportional coloured segments. */}
          {stages.length > 0 ? (
            <div
              className="panel"
              style={{ padding: 20, marginTop: 20, borderRadius: 14 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Pipeline distribution</h3>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {totalLeads.toLocaleString()} lead{totalLeads === 1 ? "" : "s"} across {stages.length} stage{stages.length === 1 ? "" : "s"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: 14,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                }}
                role="img"
                aria-label="Pipeline stage distribution"
              >
                {totalLeads > 0 ? (
                  stages.map((s, i) => {
                    const pct = (s.count / totalLeads) * 100;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={s.name}
                        title={`${s.name}: ${s.count}`}
                        style={{
                          width: `${pct}%`,
                          background: STAGE_COLORS[i % STAGE_COLORS.length],
                          transition: "width 0.3s ease",
                        }}
                      />
                    );
                  })
                ) : (
                  <div style={{ margin: "auto", color: "var(--muted)", fontSize: 12 }}>
                    No leads in pipeline
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "14px 22px",
                  marginTop: 14,
                }}
              >
                {stages.map((s, i) => {
                  const color = STAGE_COLORS[i % STAGE_COLORS.length];
                  const pct = totalLeads > 0 ? Math.round((s.count / totalLeads) * 100) : 0;
                  return (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ color: "var(--muted)" }}>
                        {s.count.toLocaleString()} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <EmptyState
                title="No stages configured"
                detail="Pipeline stages will appear once the backend is populated."
              />
            </div>
          )}
        </>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}