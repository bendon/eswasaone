import { AppealPanelCard, CaseDeliveries, CaseFieldVisitCard } from "./CaseExtras";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { askAgent, Icon, Select } from "@eswasaone/shared-ui";
import {
  caseFlags,
  CaseTimeline,
  CrmBanner,
  CrmDrawer,
  CrmEmpty,
  SlaChip,
  SlaClock,
  StatePill,
  Stars,
  Thread,
  actOnCase,
  assignCase,
  caseSla,
  draftReply,
  fillTemplate,
  findDuplicates,
  fmtDay,
  getClient,
  getCrmConfig,
  getCase,
  handOff,
  isAppealsPanel,
  isCommercialOnly,
  listCases,
  postMessage,
  staffActions,
  summarise,
  updateCase,
  useCrm,
  useCrmToast,
  type Case,
  type CaseAction,
  type CasePriority,
  type CaseType,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, useActor } from "./shared";

const ROOT_CAUSES = [
  "Process — RFQ routing",
  "Process — scheduling",
  "Capacity — lab backlog",
  "Communication — no update sent",
  "Staff conduct",
  "Data entry",
  "System / IT",
  "Customer misunderstanding",
  "Not substantiated",
];

/** Full-page case workspace: thread + composer on the left, SLA, people, links and actions on the right. */
export function CrmCaseWorkspace() {
  const { ref = "" } = useParams();
  const actor = useActor();
  const [toast, showToast] = useCrmToast();
  const res = useCrm(async () => {
    const [c, cfg, all] = await Promise.all([getCase(ref), getCrmConfig(), listCases({ includeAppeals: true })]);
    const client = c?.client_id ? await getClient(c.client_id) : null;
    return { c, cfg, all, client };
  }, [ref]);

  const [pending, setPending] = useState<CaseAction | null>(null);
  const [note, setNote] = useState("");
  const [dupRef, setDupRef] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"public" | "internal">("public");
  const [draft, setDraft] = useState("");
  const [assistBusy, setAssistBusy] = useState(false);
  const [assignee, setAssignee] = useState("");

  const knownStaff = useMemo(() => {
    const names = new Set<string>([actor.name]);
    for (const x of res.data?.all ?? []) if (x.assignee) names.add(x.assignee);
    return [...names].sort();
  }, [res.data?.all, actor.name]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      showToast(ok);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmGate res={res} what="Case" skeleton="panel">
      {({ c, cfg, all, client }) => {
        if (!c) return <CrmEmpty title={`Case ${ref} not found`} action={<Link className="crm-btn" to="/crm/cases">Back to cases</Link>} />;
        const typeCfg = cfg.case_types[c.type];
        if (c.type === "appeal" && !isAppealsPanel(actor)) {
          return (
            <CrmBanner tone="lock">
              Case {c.ref} is an appeal. Only the appeals panel can open it.
            </CrmBanner>
          );
        }
        if (isCommercialOnly(actor) && typeCfg.restricted) {
          return (
            <CrmBanner tone="lock">
              {typeCfg.short} cases are hidden from commercial roles to keep sales separate from certification decisions.
            </CrmBanner>
          );
        }
        const sla = caseSla(c, typeCfg);
        const flags = caseFlags(c);
        const actions = staffActions(c, actor);
        const dups = findDuplicates(c, all);
        const backTo = c.type === "appeal" ? "/crm/appeals" : "/crm/cases";
        const canHandOffSurv = (c.type === "product_report" || c.type === "mark_misuse") && !c.links.some((l) => l.kind === "investigation");
        const canCapa = c.type === "service_complaint" && !c.links.some((l) => l.kind === "capa");
        const templates = cfg.templates.filter((t) => t.types.includes(c.type));

        const confirmPending = async () => {
          if (!pending) return;
          const done = await run(async () => {
            if (pending.action === "resolve" && c.type === "service_complaint" && rootCause) {
              await updateCase(c.ref, actor, { root_cause: rootCause });
            }
            await actOnCase(c.ref, pending.action, actor, { note, duplicate_ref: dupRef });
          }, `${pending.label}: done`);
          if (done) {
            setPending(null);
            setNote("");
            setDupRef("");
          }
        };

        const send = async () => {
          if (!draft.trim()) return;
          const ok = await run(() => postMessage(c.ref, actor, draft.trim(), mode), mode === "public" ? "Reply sent to customer" : "Internal note added");
          if (ok) setDraft("");
        };

        const assist = async () => {
          setAssistBusy(true);
          setErr(null);
          try {
            const thread = c.thread
              .filter((m) => m.visibility === "public")
              .map((m) => `${m.role === "customer" ? "Customer" : "ESWASA"}: ${m.body}`)
              .join("\n");
            const r = await askAgent({
              message: `Draft a short, polite reply from ESWASA for this ${typeCfg.short.toLowerCase()} case. Do not promise outcomes or share details about other companies.\n\n${thread}\n\nCurrent draft:\n${draft}`,
              context: { surface: "crm.case", ref: c.ref, type: c.type, state: c.state },
            });
            if (r.answer) setDraft(r.answer);
          } catch {
            setErr("The assistant isn't available right now — the template draft is still in the box.");
          } finally {
            setAssistBusy(false);
          }
        };

        return (
          <>
            <div className="crm-ws__head">
              <div style={{ minWidth: 0, flex: "1 1 420px" }}>
                <Link className="crm-ws__back" to={backTo}>
                  <Icon name="i-cleft" /> {c.type === "appeal" ? "Appeals" : "Cases"}
                </Link>
                <h2>{c.subject}</h2>
                <div className="crm-row">
                  <span className="crm-mono">{c.ref}</span>
                  <span className="crm-pill crm-pill--outline">{typeCfg.short}</span>
                  <StatePill state={c.state} />
                  <SlaChip sla={sla} />
                  {c.priority !== "normal" ? <span className={`crm-prio crm-prio--${c.priority}`}>{c.priority}</span> : null}
                  {c.reopen_count ? <span className="crm-pill crm-pill--amber">Reopened ×{c.reopen_count}</span> : null}
                </div>
              </div>
              <div className="crm-ws__actions">
                {actions.length === 0 ? <span className="crm-small">No actions available in this state.</span> : null}
                {actions.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    className={`crm-btn${a.danger ? " crm-btn--danger" : a.action === "resolve" || a.action === "start" || a.action === "triage" ? " crm-btn--pri" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setErr(null);
                      if (a.requires) {
                        setPending(a);
                        if (a.action === "request_info") {
                          const t = cfg.templates.find((x) => x.id === "t-info");
                          setNote(t ? fillTemplate(t.body, c, cfg, sla.due) : "");
                        } else setNote("");
                      } else {
                        void run(() => actOnCase(c.ref, a.action, actor), `${a.label}: done`);
                      }
                    }}
                    title={a.consequence}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
            {(flags.angry || flags.urgent) && !["Resolved", "Closed", "Escalated"].includes(c.state) ? (
              <CrmBanner tone={flags.angry ? "err" : "info"}>
                {flags.angry ? "The customer sounds upset" : "The customer flags urgency"} ({flags.cues.slice(0, 4).join(", ")}).{" "}
                {flags.angry ? "Consider calling them today and escalating to the team lead." : "Check whether the priority should be raised."} This is a hint only.
              </CrmBanner>
            ) : null}
            {sla.status === "breach" && !sla.stopped ? (
              <CrmBanner>
                This case is {-sla.remaining} working day(s) past its {typeCfg.resolve_days}-day target. Escalate or resolve it today.
              </CrmBanner>
            ) : null}

            <div className="crm-ws">
              <div className="crm-stack">
                <div className="crm-summary">
                  <Icon name="i-spark" />
                  <div>
                    <b>Summary · </b>
                    {summarise(c)}
                    {c.location ? ` Location: ${c.location}.` : ""}
                    {c.incident_date ? ` Happened ${fmtDay(c.incident_date)}.` : ""}
                  </div>
                </div>

                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Conversation</h3>
                    <span className="crm-small" style={{ marginLeft: "auto" }}>
                      Customer sees replies, never internal notes
                    </span>
                  </div>
                  <Thread messages={c.thread} />
                </div>

                {c.state !== "Closed" ? (
                  <div className={`crm-composer${mode === "internal" ? " crm-composer--internal" : ""}`}>
                    <div className="crm-composer__tabs" role="tablist">
                      <button type="button" role="tab" aria-selected={mode === "public"} className={mode === "public" ? "on" : ""} onClick={() => setMode("public")}>
                        Reply to customer
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "internal"}
                        className={mode === "internal" ? "on internal" : ""}
                        onClick={() => setMode("internal")}
                      >
                        Internal note
                      </button>
                    </div>
                    <textarea
                      className="crm-textarea"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        mode === "public"
                          ? c.reporter.anonymous && !c.reporter.email && !c.reporter.phone
                            ? "Anonymous reporter — they'll see this on the tracking page with their code."
                            : `Reply to ${c.reporter.name ?? "the customer"} by ${c.reporter.preferred}…`
                          : "Only ESWASA staff see internal notes."
                      }
                      aria-label={mode === "public" ? "Reply to customer" : "Internal note"}
                    />
                    <div className="crm-composer__f">
                      {mode === "public" ? (
                        <>
                          <Select style={{ width: "auto", minHeight: 30, fontSize: 12.5, padding: "4px 8px" }} value="" onChange={(val) => {
                              const t = templates.find((x) => x.id === val);
                              if (t) setDraft(fillTemplate(t.body, c, cfg, sla.due));
                            }} aria-label="Insert template">
                            <option value="">Insert template…</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setDraft(draftReply(c, cfg, sla.due))}>
                            <Icon name="i-spark" /> Suggest reply
                          </button>
                          <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" disabled={assistBusy} onClick={() => void assist()}>
                            {assistBusy ? "Asking…" : "Refine with assistant"}
                          </button>
                        </>
                      ) : null}
                      <span className="crm-spacer" />
                      <button type="button" className={`crm-btn crm-btn--sm ${mode === "public" ? "crm-btn--pri" : "crm-btn--gold"}`} disabled={!draft.trim() || busy} onClick={() => void send()}>
                        <Icon name="i-send" /> {mode === "public" ? "Send reply" : "Add note"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>History</h3>
                  </div>
                  <CaseTimeline c={c} />
                </div>
              </div>

              <aside className="crm-ws__rail">
                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Service level</h3>
                    <span className="crm-small" style={{ marginLeft: "auto" }}>
                      {typeCfg.resolve_days} working days{typeCfg.to_confirm ? " · to confirm" : ""}
                    </span>
                  </div>
                  <SlaClock sla={sla} />
                  <hr className="crm-divider" />
                  <div className="crm-row crm-small">
                    <span className={`crm-sla crm-sla--${sla.ack.status}`}>{sla.ack.label}</span>
                    <span>Target {typeCfg.ack_days} working day(s)</span>
                  </div>
                </div>

                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Handling</h3>
                  </div>
                  <div className="crm-form">
                    <div className="crm-form crm-form--2">
                      <label className="crm-field">
                        Type
                        <Select value={c.type} disabled={c.type === "appeal"} onChange={(val) => void run(() => updateCase(c.ref, actor, { type: val as CaseType }), "Type updated")} block>
                          {(Object.keys(cfg.case_types) as CaseType[])
                            .filter((k) => (c.type === "appeal" ? true : k !== "appeal"))
                            .map((k) => (
                              <option key={k} value={k}>
                                {cfg.case_types[k].short}
                              </option>
                            ))}
                        </Select>
                      </label>
                      <label className="crm-field">
                        Priority
                        <Select value={c.priority} onChange={(val) => void run(() => updateCase(c.ref, actor, { priority: val as CasePriority }), "Priority updated")} block>
                          {(["low", "normal", "high", "urgent"] as CasePriority[]).map((p) => (
                            <option key={p} value={p}>
                              {p[0].toUpperCase() + p.slice(1)}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>
                    <label className="crm-field">
                      Team
                      <Select value={c.team} disabled={c.type === "appeal"} onChange={(val) => void run(() => updateCase(c.ref, actor, { team: val }), "Team updated")} block>
                        {cfg.teams.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <div className="crm-field">
                      Owner
                      <div className="crm-row" style={{ flexWrap: "nowrap" }}>
                        <input
                          className="crm-input"
                          list="crm-staff"
                          value={assignee}
                          onChange={(e) => setAssignee(e.target.value)}
                          placeholder={c.assignee ?? "Unassigned"}
                          aria-label="Assign to"
                        />
                        <datalist id="crm-staff">
                          {knownStaff.map((n) => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                        <button
                          type="button"
                          className="crm-btn crm-btn--sm"
                          disabled={busy}
                          onClick={() => {
                            const who = assignee.trim() || actor.name;
                            void run(() => assignCase(c.ref, actor, who), `Assigned to ${who}`).then((ok) => ok && setAssignee(""));
                          }}
                        >
                          {assignee.trim() ? "Assign" : "Take it"}
                        </button>
                      </div>
                    </div>
                    {c.type === "service_complaint" ? (
                      <label className="crm-field">
                        Root cause
                        <Select value={c.root_cause ?? ""} onChange={(val) => void run(() => updateCase(c.ref, actor, { root_cause: val || undefined }), "Root cause saved")} block>
                          <option value="">Not yet known</option>
                          {ROOT_CAUSES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ) : null}
                  </div>
                </div>

                {c.type === "appeal" ? <AppealPanelCard c={c} actor={actor} onDone={(m) => (showToast(m), res.reload())} /> : null}

                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Reporter</h3>
                    <span className="crm-pill crm-pill--outline" style={{ marginLeft: "auto" }}>
                      {c.channel.replace("_", " ")}
                    </span>
                  </div>
                  <dl className="crm-kv">
                    <dt>Name</dt>
                    <dd>{c.reporter.anonymous ? "Anonymous" : c.reporter.name ?? "—"}</dd>
                    {c.reporter.organisation ? (
                      <>
                        <dt>Organisation</dt>
                        <dd>{c.reporter.organisation}</dd>
                      </>
                    ) : null}
                    {c.reporter.email ? (
                      <>
                        <dt>Email</dt>
                        <dd>{c.reporter.email}</dd>
                      </>
                    ) : null}
                    {c.reporter.phone ? (
                      <>
                        <dt>Phone</dt>
                        <dd>{c.reporter.phone}</dd>
                      </>
                    ) : null}
                    <dt>Prefers</dt>
                    <dd>{c.reporter.preferred}</dd>
                    <dt>Tracking code</dt>
                    <dd className="crm-mono">{c.access_code}</dd>
                  </dl>
                  {c.csat ? (
                    <>
                      <hr className="crm-divider" />
                      <div className="crm-row">
                        <Stars value={c.csat.score} size={18} />
                        <span className="crm-small">{c.csat.comment ?? "Rated"}</span>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>About</h3>
                  </div>
                  {client ? (
                    <div className="crm-stack" style={{ gap: 8 }}>
                      <Link to={`/crm/clients/${client.id}`} className="crm-link" style={{ fontSize: 14 }}>
                        {client.name} →
                      </Link>
                      <span className="crm-small">
                        {client.sector} · {client.region} · {client.tier} account
                      </span>
                      {client.certificates.map((x) => (
                        <div key={x.id} className="crm-row crm-small">
                          <span className="crm-mono">{x.id}</span>
                          <span>{x.standard}</span>
                          <span className={`crm-pill crm-pill--${x.status === "valid" ? "green" : x.status === "suspended" ? "red" : "slate"}`}>{x.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="crm-small">{c.about?.label ?? "Not linked to a client."}</span>
                  )}
                  {c.links.length ? (
                    <>
                      <hr className="crm-divider" />
                      <div className="crm-stack" style={{ gap: 6 }}>
                        {c.links.map((l) => (
                          <span key={l.ref} className="crm-row crm-small">
                            <Icon name={l.kind === "capa" ? "i-clipboard" : l.kind === "investigation" ? "i-shield" : "i-link"} size={14} />
                            {l.label}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {canHandOffSurv || canCapa ? (
                    <>
                      <hr className="crm-divider" />
                      {canHandOffSurv ? (
                        <button type="button" className="crm-btn crm-btn--sm" disabled={busy} onClick={() => void run(() => handOff(c.ref, actor, "investigation"), "Surveillance investigation opened")}>
                          <Icon name="i-shield" /> Open surveillance investigation
                        </button>
                      ) : null}
                      {canCapa ? (
                        <button type="button" className="crm-btn crm-btn--sm" disabled={busy} onClick={() => void run(() => handOff(c.ref, actor, "capa"), "Corrective action raised")}>
                          <Icon name="i-clipboard" /> Raise corrective action
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <CaseFieldVisitCard c={c} actor={actor} onDone={(m) => (showToast(m), res.reload())} />
                <CaseDeliveries c={c} />
                {dups.length ? (
                  <div className="crm-card">
                    <div className="crm-card__h">
                      <h3>Possible duplicates</h3>
                    </div>
                    <div className="crm-dup">
                      {dups.map((d) => (
                        <Link key={d.c.ref} to={`/crm/cases/${d.c.ref}`} className="crm-dup__i" style={{ color: "inherit", textDecoration: "none" }}>
                          <b>{d.c.subject}</b>
                          <span className="crm-small">
                            <span className="crm-mono">{d.c.ref}</span> · {d.c.state} · {d.why}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>

            <CrmDrawer
              open={Boolean(pending)}
              onClose={() => setPending(null)}
              title={pending?.label ?? ""}
              subtitle={pending?.consequence}
              footer={
                <>
                  <button type="button" className="crm-btn" onClick={() => setPending(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`crm-btn ${pending?.danger ? "crm-btn--danger" : "crm-btn--pri"}`}
                    disabled={busy || (pending?.requires === "duplicate_ref" ? !dupRef.trim() : !note.trim())}
                    onClick={() => void confirmPending()}
                  >
                    {busy ? "Saving…" : pending?.label}
                  </button>
                </>
              }
            >
              {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
              {pending?.requires === "duplicate_ref" ? (
                <label className="crm-field">
                  Original case reference
                  <input className="crm-input" value={dupRef} onChange={(e) => setDupRef(e.target.value)} placeholder="CS-26-0000" list="crm-dups" />
                  <datalist id="crm-dups">
                    {dups.map((d) => (
                      <option key={d.c.ref} value={d.c.ref} />
                    ))}
                  </datalist>
                  <span className="hint">The customer is told their report is being handled under that case.</span>
                </label>
              ) : (
                <label className="crm-field">
                  {pending?.requires === "resolution" ? "Resolution (sent to the customer)" : pending?.action === "request_info" ? "What you need (sent to the customer)" : "Reason"}
                  <textarea className="crm-textarea" style={{ minHeight: 160 }} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                </label>
              )}
              {pending?.action === "resolve" && c.type === "service_complaint" ? (
                <label className="crm-field">
                  Root cause
                  <Select value={rootCause || c.root_cause || ""} onChange={(val) => setRootCause(val)} block>
                    <option value="">Not recorded</option>
                    {ROOT_CAUSES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                  <span className="hint">Feeds the Quality Manager's complaints analysis and the Board complaints KPI.</span>
                </label>
              ) : null}
              {pending?.action === "resolve" ? (
                <span className="crm-small">
                  The customer can confirm or reopen within {cfg.reopen_days} days. After that the case closes automatically.
                </span>
              ) : null}
            </CrmDrawer>
            {toast}
          </>
        );
      }}
    </CrmGate>
  );
}

export type { Case };
