import { Link, useNavigate } from "react-router-dom";
import { Icon, ModuleHeader } from "@eswasaone/shared-ui";
import {
  SERVICE_LABEL,
  SlaChip,
  StatePill,
  caseSla,
  fmtE,
  fmtShortE,
  fmtWhen,
  getCrmConfig,
  insights,
  isCommercialOnly,
  isOpen,
  listCases,
  listClients,
  listOpportunities,
  listSignals,
  renewals,
  useCrm,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, Kpi, SIGNAL_META, SignalIcon, useActor } from "./shared";

/** CRM Overview — commercial + service-desk KPIs, what needs attention, live signals. */
export function CrmOverviewView() {
  const actor = useActor();
  const navigate = useNavigate();
  const res = useCrm(async () => {
    const [cases, opps, signals, clients, cfg] = await Promise.all([
      listCases({ includeAppeals: false }),
      listOpportunities(),
      listSignals(),
      listClients(),
      getCrmConfig(),
    ]);
    return { cases, opps, signals, clients, cfg };
  });

  return (
    <CrmGate res={res} what="CRM overview" skeleton="dashboard">
      {({ cases, opps, signals, clients, cfg }) => {
        const ins = insights(cases, opps, cfg);
        const due = renewals(clients, signals, 90);
        const renewalValue = due.reduce((s, r) => s + r.value_estimate, 0);
        const firewall = isCommercialOnly(actor);
        const attention = cases
          .filter(isOpen)
          .filter((c) => !(firewall && cfg.case_types[c.type].restricted))
          .map((c) => ({ c, sla: caseSla(c, cfg.case_types[c.type]) }))
          .filter(({ c, sla }) => sla.status !== "ok" || c.state === "Open" || c.state === "Reopened" || c.priority === "urgent")
          .sort((a, b) => a.sla.remaining - b.sla.remaining)
          .slice(0, 6);
        const newSignals = signals.filter((s) => s.status === "new").slice(0, 5);
        const clientName = (id?: string) => clients.find((c) => c.id === id)?.name;
        const maxSvc = Math.max(1, ...ins.byService.map((s) => s.value));

        return (
          <>
            <ModuleHeader
              title="CRM & Commercial"
              subtitle={`${clients.filter((c) => c.status === "active").length} active clients · ${clients.filter((c) => c.status === "prospect").length} prospects`}
              extra={
                <>
                  <Link className="crm-btn" to="cases?new=1">
                    <Icon name="i-phone" /> Log a case
                  </Link>
                  <Link className="crm-btn crm-btn--pri" to="quotes?new=1">
                    <Icon name="i-plus" /> New quote
                  </Link>
                </>
              }
            />

            <div className="crm-kpi__sec">Service desk</div>
            <div className="crm-kpis">
              <Kpi label="Open cases" value={ins.openCases} sub={`${ins.awaitingCustomer} waiting on customer`} to="cases" />
              <Kpi label="Breaching SLA" value={ins.breaching} tone={ins.breaching ? "red" : "green"} sub="past resolution target" to="cases?queue=breaching" />
              <Kpi label="Avg. resolution" value={ins.avgResolutionDays != null ? `${ins.avgResolutionDays}d` : "—"} sub="calendar days, received → resolved" />
              <Kpi
                label="Satisfaction"
                value={ins.csatAvg != null ? `${ins.csatAvg}/5` : "—"}
                tone={ins.csatAvg != null && ins.csatAvg < 3.5 ? "amber" : undefined}
                sub={`${ins.csatCount} ratings · ${ins.firstContactRate ?? "—"}% resolved first time`}
              />
            </div>

            <div className="crm-kpi__sec">Commercial</div>
            <div className="crm-kpis">
              <Kpi label="Open pipeline" value={fmtShortE(ins.pipelineValue)} sub={`${fmtShortE(ins.weightedPipeline)} weighted`} to="pipeline" />
              <Kpi label="Won this quarter" value={fmtShortE(ins.wonQuarter)} tone="green" sub={`Win rate ${ins.winRate ?? "—"}%`} />
              <Kpi label="Renewals in 90 days" value={due.length} sub={`≈ ${fmtShortE(renewalValue)} at stake`} to="renewals" tone={due.some((d) => d.days < 30 && d.outreach === "none") ? "amber" : undefined} />
              <Kpi label="New signals" value={signals.filter((s) => s.status === "new").length} sub="leads generated from events" to="signals" />
            </div>

            <div className="crm-grid crm-grid--main">
              <div className="crm-card crm-card--flush">
                <div className="crm-card__h">
                  <div>
                    <h3>Needs attention</h3>
                    <p>Breaching or due cases, new and reopened cases</p>
                  </div>
                  <Link className="crm-link" to="cases">
                    All cases →
                  </Link>
                </div>
                {attention.length === 0 ? (
                  <div style={{ padding: 20 }} className="crm-small">
                    Nothing urgent. Every open case is within its target.
                  </div>
                ) : (
                  <div className="crm-table-wrap">
                    <table className="crm-table">
                      <tbody>
                        {attention.map(({ c, sla }) => (
                          <tr key={c.ref} className="is-click" onClick={() => navigate(`cases/${c.ref}`)}>
                            <td style={{ width: "50%" }}>
                              <b>{c.subject}</b>
                              <span className="crm-small">
                                <span className="crm-mono">{c.ref}</span> · {cfg.case_types[c.type].short} · {c.team}
                              </span>
                            </td>
                            <td>
                              <StatePill state={c.state} />
                            </td>
                            <td>
                              <SlaChip sla={sla} />
                            </td>
                            <td className="crm-small">{c.assignee ?? "Unassigned"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="crm-card">
                <div className="crm-card__h">
                  <div>
                    <h3>New signals</h3>
                    <p>Leads raised automatically from what's happening</p>
                  </div>
                  <Link className="crm-link" to="signals">
                    Inbox →
                  </Link>
                </div>
                <div className="crm-stack" style={{ gap: 10 }}>
                  {newSignals.map((s) => (
                    <Link key={s.id} to="signals" className="crm-row" style={{ color: "inherit", textDecoration: "none", alignItems: "flex-start", flexWrap: "nowrap" }}>
                      <SignalIcon kind={s.kind} />
                      <div style={{ minWidth: 0 }}>
                        <b style={{ fontSize: 13, display: "block" }}>{s.title}</b>
                        <span className="crm-small">
                          {SIGNAL_META[s.kind].label} · {clientName(s.client_id) ?? s.prospect?.name ?? s.sector ?? "Market"} · {fmtWhen(s.created_at)}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {newSignals.length === 0 ? <span className="crm-small">No new signals.</span> : null}
                </div>
              </div>
            </div>

            <div className="crm-grid crm-grid--3" style={{ marginTop: 16 }}>
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Cases received vs resolved</h3>
                </div>
                <div className="crm-cols">
                  {ins.byMonth.map((m) => {
                    const max = Math.max(1, ...ins.byMonth.flatMap((x) => [x.received, x.resolved]));
                    return (
                      <div key={m.label} className="crm-cols__g">
                        <div className="crm-cols__pair">
                          <div className="crm-cols__b" style={{ height: `${(m.received / max) * 100}%` }} title={`${m.received} received`} />
                          <div className="crm-cols__b crm-cols__b--alt" style={{ height: `${(m.resolved / max) * 100}%` }} title={`${m.resolved} resolved`} />
                        </div>
                        <span className="crm-cols__l">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="crm-legend" style={{ marginTop: 10 }}>
                  <span>
                    <i />
                    Received
                  </span>
                  <span>
                    <i className="alt" />
                    Resolved
                  </span>
                </div>
              </div>

              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Open cases by type</h3>
                </div>
                <div className="crm-bars">
                  {ins.byType.map((t) => (
                    <div key={t.type} className="crm-bar">
                      <span>{t.type}</span>
                      <div className="crm-bar__track">
                        <div className="crm-bar__fill" style={{ width: `${(t.open / Math.max(1, ...ins.byType.map((x) => x.total))) * 100}%` }} />
                        <div className="crm-bar__fill crm-bar__fill--alt" style={{ width: `${((t.total - t.open) / Math.max(1, ...ins.byType.map((x) => x.total))) * 100}%`, opacity: 0.35 }} />
                      </div>
                      <b>
                        {t.open}/{t.total}
                      </b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Won revenue by service line</h3>
                </div>
                {ins.byService.length === 0 ? (
                  <span className="crm-small">No won opportunities yet.</span>
                ) : (
                  <div className="crm-bars">
                    {ins.byService.map((s) => (
                      <div key={s.service} className="crm-bar">
                        <span>{SERVICE_LABEL[s.service] ?? s.service}</span>
                        <div className="crm-bar__track">
                          <div className="crm-bar__fill" style={{ width: `${(s.value / maxSvc) * 100}%`, background: "var(--gold)" }} />
                        </div>
                        <b>{fmtShortE(s.value)}</b>
                      </div>
                    ))}
                  </div>
                )}
                <p className="crm-small" style={{ marginTop: 12 }}>
                  Upcoming renewals worth {fmtE(renewalValue)}.
                </p>
              </div>
            </div>
          </>
        );
      }}
    </CrmGate>
  );
}
