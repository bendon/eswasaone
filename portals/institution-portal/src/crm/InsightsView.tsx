import { Link } from "react-router-dom";
import { ModuleHeader } from "@eswasaone/shared-ui";
import {
  SERVICE_LABEL,
  caseSla,
  fmtE,
  fmtShortE,
  getCrmConfig,
  insights,
  listCases,
  listClients,
  listOpportunities,
  useCrm,
  type CaseType,
  type Region,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, Kpi, STAGE_LABEL } from "./shared";

const REGIONS: Region[] = ["Hhohho", "Manzini", "Lubombo", "Shiselweni"];

/** Insights — complaint patterns for the Quality Manager and Board, plus commercial performance. */
export function CrmInsightsView() {
  const res = useCrm(async () => {
    const [cases, opps, clients, cfg] = await Promise.all([listCases({ includeAppeals: true }), listOpportunities(), listClients(), getCrmConfig()]);
    return { cases, opps, clients, cfg };
  });

  return (
    <CrmGate res={res} what="Insights" skeleton="dashboard">
      {({ cases, opps, clients, cfg }) => {
        const ins = insights(cases, opps, cfg);
        const resolved = cases.filter((c) => c.resolved_at);
        const slaByType = (Object.keys(cfg.case_types) as CaseType[])
          .map((t) => {
            const rows = resolved.filter((c) => c.type === t);
            const met = rows.filter((c) => caseSla(c, cfg.case_types[t]).status !== "breach").length;
            return { t, total: rows.length, pct: rows.length ? Math.round((met / rows.length) * 100) : null };
          })
          .filter((x) => x.total > 0);
        const overallMet = resolved.length
          ? Math.round((resolved.filter((c) => caseSla(c, cfg.case_types[c.type]).status !== "breach").length / resolved.length) * 100)
          : null;
        const csatDist = [5, 4, 3, 2, 1].map((s) => ({ s, n: cases.filter((c) => c.csat?.score === s).length }));
        const maxCsat = Math.max(1, ...csatDist.map((x) => x.n));
        const sectors = [...new Set(ins.heat.map((h) => h.sector))].sort();
        const maxHeat = Math.max(1, ...ins.heat.map((h) => h.count));
        const lostReasons = Object.entries(
          opps.filter((o) => o.stage === "lost" && o.lost_reason).reduce<Record<string, number>>((m, o) => ({ ...m, [o.lost_reason!]: (m[o.lost_reason!] ?? 0) + 1 }), {}),
        );
        const byStage = (["qualify", "proposal", "negotiation"] as const).map((s) => ({ s, v: opps.filter((o) => o.stage === s).reduce((a, o) => a + o.value, 0) }));
        const maxStage = Math.max(1, ...byStage.map((x) => x.v));
        const complaintsQ = cases.filter((c) => ["service_complaint", "product_report", "mark_misuse", "billing_dispute"].includes(c.type));
        const appeals = cases.filter((c) => c.type === "appeal");

        return (
          <>
            <ModuleHeader title="Insights" subtitle="Complaint patterns, service levels and commercial performance" />

            <div className="crm-kpis crm-kpis--6">
              <Kpi label="Complaints logged" value={complaintsQ.length} sub="service, product, mark, billing" />
              <Kpi label="Resolved within target" value={overallMet != null ? `${overallMet}%` : "—"} tone={overallMet != null && overallMet < 80 ? "amber" : "green"} />
              <Kpi label="Reopened" value={cases.filter((c) => c.reopen_count > 0).length} sub="customer disputed the fix" />
              <Kpi label="Satisfaction" value={ins.csatAvg != null ? `${ins.csatAvg}/5` : "—"} sub={`${ins.csatCount} ratings`} />
              <Kpi label="Appeals" value={appeals.length} sub={`${appeals.filter((a) => a.state !== "Closed").length} open`} />
              <Kpi label="Win rate" value={ins.winRate != null ? `${ins.winRate}%` : "—"} sub={`${fmtShortE(ins.wonQuarter)} won this quarter`} />
            </div>

            <div className="crm-grid crm-grid--2">
              <div className="crm-card">
                <div className="crm-card__h">
                  <div>
                    <h3>Where complaints come from</h3>
                    <p>Product, mark and service complaints by sector and region — feeds the market-surveillance plan</p>
                  </div>
                </div>
                {sectors.length === 0 ? (
                  <span className="crm-small">No located complaints yet.</span>
                ) : (
                  <div className="crm-heat" style={{ gridTemplateColumns: `150px repeat(${REGIONS.length}, minmax(0, 1fr))` }}>
                    <span />
                    {REGIONS.map((r) => (
                      <span key={r} className="crm-heat__h crm-heat__h--col">
                        {r}
                      </span>
                    ))}
                    {sectors.map((s) => (
                      <HeatRow key={s} sector={s} heat={ins.heat} max={maxHeat} />
                    ))}
                  </div>
                )}
              </div>

              <div className="crm-card">
                <div className="crm-card__h">
                  <div>
                    <h3>Repeat complaints about one brand</h3>
                    <p>Two or more product or mark reports in 60 days — a trigger for a special surveillance visit</p>
                  </div>
                </div>
                {ins.repeatBrands.length === 0 ? (
                  <span className="crm-small">No repeat patterns.</span>
                ) : (
                  <div className="crm-stack" style={{ gap: 8 }}>
                    {ins.repeatBrands.map((b) => (
                      <div key={b.client_id} className="crm-row" style={{ flexWrap: "nowrap" }}>
                        <span className="crm-pill crm-pill--red">{b.count} reports</span>
                        <Link className="crm-link" to={`/crm/clients/${b.client_id}`}>
                          {clients.find((c) => c.id === b.client_id)?.name ?? b.client_id}
                        </Link>
                        <Link className="crm-btn crm-btn--sm" to="/certification" style={{ marginLeft: "auto" }}>
                          Certification →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                <hr className="crm-divider" />
                <div className="crm-card__h">
                  <h3>Root causes (service complaints)</h3>
                </div>
                {ins.rootCauses.length === 0 ? (
                  <span className="crm-small">No root causes recorded yet.</span>
                ) : (
                  <div className="crm-bars">
                    {ins.rootCauses.map((r) => (
                      <div key={r.cause} className="crm-bar">
                        <span title={r.cause}>{r.cause}</span>
                        <div className="crm-bar__track">
                          <div className="crm-bar__fill" style={{ width: `${(r.count / Math.max(1, ins.rootCauses[0].count)) * 100}%` }} />
                        </div>
                        <b>{r.count}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="crm-grid crm-grid--3" style={{ marginTop: 16 }}>
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Resolved within target, by type</h3>
                </div>
                <div className="crm-bars">
                  {slaByType.map((x) => (
                    <div key={x.t} className="crm-bar">
                      <span>{cfg.case_types[x.t].short}</span>
                      <div className="crm-bar__track">
                        <div className="crm-bar__fill" style={{ width: `${x.pct ?? 0}%`, background: (x.pct ?? 0) < 80 ? "var(--amber)" : "var(--green)" }} />
                      </div>
                      <b>{x.pct}%</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Satisfaction ratings</h3>
                </div>
                <div className="crm-bars">
                  {csatDist.map((x) => (
                    <div key={x.s} className="crm-bar">
                      <span>{"★".repeat(x.s)}</span>
                      <div className="crm-bar__track">
                        <div className="crm-bar__fill" style={{ width: `${(x.n / maxCsat) * 100}%`, background: "var(--gold)" }} />
                      </div>
                      <b>{x.n}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Pipeline by stage</h3>
                </div>
                <div className="crm-bars">
                  {byStage.map((x) => (
                    <div key={x.s} className="crm-bar">
                      <span>{STAGE_LABEL[x.s]}</span>
                      <div className="crm-bar__track">
                        <div className="crm-bar__fill" style={{ width: `${(x.v / maxStage) * 100}%` }} />
                      </div>
                      <b>{fmtShortE(x.v)}</b>
                    </div>
                  ))}
                </div>
                <hr className="crm-divider" />
                <div className="crm-card__h">
                  <h3>Why we lose</h3>
                </div>
                {lostReasons.length === 0 ? (
                  <span className="crm-small">No lost opportunities.</span>
                ) : (
                  lostReasons.map(([r, n]) => (
                    <div key={r} className="crm-row crm-small" style={{ justifyContent: "space-between" }}>
                      <span>{r}</span>
                      <b>{n}</b>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="crm-card" style={{ marginTop: 16 }}>
              <div className="crm-card__h">
                <div>
                  <h3>Board pack line — complaints &amp; customer service</h3>
                  <p>Rolls up to Board &amp; Governance (workflow map §2, row 7). Snapshot for the next pack.</p>
                </div>
                <Link className="crm-link" to="/board">
                  Board →
                </Link>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                {complaintsQ.length} complaints and reports logged; {overallMet ?? "—"}% of resolved cases met their target and{" "}
                {cases.filter((c) => c.reopen_count > 0).length} were reopened by the customer. Average satisfaction is {ins.csatAvg ?? "—"}/5 from{" "}
                {ins.csatCount} ratings. {ins.repeatBrands.length} certified brand(s) attracted repeat complaints and were referred to Certification.{" "}
                {appeals.length} appeal(s) were heard by an independent panel. Commercial: {fmtE(ins.pipelineValue)} open pipeline,{" "}
                {ins.byService[0] ? `${SERVICE_LABEL[ins.byService[0].service]} leads won revenue` : "no won revenue yet"}.
              </p>
            </div>
          </>
        );
      }}
    </CrmGate>
  );
}

function HeatRow({ sector, heat, max }: { sector: string; heat: { sector: string; region: string; count: number }[]; max: number }) {
  return (
    <>
      <span className="crm-heat__h">{sector}</span>
      {REGIONS.map((r) => {
        const n = heat.find((h) => h.sector === sector && h.region === r)?.count ?? 0;
        const a = n / max;
        return (
          <span
            key={r}
            className="crm-heat__c"
            style={{
              background: n ? `color-mix(in srgb, var(--red) ${Math.round(15 + a * 70)}%, var(--card))` : "var(--line-2)",
              color: a > 0.5 ? "#fff" : "var(--ink)",
            }}
            title={`${sector} · ${r}: ${n}`}
          >
            {n || ""}
          </span>
        );
      })}
    </>
  );
}
