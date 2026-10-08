import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon, ModuleHeader } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmDrawer,
  CrmEmpty,
  SERVICE_LABEL,
  actOnQuote,
  fmtDay,
  fmtE,
  getCrmConfig,
  isCaseManager,
  listClients,
  listOpportunities,
  listQuotes,
  quoteTotals,
  saveQuote,
  useCrm,
  useCrmToast,
  type Client,
  type CrmConfig,
  type CrmQuote,
  type Opportunity,
  type QuoteAction,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, QUOTE_STATUS, useActor } from "./shared";

type Filter = "all" | CrmQuote["status"];

/**
 * Quotes — multi-service quote builder from the price list, discount approval, send, accept → convert.
 * Certification RFQs from the Service portal stay in Certification → Quotes (scheme-specific fee builder).
 */
export function CrmQuotesView() {
  const actor = useActor();
  const [params, setParams] = useSearchParams();
  const [toast, showToast] = useCrmToast();
  const [filter, setFilter] = useState<Filter>("all");
  const openId = params.get("open");
  const isNew = params.get("new") === "1";

  const res = useCrm(async () => {
    const [quotes, clients, opps, cfg] = await Promise.all([listQuotes(), listClients(), listOpportunities(), getCrmConfig()]);
    return { quotes, clients, opps, cfg };
  });

  function setOpen(id: string | null) {
    const p = new URLSearchParams();
    if (id) p.set("open", id);
    setParams(p, { replace: true });
  }

  return (
    <CrmGate res={res} what="Quotes">
      {({ quotes, clients, opps, cfg }) => {
        const rows = quotes.filter((q) => filter === "all" || q.status === filter);
        const editing = isNew ? null : quotes.find((q) => q.id === openId) ?? null;
        const pending = quotes.filter((q) => q.status === "pending_approval").length;
        const sentValue = quotes.filter((q) => q.status === "sent").reduce((s, q) => s + quoteTotals(q).net, 0);
        return (
          <>
            <ModuleHeader
              title="Quotes"
              subtitle="Multi-service quotes from the price list — certification, testing, calibration, training, standards and inspection"
              summary={[
                { label: "Out with clients", value: fmtE(sentValue) },
                { label: "Awaiting approval", value: pending, variant: pending ? "due" : undefined },
                { label: "Accepted", value: quotes.filter((q) => q.status === "accepted").length, variant: "ok" },
              ]}
              extra={
                <button
                  type="button"
                  className="crm-btn crm-btn--pri"
                  onClick={() => {
                    const p = new URLSearchParams();
                    p.set("new", "1");
                    setParams(p, { replace: true });
                  }}
                >
                  <Icon name="i-plus" /> New quote
                </button>
              }
            />
            <CrmBanner tone="info" icon="i-badge">
              Certification RFQs that customers send from the Service portal are priced in{" "}
              <Link className="crm-link" to="/certification/quotes">
                Certification → Quotes
              </Link>
              . Use this builder for mixed or non-certification work.
            </CrmBanner>
            <div className="crm-toolbar">
              <div className="crm-seg">
                {(["all", "draft", "pending_approval", "sent", "accepted", "declined"] as Filter[]).map((f) => (
                  <button key={f} type="button" className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : QUOTE_STATUS[f].label}
                    <span className="n">{f === "all" ? quotes.length : quotes.filter((q) => q.status === f).length}</span>
                  </button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <CrmEmpty icon="i-file" title="No quotes here" />
            ) : (
              <div className="crm-card crm-card--flush">
                <div className="crm-table-wrap">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Quote</th>
                        <th>Client</th>
                        <th>Services</th>
                        <th>Status</th>
                        <th>Valid until</th>
                        <th className="num">Total (incl. VAT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((q) => {
                        const svcs = [...new Set(q.lines.map((l) => cfg.price_list.find((p) => p.code === l.code)?.service).filter(Boolean))] as string[];
                        return (
                          <tr key={q.id} className="is-click" onClick={() => setOpen(q.id)}>
                            <td>
                              <b className="crm-mono">{q.id}</b>
                              <span className="crm-small">by {q.created_by}</span>
                            </td>
                            <td>{q.client_name}</td>
                            <td className="crm-small">{svcs.map((s) => SERVICE_LABEL[s]).join(", ")}</td>
                            <td>
                              <span className={`crm-pill crm-pill--${QUOTE_STATUS[q.status].tone}`}>{QUOTE_STATUS[q.status].label}</span>
                            </td>
                            <td className="crm-small">{fmtDay(q.valid_until)}</td>
                            <td className="num">
                              <b>{fmtE(quoteTotals(q).total)}</b>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <QuoteDrawer
              key={isNew ? `new-${params.get("client") ?? ""}-${params.get("opp") ?? ""}` : editing?.id ?? "none"}
              open={isNew || Boolean(editing)}
              quote={editing}
              presetClient={params.get("client") ?? undefined}
              presetOpp={params.get("opp") ?? undefined}
              clients={clients}
              opps={opps}
              cfg={cfg}
              canApprove={isCaseManager(actor)}
              author={actor.name}
              onClose={() => setOpen(null)}
              onSaved={(q, msg) => {
                showToast(msg);
                setOpen(q.id);
              }}
              onAct={async (q, a, note) => {
                await actOnQuote(q.id, a, actor, note);
                showToast(
                  {
                    submit: "Sent for approval",
                    approve: "Discount approved",
                    reject: "Discount rejected",
                    send: "Quote sent to client",
                    accept: "Marked accepted — opportunity won",
                    decline: "Marked declined",
                    convert: "Work orders and invoice created",
                  }[a],
                );
              }}
            />
            {toast}
          </>
        );
      }}
    </CrmGate>
  );
}

function QuoteDrawer({
  open,
  quote,
  presetClient,
  presetOpp,
  clients,
  opps,
  cfg,
  canApprove,
  author,
  onClose,
  onSaved,
  onAct,
}: {
  open: boolean;
  quote: CrmQuote | null;
  presetClient?: string;
  presetOpp?: string;
  clients: Client[];
  opps: Opportunity[];
  cfg: CrmConfig;
  canApprove: boolean;
  author: string;
  onClose: () => void;
  onSaved: (q: CrmQuote, msg: string) => void;
  onAct: (q: CrmQuote, a: QuoteAction, note?: string) => Promise<void>;
}) {
  const blank = (): CrmQuote => {
    const client = clients.find((c) => c.id === presetClient);
    return {
      id: "",
      opportunity_id: presetOpp,
      client_id: client?.id,
      client_name: client?.name ?? "",
      status: "draft",
      lines: [],
      discount_pct: 0,
      valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      created_at: new Date().toISOString(),
      created_by: author,
      converted: [],
    };
  };
  const [q, setQ] = useState<CrmQuote>(quote ? structuredClone(quote) : blank());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (quote) setQ(structuredClone(quote));
  }, [quote]);

  const editable = q.status === "draft";
  const t = quoteTotals(q);
  const needsApproval = q.discount_pct > cfg.discount_approval_pct;
  const services = [...new Set(cfg.price_list.map((p) => p.service))];
  const clientOpps = opps.filter((o) => (q.client_id ? o.client_id === q.client_id : true) && o.stage !== "won" && o.stage !== "lost");

  async function save(msg = "Quote saved") {
    setErr(null);
    if (!q.client_name.trim()) return setErr("Choose a client.");
    if (!q.lines.length) return setErr("Add at least one line.");
    setBusy(true);
    try {
      const saved = await saveQuote(q);
      onSaved(saved, msg);
      return saved;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(a: QuoteAction, note?: string) {
    setErr(null);
    setBusy(true);
    try {
      let target = quote;
      if (editable && (a === "send" || a === "submit")) target = (await save()) ?? null;
      if (!target) return;
      await onAct(target, a, note);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmDrawer
      open={open}
      wide
      onClose={onClose}
      title={quote ? `Quote ${quote.id}` : "New quote"}
      subtitle={
        quote ? (
          <>
            <span className={`crm-pill crm-pill--${QUOTE_STATUS[q.status].tone}`}>{QUOTE_STATUS[q.status].label}</span> · {q.client_name} · created {fmtDay(q.created_at)} by {q.created_by}
          </>
        ) : (
          "Pick services from the price list. Discounts above the approval threshold need a Sales Manager."
        )
      }
      footer={
        <>
          {q.status === "draft" ? (
            <>
              <button type="button" className="crm-btn" disabled={busy} onClick={() => void save()}>
                Save draft
              </button>
              {needsApproval && !q.approval ? (
                <button type="button" className="crm-btn crm-btn--gold" disabled={busy} onClick={() => void act("submit")}>
                  Send for discount approval
                </button>
              ) : (
                <button type="button" className="crm-btn crm-btn--pri" disabled={busy} onClick={() => void act("send")}>
                  <Icon name="i-send" /> Send to client
                </button>
              )}
            </>
          ) : null}
          {q.status === "pending_approval" ? (
            canApprove ? (
              <>
                <button type="button" className="crm-btn crm-btn--danger" disabled={busy} onClick={() => void act("reject", `Reduce to ${cfg.discount_approval_pct}%`)}>
                  Reject discount
                </button>
                <button type="button" className="crm-btn crm-btn--pri" disabled={busy} onClick={() => void act("approve")}>
                  Approve {q.discount_pct}% discount
                </button>
              </>
            ) : (
              <span className="crm-small">Waiting for a Sales Manager to approve the discount.</span>
            )
          ) : null}
          {q.status === "sent" ? (
            <>
              <button type="button" className="crm-btn crm-btn--danger" disabled={busy} onClick={() => void act("decline", "Client declined")}>
                Client declined
              </button>
              <button type="button" className="crm-btn crm-btn--pri" disabled={busy} onClick={() => void act("accept")}>
                Client accepted
              </button>
            </>
          ) : null}
          {q.status === "accepted" && !q.converted.length ? (
            <button type="button" className="crm-btn crm-btn--pri" disabled={busy} onClick={() => void act("convert")}>
              <Icon name="i-check-c" /> Create work orders &amp; invoice
            </button>
          ) : null}
          {quote ? (
            <a className="crm-btn crm-btn--ghost" href={`/institution/print/quote/${encodeURIComponent(quote.id)}`} target="_blank" rel="noreferrer">
              <Icon name="i-download" /> Print / PDF
            </a>
          ) : null}
        </>
      }
    >
      {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
      {q.approval ? (
        <CrmBanner tone="ok">
          Discount approved by {q.approval.by} on {fmtDay(q.approval.at)}.
        </CrmBanner>
      ) : needsApproval && editable ? (
        <CrmBanner>
          {q.discount_pct}% is above the {cfg.discount_approval_pct}% limit. A Sales Manager must approve it before the quote can be sent.
        </CrmBanner>
      ) : null}
      {q.converted.length ? (
        <CrmBanner tone="ok">
          Created: {q.converted.map((c) => `${c.kind.replace("_", " ")} ${c.ref}`).join(" · ")}
        </CrmBanner>
      ) : null}

      <div className="crm-form crm-form--2">
        <label className="crm-field">
          Client
          <select
            className="crm-select"
            disabled={!editable}
            value={q.client_id ?? ""}
            onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              setQ((x) => ({ ...x, client_id: c?.id, client_name: c?.name ?? "" }));
            }}
          >
            <option value="">Choose…</option>
            {[...clients]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="crm-field">
          Opportunity
          <select className="crm-select" disabled={!editable} value={q.opportunity_id ?? ""} onChange={(e) => setQ((x) => ({ ...x, opportunity_id: e.target.value || undefined }))}>
            <option value="">— None —</option>
            {clientOpps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <table className="crm-qlines">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: 80 }}>Qty</th>
              <th style={{ width: 130 }}>Unit price</th>
              <th className="num" style={{ width: 110 }}>
                Amount
              </th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.label}
                  <span className="crm-small crm-mono" style={{ display: "block" }}>
                    {l.code} · {cfg.price_list.find((p) => p.code === l.code)?.unit}
                  </span>
                </td>
                <td>
                  <input
                    className="crm-input"
                    type="number"
                    min={1}
                    disabled={!editable}
                    value={l.qty}
                    onChange={(e) => setQ((x) => ({ ...x, lines: x.lines.map((y, j) => (j === i ? { ...y, qty: Math.max(1, Number(e.target.value)) } : y)) }))}
                    aria-label={`Quantity for ${l.label}`}
                  />
                </td>
                <td>
                  <input
                    className="crm-input"
                    type="number"
                    min={0}
                    disabled={!editable}
                    value={l.unit_price}
                    onChange={(e) => setQ((x) => ({ ...x, lines: x.lines.map((y, j) => (j === i ? { ...y, unit_price: Number(e.target.value) } : y)) }))}
                    aria-label={`Unit price for ${l.label}`}
                  />
                </td>
                <td className="num">{fmtE(l.qty * l.unit_price)}</td>
                <td>
                  {editable ? (
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" aria-label="Remove line" onClick={() => setQ((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>
                      ×
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable ? (
          <select
            className="crm-select"
            style={{ marginTop: 10 }}
            value=""
            onChange={(e) => {
              const p = cfg.price_list.find((x) => x.code === e.target.value);
              if (p) setQ((x) => ({ ...x, lines: [...x.lines, { code: p.code, label: p.label, qty: 1, unit_price: p.amount }] }));
            }}
            aria-label="Add a line from the price list"
          >
            <option value="">+ Add from price list…</option>
            {services.map((s) => (
              <optgroup key={s} label={SERVICE_LABEL[s]}>
                {cfg.price_list
                  .filter((p) => p.service === s)
                  .map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label} — {fmtE(p.amount)} {p.unit}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        ) : null}
        <div className="crm-totals">
          <span>Subtotal</span>
          <b>{fmtE(t.subtotal)}</b>
          <span className="crm-row" style={{ gap: 6 }}>
            Discount
            {editable ? (
              <input
                className="crm-input"
                type="number"
                min={0}
                max={50}
                style={{ width: 70, minHeight: 28, padding: "2px 8px" }}
                value={q.discount_pct}
                onChange={(e) => setQ((x) => ({ ...x, discount_pct: Math.max(0, Math.min(50, Number(e.target.value))), approval: undefined }))}
                aria-label="Discount percent"
              />
            ) : (
              ` ${q.discount_pct}`
            )}
            %
          </span>
          <b>−{fmtE(t.discount)}</b>
          <span>VAT 15%</span>
          <b>{fmtE(t.vat)}</b>
          <span className="grand">Total</span>
          <b className="grand">{fmtE(t.total)}</b>
        </div>
      </div>

      <div className="crm-form crm-form--2">
        <label className="crm-field">
          Valid until
          <input className="crm-input" type="date" disabled={!editable} value={q.valid_until.slice(0, 10)} onChange={(e) => setQ((x) => ({ ...x, valid_until: new Date(e.target.value).toISOString() }))} />
        </label>
        <label className="crm-field">
          Notes for the client
          <input className="crm-input" disabled={!editable} value={q.notes ?? ""} onChange={(e) => setQ((x) => ({ ...x, notes: e.target.value }))} />
        </label>
      </div>
      <span className="crm-small">Prices come from the Settings price list (placeholder amounts until ESWASA's fee schedule is loaded). VAT treatment of statutory fees is to confirm.</span>
    </CrmDrawer>
  );
}
