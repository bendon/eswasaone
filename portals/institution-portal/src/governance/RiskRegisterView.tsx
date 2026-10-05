import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  FormDrawer,
  Icon,
  RecordDrawer,
  Toast,
  useConfirmAction,
  type DrawerAction,
  type DrawerSection,
  type FormDrawerField,
} from "@eswasaone/shared-ui";
import type { GovernanceRisk, GovernanceRisksResponse } from "../api/types";
import { HeatMap } from "./HeatMap";
import { riskBand, riskScore, trendTone } from "./types";
import { STUB_RISKS } from "./stubs";

const RISK_FIELDS: FormDrawerField[] = [
  { name: "title", label: "Risk title", required: true },
  {
    name: "category",
    label: "Category",
    type: "select",
    options: [
      { value: "Operational", label: "Operational" },
      { value: "Financial", label: "Financial" },
      { value: "Compliance", label: "Compliance" },
      { value: "Strategic", label: "Strategic" },
      { value: "Technology", label: "Technology" },
      { value: "People", label: "People" },
      { value: "Reputational", label: "Reputational" },
      { value: "Governance", label: "Governance" },
    ],
  },
  { name: "owner", label: "Owner", required: true },
];

function parseHeat(heat: string | null): { L?: number; I?: number } {
  if (!heat) return {};
  const [ls, is] = heat.split("-");
  const L = Number(ls);
  const I = Number(is);
  if (!Number.isFinite(L) || !Number.isFinite(I)) return {};
  return { L, I };
}

/** Risk register — GET /governance/risks?L=&I=; heat map syncs with ?heat=. */
export function RiskRegisterView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { confirmAction, host } = useConfirmAction();
  const [params, setParams] = useSearchParams();
  const heatFilter = params.get("heat");
  const { L, I } = parseHeat(heatFilter);

  const risksPath = useMemo(() => {
    const q = new URLSearchParams();
    if (L != null) q.set("L", String(L));
    if (I != null) q.set("I", String(I));
    const qs = q.toString();
    return qs ? `/governance/risks?${qs}` : "/governance/risks";
  }, [L, I]);

  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<GovernanceRisksResponse>(risksPath, {
      enabled: Boolean(user),
      refreshKey: `${sessionKey}:${risksPath}`,
    });

  // Unfiltered list for heat map cell counts
  const allRisks = useApiResource<GovernanceRisksResponse>("/governance/risks", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [flash, setFlash] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (authRequired || allRisks.authRequired) openAuth("Staff sign-in required");
  }, [authRequired, allRisks.authRequired, openAuth]);

  const liveFiltered = data?.items ?? [];
  const liveAll = allRisks.data?.items ?? [];
  // TODO: wire real — drop stubs when Core risk register is populated
  const risks: GovernanceRisk[] = liveFiltered.length
    ? liveFiltered
    : heatFilter
      ? []
      : liveAll.length
        ? liveAll
        : STUB_RISKS;
  const heatRisks: GovernanceRisk[] = liveAll.length ? liveAll : STUB_RISKS;

  const openRisk = [...risks, ...heatRisks].find((r) => r.id === openId) ?? null;

  function onHeatSelect(key: string | null) {
    const next = new URLSearchParams(params);
    if (key) next.set("heat", key);
    else next.delete("heat");
    setParams(next, { replace: true });
  }

  const drawerSections: DrawerSection[] = openRisk
    ? [
        {
          heading: "Rating",
          content: (
            <>
              <div className="kv">
                <b>Owner</b>
                <span>{openRisk.owner || "—"}</span>
              </div>
              <div className="kv">
                <b>Inherent</b>
                <span>
                  Likelihood {openRisk.inherent_likelihood ?? "—"} × impact{" "}
                  {openRisk.inherent_impact ?? "—"}
                  {openRisk.inherent_likelihood != null && openRisk.inherent_impact != null
                    ? ` = ${riskScore(openRisk.inherent_likelihood, openRisk.inherent_impact)}`
                    : ""}
                </span>
              </div>
              <div className="kv">
                <b>Residual</b>
                <span>
                  Likelihood {openRisk.residual_likelihood} × impact {openRisk.residual_impact} ={" "}
                  {openRisk.score}
                </span>
              </div>
              <div className="kv">
                <b>Band</b>
                <span className={`st ${riskBand(openRisk.score).tone}`}>{openRisk.band}</span>
              </div>
              <div className="kv">
                <b>Category</b>
                <span>{openRisk.category || "—"}</span>
              </div>
            </>
          ),
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = openRisk
    ? [
        {
          label: "Post update",
          icon: "i-refresh",
          variant: "gold",
          onClick: () => {
            void (async () => {
              const ok = await confirmAction({
                title: "Post risk update",
                message: `Post a re-rating update for ${openRisk.id}?`,
                ruleId: "R-G9",
                confirmLabel: "Post update",
              });
              // TODO: wire real — POST risk update when contract lands
              if (ok) setFlash(`Risk update: TODO (${openRisk.id})`);
            })();
          },
        },
        {
          label: "Add to pack",
          icon: "i-layers",
          variant: "ghost",
          onClick: () => setFlash(`Add to pack: TODO (${openRisk.id})`),
        },
        {
          label: "Close",
          variant: "ghost",
          onClick: () => setOpenId(null),
        },
      ]
    : [];

  async function onAdd(values: Record<string, string>) {
    const ok = await confirmAction({
      title: "Add risk",
      message: `Add “${values.title}” to the risk register?`,
      ruleId: "R-G10",
      confirmLabel: "Add risk",
    });
    // TODO: wire real — POST /governance/risks when create lands
    if (!ok) return;
    setFlash("Risk logged: TODO");
    setFormOpen(false);
  }

  const subtitle = heatFilter
    ? `${risks.length} risk${risks.length !== 1 ? "s" : ""} at likelihood ${L}, impact ${I}`
    : `${heatRisks.length} open risks`;

  return (
    <ResourceGate
      loading={loading && allRisks.loading}
      refreshing={refreshing || allRisks.refreshing}
      error={error || allRisks.error}
      onRetry={() => {
        void reload();
        void allRisks.reload();
      }}
      hasData={data != null || allRisks.data != null || heatRisks.length > 0}
      skeleton="list"
      label="Loading risk register…"
    >
      <div className="gov">
        {host}
        <Toast message={flash} />

        <div className="grid g-3-2">
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Risk register</h3>
                <p>{subtitle}</p>
              </div>
              <div className="r">
                {heatFilter ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => onHeatSelect(null)}
                  >
                    Clear filter
                  </button>
                ) : null}
                <button type="button" className="btn pri sm" onClick={() => setFormOpen(true)}>
                  <Icon name="i-plus" />
                  Add risk
                </button>
              </div>
            </div>
            <div className="tbl-wrap">
              {risks.length === 0 ? (
                <EmptyState
                  title={heatFilter ? "No risks in this cell" : "Nothing here yet"}
                  detail={
                    heatFilter
                      ? "Clear the heat map filter or select another cell."
                      : "Risks will appear once they are logged."
                  }
                />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Risk</th>
                      <th>Owner</th>
                      <th>Inherent</th>
                      <th>Residual</th>
                      <th>Trend</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risks.map((r) => {
                      const iScore =
                        r.inherent_likelihood != null && r.inherent_impact != null
                          ? riskScore(r.inherent_likelihood, r.inherent_impact)
                          : null;
                      const ib = iScore != null ? riskBand(iScore) : null;
                      const rb = riskBand(r.score);
                      const tr = trendTone(r.trend);
                      return (
                        <tr key={r.id} onClick={() => setOpenId(r.id)}>
                          <td>
                            <div className="t">{r.title}</div>
                            <div className="s">
                              <span className="mono">{r.id}</span>
                              {r.category ? ` · ${r.category}` : ""}
                            </div>
                          </td>
                          <td>{r.owner || "—"}</td>
                          <td>
                            {ib && iScore != null ? (
                              <span className={`st ${ib.tone}`}>
                                {ib.label} {iScore}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span className={`st ${rb.tone}`}>
                              {rb.label} {r.score}
                            </span>
                          </td>
                          <td>
                            <span className={`st ${tr.tone}`}>{tr.label}</span>
                          </td>
                          <td>{r.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Heat map</h3>
                <p>Residual rating. Select a cell to filter.</p>
              </div>
            </div>
            <div className="panel__b">
              <HeatMap risks={heatRisks} selected={heatFilter} onSelect={onHeatSelect} />
            </div>
          </div>
        </div>

        <RecordDrawer
          open={Boolean(openRisk)}
          onClose={() => setOpenId(null)}
          reference={openRisk?.id}
          title={openRisk?.title ?? "Risk"}
          subtitle={openRisk ? `${openRisk.band} · ${openRisk.status}` : null}
          sections={drawerSections}
          actions={drawerActions}
        />

        <FormDrawer
          open={formOpen}
          title="Add risk"
          mode="create"
          fields={RISK_FIELDS}
          onClose={() => setFormOpen(false)}
          onSubmit={onAdd}
        />
      </div>
    </ResourceGate>
  );
}
