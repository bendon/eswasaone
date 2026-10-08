import { ContactsManager } from "./CrmExtras";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmEmpty,
  SERVICE_LABEL,
  SlaChip,
  StatePill,
  caseSla,
  churnRisk,
  clientHealth,
  healthTrend,
  daysFromNow,
  fmtDay,
  fmtE,
  fmtWhen,
  getClient,
  getCrmConfig,
  initials,
  isCommercialOnly,
  listCases,
  listOpportunities,
  listQuotes,
  listSignals,
  logActivity,
  updateClient,
  useCrm,
  useCrmToast,
  type Client,
  type ClientActivity,
  type ClientTier,
} from "@eswasaone/shared-ui/crm";
import { AccountPlanTab, ChurnChip, Sparkline } from "./AccountPlan";
import { CrmGate, QUOTE_STATUS, SIGNAL_META, STAGE_LABEL, useActor } from "./shared";

type Tab = "overview" | "plan" | "contacts" | "certificates" | "applications" | "lab" | "training" | "orders" | "invoices" | "cases" | "commercial" | "activity";

/** Client 360 — everything ESWASA knows about one organisation on one page. */
export function CrmClient360() {
  const { id = "" } = useParams();
  const actor = useActor();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, showToast] = useCrmToast();
  const [actKind, setActKind] = useState<ClientActivity["kind"]>("call");
  const [actText, setActText] = useState("");

  const res = useCrm(async () => {
    const [client, cases, opps, quotes, signals, cfg] = await Promise.all([
      getClient(id),
      listCases({ client_id: id, includeAppeals: true }),
      listOpportunities(),
      listQuotes(),
      listSignals(),
      getCrmConfig(),
    ]);
    return {
      client,
      cases,
      cfg,
      opps: opps.filter((o) => o.client_id === id),
      quotes: quotes.filter((q) => q.client_id === id),
      signals: signals.filter((s) => s.client_id === id),
    };
  }, [id]);

  const firewall = isCommercialOnly(actor);

  return (
    <CrmGate res={res} what="Client" skeleton="panel">
      {({ client, cases: allCases, opps, quotes, signals, cfg }) => {
        if (!client) return <CrmEmpty title="Client not found" action={<Link className="crm-btn" to="/crm/clients">Back to clients</Link>} />;
        const cases = allCases.filter((c) => !(firewall && cfg.case_types[c.type].restricted)).filter((c) => c.type !== "appeal" || !firewall);
        const h = clientHealth(client, allCases);
        const trend = healthTrend(client, allCases);
        const churn = churnRisk(client, allCases);
        const owed = client.invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
        const primary = client.contacts.find((c) => c.primary) ?? client.contacts[0];
        const counts: Partial<Record<Tab, number>> = {
          contacts: client.contacts.length,
          certificates: client.certificates.length,
          applications: client.applications.length,
          lab: client.instruments.length,
          training: client.training.length,
          orders: client.orders.length,
          invoices: client.invoices.length,
          cases: cases.length,
          commercial: opps.length + quotes.length,
        };
        const TABS: { id: Tab; label: string }[] = [
          { id: "overview", label: "Overview" },
          { id: "plan", label: "Account plan" },
          { id: "contacts", label: "Contacts" },
          { id: "certificates", label: "Certificates" },
          { id: "applications", label: "Applications" },
          { id: "lab", label: "Lab & calibration" },
          { id: "training", label: "Training" },
          { id: "orders", label: "Orders" },
          { id: "invoices", label: "Invoices" },
          { id: "cases", label: "Cases" },
          { id: "commercial", label: "Opportunities & quotes" },
          { id: "activity", label: "Activity" },
        ];

        const addActivity = async () => {
          if (!actText.trim()) return;
          try {
            await logActivity(client.id, actor, actKind, actText.trim());
            setActText("");
            showToast("Activity logged");
          } catch (e) {
            showToast(e instanceof Error ? e.message : String(e));
          }
        };

        return (
          <>
            <Link className="crm-ws__back" to="/crm/clients" style={{ marginBottom: 10 }}>
              <Icon name="i-cleft" /> Clients
            </Link>
            <div className="crm-360">
              <div className="crm-360__av">{initials(client.name)}</div>
              <div style={{ minWidth: 0 }}>
                <h2>{client.name}</h2>
                <p>
                  {client.sector} · {client.region}
                  {client.reg_no ? ` · Reg ${client.reg_no}` : ""} · client since {new Date(client.since).getFullYear()}
                </p>
                <div className="crm-row" style={{ marginTop: 8 }}>
                  {client.tags.map((t) => (
                    <span key={t} className="crm-pill">
                      {t}
                    </span>
                  ))}
                  {client.account_manager ? <span className="crm-pill">AM: {client.account_manager}</span> : <span className="crm-pill">No account manager</span>}
                </div>
              </div>
              <Link className="crm-btn crm-btn--sm" to={`/crm/clients/${client.id}/edit`} style={{ alignSelf: "flex-start" }}>
                Edit / merge
              </Link>
              <div className="crm-360__health" title={h.factors.map((f) => `${f.label} (${f.delta > 0 ? "+" : ""}${f.delta})`).join("\n")}>
                <b>{h.score}</b>
                <div>
                  <span>Health</span>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{h.band === "good" ? "Healthy" : h.band === "watch" ? "Watch" : "At risk"}</div>
                </div>
              </div>
            </div>

            <div className="crm-row" style={{ marginBottom: 14 }}>
              <button type="button" className="crm-btn crm-btn--pri" onClick={() => navigate(`/crm/quotes?new=1&client=${client.id}`)}>
                <Icon name="i-file" /> New quote
              </button>
              <button type="button" className="crm-btn" onClick={() => navigate(`/crm/pipeline?new=1&client=${client.id}`)}>
                <Icon name="i-trend" /> New opportunity
              </button>
              <button type="button" className="crm-btn" onClick={() => navigate("/crm/cases?new=1")}>
                <Icon name="i-phone" /> Log a case
              </button>
              {primary?.email ? (
                <a className="crm-btn crm-btn--ghost" href={`mailto:${primary.email}`}>
                  <Icon name="i-mail" /> Email {primary.name.split(" ")[0]}
                </a>
              ) : null}
            </div>

            {firewall ? (
              <CrmBanner tone="lock">
                Commercial view: certification status only. Audit findings, product reports and appeals are hidden from sales roles.
              </CrmBanner>
            ) : null}

            <div className="crm-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                  {counts[t.id] ? <span className="n">{counts[t.id]}</span> : null}
                </button>
              ))}
            </div>

            {tab === "overview" ? (
              <div className="crm-grid crm-grid--main">
                <div className="crm-stack">
                  <div className="crm-kpis" style={{ marginBottom: 0 }}>
                    <div className="crm-kpi">
                      <div className="crm-kpi__l">Valid certificates</div>
                      <div className="crm-kpi__v">{client.certificates.filter((c) => c.status === "valid").length}</div>
                    </div>
                    <div className={`crm-kpi${owed && client.invoices.some((i) => i.status === "overdue") ? " crm-kpi--red" : ""}`}>
                      <div className="crm-kpi__l">Outstanding</div>
                      <div className="crm-kpi__v">{fmtE(owed)}</div>
                    </div>
                    <div className="crm-kpi">
                      <div className="crm-kpi__l">Open cases</div>
                      <div className="crm-kpi__v">{cases.filter((c) => !["Closed", "Resolved"].includes(c.state)).length}</div>
                    </div>
                    <div className="crm-kpi">
                      <div className="crm-kpi__l">Open pipeline</div>
                      <div className="crm-kpi__v">{fmtE(opps.filter((o) => o.stage !== "won" && o.stage !== "lost").reduce((s, o) => s + o.value, 0))}</div>
                    </div>
                  </div>

                  <div className="crm-card">
                    <div className="crm-card__h">
                      <h3>Coming up</h3>
                    </div>
                    <UpcomingList client={client} />
                  </div>

                  {signals.length ? (
                    <div className="crm-card">
                      <div className="crm-card__h">
                        <h3>Signals for this client</h3>
                        <Link className="crm-link" to="/crm/signals">
                          Signals →
                        </Link>
                      </div>
                      <div className="crm-stack" style={{ gap: 8 }}>
                        {signals.map((s) => (
                          <div key={s.id} className="crm-row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                            <span className={`crm-pill ${s.compliance ? "crm-pill--red" : "crm-pill--gold"}`}>{SIGNAL_META[s.kind].label}</span>
                            <span style={{ fontSize: 13 }}>{s.title}</span>
                            <span className="crm-small" style={{ marginLeft: "auto" }}>
                              {s.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="crm-stack">
                  <div className="crm-card">
                    <div className="crm-card__h">
                      <h3>Health score</h3>
                      <span className={`crm-health crm-health--${h.band}`} style={{ marginLeft: "auto" }}>
                        {h.score}/100
                      </span>
                    </div>
                    <div className="crm-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                      <span className="crm-small">
                        Last {trend.length} months: {trend.map((p) => p.score).join(" → ")}
                      </span>
                      <Sparkline points={trend} />
                    </div>
                    <div className="crm-row" style={{ marginBottom: 8 }}>
                      <ChurnChip risk={churn} />
                    </div>
                    {churn.reasons.length ? (
                      <ul className="crm-small" style={{ margin: "0 0 8px", paddingLeft: 18 }}>
                        {churn.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="crm-stack" style={{ gap: 6 }}>
                      {h.factors.length === 0 ? <span className="crm-small">No risk factors.</span> : null}
                      {h.factors.map((f) => (
                        <div key={f.label} className="crm-row crm-small" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                          <span>{f.label}</span>
                          <b style={{ color: f.delta < 0 ? "var(--red)" : "var(--green)" }}>
                            {f.delta > 0 ? "+" : ""}
                            {f.delta}
                          </b>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="crm-card">
                    <div className="crm-card__h">
                      <h3>Account</h3>
                    </div>
                    <div className="crm-form">
                      <label className="crm-field">
                        Tier
                        <select
                          className="crm-select"
                          value={client.tier}
                          onChange={(e) => void updateClient(client.id, { tier: e.target.value as ClientTier }).then(() => showToast("Tier updated"))}
                        >
                          {cfg.tiers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <span className="hint">{cfg.tiers.find((t) => t.id === client.tier)?.rule}</span>
                      </label>
                      <label className="crm-field">
                        Account manager
                        <input
                          className="crm-input"
                          defaultValue={client.account_manager ?? ""}
                          placeholder="Unassigned"
                          onBlur={(e) => {
                            const v = e.target.value.trim() || undefined;
                            if (v !== client.account_manager) void updateClient(client.id, { account_manager: v }).then(() => showToast("Account manager updated"));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  {primary ? (
                    <div className="crm-card">
                      <div className="crm-card__h">
                        <h3>Primary contact</h3>
                      </div>
                      <dl className="crm-kv">
                        <dt>Name</dt>
                        <dd>{primary.name}</dd>
                        <dt>Role</dt>
                        <dd>{primary.role}</dd>
                        {primary.email ? (
                          <>
                            <dt>Email</dt>
                            <dd>{primary.email}</dd>
                          </>
                        ) : null}
                        {primary.phone ? (
                          <>
                            <dt>Phone</dt>
                            <dd>{primary.phone}</dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {tab === "contacts" ? (
              <ContactsManager client={client} />
            ) : null}

            {tab === "certificates" ? (
              <Table head={["Certificate", "Scheme", "Status", "Issued", "Expires", "Next surveillance"]} empty="No certificates.">
                {client.certificates.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b className="crm-mono">{c.id}</b>
                      <span className="crm-small">{c.standard}</span>
                    </td>
                    <td>{c.scheme}</td>
                    <td>
                      <span className={`crm-pill crm-pill--${c.status === "valid" ? "green" : c.status === "suspended" ? "red" : "slate"}`}>{c.status}</span>
                    </td>
                    <td className="crm-small">{fmtDay(c.issued)}</td>
                    <td>
                      {fmtDay(c.expires)}
                      <span className="crm-small">{daysFromNow(c.expires) >= 0 ? `in ${daysFromNow(c.expires)} days` : `${-daysFromNow(c.expires)} days ago`}</span>
                    </td>
                    <td className="crm-small">{c.next_surveillance ? fmtDay(c.next_surveillance) : "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : null}

            {tab === "applications" ? (
              <Table head={["Application", "Scheme", "Stage", "Opened"]} empty="No applications in progress.">
                {client.applications.map((a) => (
                  <tr key={a.id}>
                    <td className="crm-mono">
                      {firewall ? a.id : <Link to="/certification">{a.id}</Link>}
                    </td>
                    <td>{a.scheme}</td>
                    <td>
                      <span className="crm-pill">{a.stage}</span>
                    </td>
                    <td className="crm-small">{fmtDay(a.opened)}</td>
                  </tr>
                ))}
              </Table>
            ) : null}

            {tab === "lab" ? (
              <Table head={["Instrument", "Last calibrated", "Next due", "Status"]} empty="No instruments on record.">
                {client.instruments.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.name}</b>
                      <span className="crm-small crm-mono">{i.id}</span>
                    </td>
                    <td className="crm-small">{fmtDay(i.last_cal)}</td>
                    <td>
                      {fmtDay(i.next_due)}
                      <span className="crm-small">in {daysFromNow(i.next_due)} days</span>
                    </td>
                    <td>
                      <span className={`crm-pill crm-pill--${i.status === "in_tolerance" ? "green" : i.status === "due" ? "amber" : "red"}`}>
                        {i.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : null}

            {tab === "training" ? (
              <Table head={["Course", "Delegates", "Date", "Status"]} empty="No training booked or completed.">
                {client.training.map((t, i) => (
                  <tr key={i}>
                    <td>
                      <b>{t.course}</b>
                    </td>
                    <td>{t.people}</td>
                    <td className="crm-small">{fmtDay(t.date)}</td>
                    <td>
                      <span className={`crm-pill crm-pill--${t.status === "completed" ? "green" : "navy"}`}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : null}

            {tab === "orders" ? (
              <Table head={["Order", "Item", "Date", "Amount"]} empty="No e-store orders.">
                {client.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="crm-mono">{o.id}</td>
                    <td>{o.item}</td>
                    <td className="crm-small">{fmtDay(o.date)}</td>
                    <td className="num">{fmtE(o.amount)}</td>
                  </tr>
                ))}
              </Table>
            ) : null}

            {tab === "invoices" ? (
              <Table head={["Invoice", "For", "Due", "Status", "Amount"]} empty="No invoices.">
                {client.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="crm-mono">{i.id}</td>
                    <td>{i.label}</td>
                    <td className="crm-small">{fmtDay(i.due)}</td>
                    <td>
                      <span className={`crm-pill crm-pill--${i.status === "paid" ? "green" : i.status === "overdue" ? "red" : "amber"}`}>{i.status}</span>
                    </td>
                    <td className="num">{fmtE(i.amount)}</td>
                  </tr>
                ))}
              </Table>
            ) : null}

            {tab === "plan" ? <AccountPlanTab client={client} actor={actor} onSaved={showToast} /> : null}

            {tab === "cases" ? (
              <Table head={["Case", "Type", "State", "SLA", "Opened"]} empty="No cases for this client.">
                {cases.map((c) => (
                  <tr key={c.ref} className="is-click" onClick={() => navigate(`/crm/cases/${c.ref}`)}>
                    <td>
                      <b>{c.subject}</b>
                      <span className="crm-small crm-mono">{c.ref}</span>
                    </td>
                    <td>{cfg.case_types[c.type].short}</td>
                    <td>
                      <StatePill state={c.state} />
                    </td>
                    <td>
                      <SlaChip sla={caseSla(c, cfg.case_types[c.type])} />
                    </td>
                    <td className="crm-small">{fmtWhen(c.created_at)}</td>
                  </tr>
                ))}
              </Table>
            ) : null}

            {tab === "commercial" ? (
              <div className="crm-grid crm-grid--2">
                <Table head={["Opportunity", "Stage", "Value"]} empty="No opportunities.">
                  {opps.map((o) => (
                    <tr key={o.id} className="is-click" onClick={() => navigate(`/crm/pipeline?open=${o.id}`)}>
                      <td>
                        <b>{o.title}</b>
                        <span className="crm-small">{o.services.map((s) => SERVICE_LABEL[s]).join(", ")}</span>
                      </td>
                      <td>
                        <span className={`crm-pill ${o.stage === "won" ? "crm-pill--green" : o.stage === "lost" ? "crm-pill--red" : ""}`}>{STAGE_LABEL[o.stage]}</span>
                      </td>
                      <td className="num">{fmtE(o.value)}</td>
                    </tr>
                  ))}
                </Table>
                <Table head={["Quote", "Status", "Valid until"]} empty="No quotes.">
                  {quotes.map((q) => (
                    <tr key={q.id} className="is-click" onClick={() => navigate(`/crm/quotes?open=${q.id}`)}>
                      <td className="crm-mono">{q.id}</td>
                      <td>
                        <span className={`crm-pill crm-pill--${QUOTE_STATUS[q.status].tone}`}>{QUOTE_STATUS[q.status].label}</span>
                      </td>
                      <td className="crm-small">{fmtDay(q.valid_until)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : null}

            {tab === "activity" ? (
              <div className="crm-grid crm-grid--main">
                <div className="crm-card">
                  <ul className="crm-timeline">
                    {client.activity.map((a) => (
                      <li key={a.id}>
                        <b>
                          {a.kind[0].toUpperCase() + a.kind.slice(1)} · {a.by}
                        </b>
                        <span>
                          {fmtWhen(a.at)} — {a.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {client.activity.length === 0 ? <span className="crm-small">No activity yet.</span> : null}
                </div>
                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Log activity</h3>
                  </div>
                  <div className="crm-form">
                    <select className="crm-select" value={actKind} onChange={(e) => setActKind(e.target.value as ClientActivity["kind"])} aria-label="Kind">
                      {(["call", "email", "meeting", "visit", "note"] as const).map((k) => (
                        <option key={k} value={k}>
                          {k[0].toUpperCase() + k.slice(1)}
                        </option>
                      ))}
                    </select>
                    <textarea className="crm-textarea" value={actText} onChange={(e) => setActText(e.target.value)} placeholder="What happened, and what's next?" aria-label="Activity" />
                    <button type="button" className="crm-btn crm-btn--pri" disabled={!actText.trim()} onClick={() => void addActivity()}>
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {toast}
          </>
        );
      }}
    </CrmGate>
  );
}

function Table({ head, empty, children }: { head: string[]; empty: string; children: ReactNode[] }) {
  if (!children.length) return <CrmEmpty title={empty} />;
  return (
    <div className="crm-card crm-card--flush">
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} className={h === "Amount" || h === "Value" ? "num" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function UpcomingList({ client }: { client: Client }) {
  const items = [
    ...client.certificates
      .filter((c) => c.status === "valid")
      .flatMap((c) => [
        { at: c.expires, label: `${c.standard} certificate expires`, icon: "i-badge" as const },
        ...(c.next_surveillance ? [{ at: c.next_surveillance, label: `${c.standard} surveillance audit`, icon: "i-cal" as const }] : []),
      ]),
    ...client.instruments.map((i) => ({ at: i.next_due, label: `${i.name} calibration due`, icon: "i-gauge" as const })),
    ...client.training.filter((t) => t.status === "booked").map((t) => ({ at: t.date, label: `${t.course} (${t.people} delegates)`, icon: "i-cap" as const })),
    ...client.invoices.filter((i) => i.status !== "paid").map((i) => ({ at: i.due, label: `${i.id} ${fmtE(i.amount)} ${i.status === "overdue" ? "overdue" : "due"}`, icon: "i-dollar" as const })),
  ]
    .filter((x) => daysFromNow(x.at) <= 180)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!items.length) return <span className="crm-small">Nothing due in the next six months.</span>;
  return (
    <div className="crm-stack" style={{ gap: 9 }}>
      {items.map((x, i) => {
        const d = daysFromNow(x.at);
        return (
          <div key={i} className="crm-row" style={{ flexWrap: "nowrap" }}>
            <Icon name={x.icon} size={16} />
            <span style={{ fontSize: 13 }}>{x.label}</span>
            <span className={`crm-pill ${d < 0 ? "crm-pill--red" : d <= 30 ? "crm-pill--amber" : "crm-pill--slate"}`} style={{ marginLeft: "auto" }}>
              {d < 0 ? `${-d}d ago` : `in ${d}d`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
