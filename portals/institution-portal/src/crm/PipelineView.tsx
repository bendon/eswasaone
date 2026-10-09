import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon, ModuleHeader, Select } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmDrawer,
  SERVICE_LABEL,
  daysFromNow,
  fmtDay,
  fmtE,
  fmtShortE,
  fmtWhen,
  listClients,
  listOpportunities,
  moveOpportunity,
  saveOpportunity,
  useCrm,
  useCrmToast,
  type Client,
  type Opportunity,
  type OpportunityStage,
  type ServiceLine,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, SIGNAL_META, STAGE_LABEL, useActor } from "./shared";

const STAGES: OpportunityStage[] = ["qualify", "proposal", "negotiation", "won", "lost"];
const SERVICES: ServiceLine[] = ["certification", "testing", "calibration", "training", "standards", "inspection"];

/** Opportunities — kanban by stage (drag to move) with a list toggle and an editing drawer. */
export function CrmPipelineView() {
  const actor = useActor();
  const [params, setParams] = useSearchParams();
  const [toast, showToast] = useCrmToast();
  const [mode, setMode] = useState<"board" | "list">("board");
  const [owner, setOwner] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<OpportunityStage | null>(null);
  const [lost, setLost] = useState<{ id: string; reason: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const openId = params.get("open");
  const isNew = params.get("new") === "1";

  const res = useCrm(async () => {
    const [opps, clients] = await Promise.all([listOpportunities(), listClients()]);
    return { opps, clients };
  });

  function closeDrawer() {
    const p = new URLSearchParams(params);
    p.delete("open");
    p.delete("new");
    p.delete("client");
    setParams(p, { replace: true });
  }

  async function move(id: string, stage: OpportunityStage, reason?: string) {
    setErr(null);
    if (stage === "lost" && !reason) {
      setLost({ id, reason: "" });
      return;
    }
    try {
      await moveOpportunity(id, stage, actor, reason);
      showToast(`Moved to ${STAGE_LABEL[stage]}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <CrmGate res={res} what="Opportunities">
      {({ opps, clients }) => {
        const nameOf = (o: Opportunity) => clients.find((c) => c.id === o.client_id)?.name ?? o.prospect_name ?? "—";
        const owners = [...new Set(opps.map((o) => o.owner))].sort();
        const shown = opps.filter((o) => owner === "all" || o.owner === owner);
        const live = shown.filter((o) => o.stage !== "won" && o.stage !== "lost");
        const weighted = live.reduce((s, o) => s + (o.value * o.probability) / 100, 0);
        const editing = isNew ? null : opps.find((o) => o.id === openId) ?? null;

        return (
          <>
            <ModuleHeader
              title="Opportunities"
              subtitle="Commercial pipeline across certification, testing, calibration, training, standards and inspection"
              summary={[
                { label: "Open pipeline", value: fmtShortE(live.reduce((s, o) => s + o.value, 0)) },
                { label: "Weighted", value: fmtShortE(weighted) },
                { label: "Closing in 30 days", value: live.filter((o) => daysFromNow(o.expected_close) <= 30).length },
              ]}
              extra={
                <button
                  type="button"
                  className="crm-btn crm-btn--pri"
                  onClick={() => {
                    const p = new URLSearchParams(params);
                    p.set("new", "1");
                    setParams(p, { replace: true });
                  }}
                >
                  <Icon name="i-plus" /> New opportunity
                </button>
              }
            />
            {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
            <div className="crm-toolbar">
              <div className="crm-seg">
                <button type="button" className={mode === "board" ? "on" : ""} onClick={() => setMode("board")}>
                  <Icon name="i-grid" size={14} /> Board
                </button>
                <button type="button" className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>
                  <Icon name="i-list" size={14} /> List
                </button>
              </div>
              <Select value={owner} onChange={(val) => setOwner(val)} aria-label="Owner">
                <option value="all">All owners</option>
                {owners.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
              <span className="crm-small" style={{ marginLeft: "auto" }}>
                Drag a card to change its stage
              </span>
            </div>

            {mode === "board" ? (
              <div className="crm-kanban">
                {STAGES.map((st) => {
                  const col = shown.filter((o) => o.stage === st);
                  return (
                    <div
                      key={st}
                      className={`crm-col${over === st ? " is-over" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setOver(st);
                      }}
                      onDragLeave={() => setOver((o) => (o === st ? null : o))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setOver(null);
                        if (dragId) void move(dragId, st);
                        setDragId(null);
                      }}
                    >
                      <div className="crm-col__h">
                        <b>{STAGE_LABEL[st]}</b>
                        <span className="crm-small">{col.length}</span>
                        <span>{fmtShortE(col.reduce((s, o) => s + o.value, 0))}</span>
                      </div>
                      {col.map((o) => (
                        <div
                          key={o.id}
                          className="crm-opp"
                          draggable
                          onDragStart={() => setDragId(o.id)}
                          onClick={() => {
                            const p = new URLSearchParams(params);
                            p.set("open", o.id);
                            setParams(p, { replace: true });
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const p = new URLSearchParams(params);
                              p.set("open", o.id);
                              setParams(p, { replace: true });
                            }
                          }}
                        >
                          <b>{o.title}</b>
                          <span className="crm-small">{nameOf(o)}</span>
                          <div className="crm-opp__f">
                            {o.source !== "manual" ? <span className="crm-pill crm-pill--gold" title="Created from a signal">{SIGNAL_META[o.source].label}</span> : null}
                            <span className="crm-small">{o.owner}</span>
                            <span className="crm-opp__v">{fmtShortE(o.value)}</span>
                          </div>
                          {st !== "won" && st !== "lost" ? (
                            <span className="crm-small" style={{ color: daysFromNow(o.expected_close) < 0 ? "var(--red)" : undefined }}>
                              Close {fmtDay(o.expected_close)} · {o.probability}%
                            </span>
                          ) : o.lost_reason ? (
                            <span className="crm-small">{o.lost_reason}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="crm-card crm-card--flush">
                <div className="crm-table-wrap">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Opportunity</th>
                        <th>Client</th>
                        <th>Stage</th>
                        <th>Owner</th>
                        <th>Expected close</th>
                        <th className="num">Value</th>
                        <th className="num">Prob.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((o) => (
                        <tr
                          key={o.id}
                          className="is-click"
                          onClick={() => {
                            const p = new URLSearchParams(params);
                            p.set("open", o.id);
                            setParams(p, { replace: true });
                          }}
                        >
                          <td>
                            <b>{o.title}</b>
                            <span className="crm-small">{o.services.map((s) => SERVICE_LABEL[s]).join(", ")}</span>
                          </td>
                          <td>{nameOf(o)}</td>
                          <td>
                            <span className={`crm-pill ${o.stage === "won" ? "crm-pill--green" : o.stage === "lost" ? "crm-pill--red" : ""}`}>{STAGE_LABEL[o.stage]}</span>
                          </td>
                          <td>{o.owner}</td>
                          <td className="crm-small">{fmtDay(o.expected_close)}</td>
                          <td className="num">{fmtE(o.value)}</td>
                          <td className="num">{o.probability}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <OpportunityDrawer
              key={isNew ? `new-${params.get("client") ?? ""}` : editing?.id ?? "none"}
              open={isNew || Boolean(editing)}
              opp={editing}
              presetClient={params.get("client") ?? undefined}
              clients={clients}
              owner={actor.name}
              onClose={closeDrawer}
              onSaved={(o) => {
                showToast(`Saved ${o.id}`);
                const p = new URLSearchParams();
                p.set("open", o.id);
                setParams(p, { replace: true });
              }}
              onMove={(stage) => editing && void move(editing.id, stage)}
            />

            <CrmDrawer
              open={Boolean(lost)}
              onClose={() => setLost(null)}
              title="Mark as lost"
              subtitle="Lost reasons feed win/loss analysis in Insights."
              footer={
                <>
                  <button type="button" className="crm-btn" onClick={() => setLost(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="crm-btn crm-btn--danger"
                    disabled={!lost?.reason.trim()}
                    onClick={() => {
                      if (lost) void move(lost.id, "lost", lost.reason.trim());
                      setLost(null);
                    }}
                  >
                    Mark lost
                  </button>
                </>
              }
            >
              <label className="crm-field">
                Why was it lost?
                <Select value={lost?.reason ?? ""} onChange={(val) => setLost((l) => (l ? { ...l, reason: val } : l))} block>
                  <option value="">Choose a reason…</option>
                  <option>Price — chose a private provider</option>
                  <option>Timing — postponed to next year</option>
                  <option>No budget</option>
                  <option>Went to a foreign certification body</option>
                  <option>No longer needed</option>
                  <option>No response from client</option>
                </Select>
              </label>
            </CrmDrawer>
            {toast}
          </>
        );
      }}
    </CrmGate>
  );
}

function OpportunityDrawer({
  open,
  opp,
  presetClient,
  clients,
  owner,
  onClose,
  onSaved,
  onMove,
}: {
  open: boolean;
  opp: Opportunity | null;
  presetClient?: string;
  clients: Client[];
  owner: string;
  onClose: () => void;
  onSaved: (o: Opportunity) => void;
  onMove: (stage: OpportunityStage) => void;
}) {
  const blank = (): Opportunity => ({
    id: "",
    title: "",
    client_id: presetClient,
    stage: "qualify",
    services: [],
    value: 0,
    probability: 25,
    owner,
    created_at: new Date().toISOString(),
    expected_close: new Date(Date.now() + 45 * 86_400_000).toISOString(),
    source: "manual",
    notes: [],
  });
  const [o, setO] = useState<Opportunity>(opp ? structuredClone(opp) : blank());
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (opp) setO(structuredClone(opp));
  }, [opp]);

  const set = <K extends keyof Opportunity>(k: K, v: Opportunity[K]) => setO((x) => ({ ...x, [k]: v }));

  async function save() {
    setErr(null);
    if (!o.title.trim()) return setErr("Give the opportunity a title.");
    if (!o.client_id && !o.prospect_name?.trim()) return setErr("Choose a client or enter a prospect name.");
    try {
      const next = { ...o, notes: note.trim() ? [{ at: new Date().toISOString(), by: owner, text: note.trim() }, ...o.notes] : o.notes };
      const saved = await saveOpportunity(next);
      setNote("");
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <CrmDrawer
      open={open}
      onClose={onClose}
      title={opp ? opp.title : "New opportunity"}
      subtitle={opp ? `${opp.id} · created ${fmtWhen(opp.created_at)}${opp.signal_id ? ` from signal ${opp.signal_id}` : ""}` : "Track a potential piece of work for a client or prospect."}
      footer={
        <>
          {opp && opp.stage !== "won" && opp.stage !== "lost" ? (
            <>
              <button type="button" className="crm-btn crm-btn--danger" onClick={() => onMove("lost")}>
                Lost
              </button>
              <button type="button" className="crm-btn" onClick={() => onMove("won")}>
                Won
              </button>
            </>
          ) : null}
          <span className="crm-spacer" />
          <button type="button" className="crm-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
      <div className="crm-form">
        <label className="crm-field">
          Title
          <input className="crm-input" value={o.title} onChange={(e) => set("title", e.target.value)} />
        </label>
        <div className="crm-form crm-form--2">
          <label className="crm-field">
            Client
            <Select value={o.client_id ?? ""} onChange={(val) => set("client_id", val || undefined)} block>
              <option value="">— Prospect (not in register) —</option>
              {[...clients]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </label>
          {!o.client_id ? (
            <label className="crm-field">
              Prospect name
              <input className="crm-input" value={o.prospect_name ?? ""} onChange={(e) => set("prospect_name", e.target.value)} />
            </label>
          ) : (
            <label className="crm-field">
              Owner
              <input className="crm-input" value={o.owner} onChange={(e) => set("owner", e.target.value)} />
            </label>
          )}
          <label className="crm-field">
            Stage
            <Select value={o.stage} onChange={(val) => set("stage", val as OpportunityStage)} block>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="crm-field">
            Expected close
            <input className="crm-input" type="date" value={o.expected_close.slice(0, 10)} onChange={(e) => set("expected_close", new Date(e.target.value).toISOString())} />
          </label>
          <label className="crm-field">
            Value (E, excl. VAT)
            <input className="crm-input" type="number" min={0} value={o.value} onChange={(e) => set("value", Number(e.target.value))} />
          </label>
          <label className="crm-field">
            Probability %
            <input className="crm-input" type="number" min={0} max={100} value={o.probability} onChange={(e) => set("probability", Number(e.target.value))} />
          </label>
        </div>
        <div className="crm-field">
          Services
          <div className="crm-row">
            {SERVICES.map((s) => (
              <label key={s} className="crm-check" style={{ fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={o.services.includes(s)}
                  onChange={(e) => set("services", e.target.checked ? [...o.services, s] : o.services.filter((x) => x !== s))}
                />
                {SERVICE_LABEL[s]}
              </label>
            ))}
          </div>
        </div>
        <label className="crm-field">
          Next step
          <input className="crm-input" value={o.next_step ?? ""} onChange={(e) => set("next_step", e.target.value)} placeholder="e.g. Call to confirm audit dates" />
        </label>
        {opp ? (
          <div className="crm-row">
            {o.quote_id ? (
              <Link className="crm-btn crm-btn--sm" to={`/crm/quotes?open=${o.quote_id}`}>
                <Icon name="i-file" /> Quote {o.quote_id}
              </Link>
            ) : (
              <Link className="crm-btn crm-btn--sm crm-btn--gold" to={`/crm/quotes?new=1&opp=${opp.id}${opp.client_id ? `&client=${opp.client_id}` : ""}`}>
                <Icon name="i-plus" /> Build a quote
              </Link>
            )}
            {o.client_id ? (
              <Link className="crm-btn crm-btn--sm crm-btn--ghost" to={`/crm/clients/${o.client_id}`}>
                Client 360 →
              </Link>
            ) : null}
          </div>
        ) : null}
        <label className="crm-field">
          Add a note
          <textarea className="crm-textarea" style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {o.notes.length ? (
          <ul className="crm-timeline">
            {o.notes.map((n, i) => (
              <li key={i}>
                <b>{n.by}</b>
                <span>
                  {fmtWhen(n.at)} — {n.text}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </CrmDrawer>
  );
}
