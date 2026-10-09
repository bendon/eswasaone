/**
 * Customer commercial pages (gap 04 R2, R12, P2; 05 C11): CRM quotes in the account and by public
 * link (accept with e-signature → invoice with deposit → pay), invoices with checkout, the help /
 * knowledge-base page, and printable customer documents.
 */
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { fmtMoney, getInvoice, invoiceTotals, listInvoices } from "@eswasaone/shared-ui/billing";
import { getApplication, getCertificate } from "@eswasaone/shared-ui/certification";
import { customerActOnQuote, getQuoteForCustomer, listQuotesForCustomer, markArticleHelpful, quoteTotals, searchArticles, useCrm, type CrmQuote } from "@eswasaone/shared-ui/crm";
import { getJob } from "@eswasaone/shared-ui/metrology";
import { CalCertificateDoc, CertificateDoc, CertQuoteDoc, CrmQuoteDoc, InvoiceDoc, PrintFrame, usePrintDoc } from "@eswasaone/shared-ui/print";
import { fmtD, Loadable, Panel, PayDialog, PublicPage, Toast, useCustomer, useCustomerData, useMsg } from "./ui";

const STATUS_TONE: Record<string, string> = { sent: "amber", accepted: "green", declined: "red", expired: "slate" };

export function AccountQuotesPage() {
  const me = useCustomer();
  const res = useCrm(() => listQuotesForCustomer(me.email), [me.email]);
  return (
    <Panel title="Quotes" sub="Quotes from ESWASA. Accept online with your name and position; pay the deposit or ask to be invoiced.">
      {res.notConnected ? (
        <div className="crm-empty" role="status">
          <Icon name="i-link" />
          <b>Quotes aren't connected yet</b>
          <p>Online quotes are managed by the CRM quotes endpoint, which isn't live yet. Please ask ESWASA for a PDF quote.</p>
        </div>
      ) : res.loading && !res.data ? (
        <p className="page-note">Loading…</p>
      ) : (res.data ?? []).length ? (
        <table className="crm-table">
          <thead>
            <tr>
              <th>Quote</th>
              <th>Total</th>
              <th>Valid until</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(res.data ?? []).map((q) => (
              <tr key={q.id}>
                <td>
                  <Link to={`/account/quotes/${q.id}`}>
                    <b>{q.id}</b>
                  </Link>
                  <span className="crm-small">{q.lines.map((l) => l.label).join(", ")}</span>
                </td>
                <td>{fmtMoney(quoteTotals(q).total)}</td>
                <td>{fmtD(q.valid_until)}</td>
                <td>
                  <span className={`crm-pill crm-pill--${STATUS_TONE[q.status] ?? "slate"}`}>{q.status === "sent" ? "Action needed" : q.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : res.data ? (
        <div className="crm-empty">
          <Icon name="i-dollar" />
          <b>No quotes yet</b>
          <p>
            Certification quotes appear on your <Link to="/account/applications">applications</Link>; calibration quotes on <Link to="/account/calibration">calibration jobs</Link>.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

export function AccountQuoteDetailPage() {
  const { id = "" } = useParams();
  const me = useCustomer();
  const res = useCrm(() => getQuoteForCustomer(id, { email: me.email }), [id, me.email]);
  return (
    <Panel title={`Quote ${id}`}>
      {res.data === null ? <div className="crm-banner crm-banner--err">Quote not found for this account.</div> : res.data ? <QuoteView q={res.data} who={me.name} reload={res.reload} /> : <p className="page-note">Loading…</p>}
    </Panel>
  );
}

export function PublicQuotePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const res = useCrm(() => getQuoteForCustomer(id, { code }), [id, code]);
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: `Quote ${id}` }]} title={`Quotation ${id}`} lead="Review and accept your ESWASA quote — no account needed.">
      {res.data === null ? <div className="crm-banner crm-banner--err">This link isn't valid. Check the code in your email, or sign in to see your quotes.</div> : res.data ? <QuoteView q={res.data} who="" reload={res.reload} /> : <p className="page-note">Loading…</p>}
    </PublicPage>
  );
}

function QuoteView({ q, who, reload }: { q: CrmQuote; who: string; reload: () => void }) {
  const t = quoteTotals(q);
  const [sig, setSig] = useState({ name: who, title: "", agree: false });
  const [decline, setDecline] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState(false);
  const [msg, show] = useMsg();
  const inv = q.invoice_id ? getInvoice(q.invoice_id) : null;
  return (
    <div className="crm-stack">
      <Toast msg={msg} />
      <div className="crm-card">
        <p style={{ margin: "0 0 8px" }}>
          For <b>{q.client_name}</b> · sent {fmtD(q.sent_at)} · valid until {fmtD(q.valid_until)}
        </p>
        <table className="crm-table">
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.label}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{fmtMoney(l.qty * l.unit_price)}</td>
              </tr>
            ))}
            {t.discount ? (
              <tr>
                <td colSpan={2}>Discount ({q.discount_pct}%)</td>
                <td className="num">−{fmtMoney(t.discount)}</td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={2}>VAT 15%</td>
              <td className="num">{fmtMoney(t.vat)}</td>
            </tr>
            <tr>
              <td colSpan={2}>
                <b>Total</b>
              </td>
              <td className="num">
                <b>{fmtMoney(t.total)}</b>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="crm-small">
          50% deposit on acceptance; balance on invoice within 30 days.{" "}
          <Link to={`/print/quote/${q.id}`} target="_blank">
            Printable quote
          </Link>
        </p>
      </div>
      {q.status === "sent" ? (
        <div className="crm-card">
          <h3 style={{ marginTop: 0 }}>Accept this quote</h3>
          <div className="crm-grid crm-grid--2">
            <label className="crm-field">
              Full name
              <input className="crm-input" value={sig.name} onChange={(e) => setSig({ ...sig, name: e.target.value })} />
            </label>
            <label className="crm-field">
              Position
              <input className="crm-input" value={sig.title} onChange={(e) => setSig({ ...sig, title: e.target.value })} />
            </label>
          </div>
          <label className="crm-check">
            <input type="checkbox" checked={sig.agree} onChange={(e) => setSig({ ...sig, agree: e.target.checked })} /> I accept the quote and terms on behalf of {q.client_name}.
          </label>
          {err ? <p className="eo-error">{err}</p> : null}
          <div className="crm-row" style={{ marginTop: 10 }}>
            <button type="button" className="crm-btn crm-btn--pri" disabled={!sig.agree || !sig.name.trim() || !sig.title.trim()} onClick={() => void customerActOnQuote(q.id, "accept", sig).then(() => (reload(), show("Accepted — you can pay the deposit now.")), (e: Error) => setErr(e.message))}>
              Accept quote
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setDecline((d) => !d)}>
              Decline
            </button>
          </div>
          {decline ? (
            <div style={{ marginTop: 10 }}>
              <textarea className="crm-textarea" placeholder="Why? (price, timing, scope…)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="crm-btn crm-btn--sm crm-btn--danger" disabled={!reason.trim()} onClick={() => void customerActOnQuote(q.id, "decline", { name: sig.name || "Customer", title: sig.title, reason }).then(() => (reload(), show("Declined — thank you for telling us.")), (e: Error) => setErr(e.message))}>
                Decline quote
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={`crm-banner crm-banner--${q.status === "accepted" ? "ok" : "info"}`}>
          {q.status === "accepted" ? `Accepted ${fmtD(q.accepted_at)}${q.customer_acceptance ? ` by ${q.customer_acceptance.name}, ${q.customer_acceptance.title}` : ""}.` : `This quote is ${q.status}.`}
          {inv ? ` Invoice ${inv.id}: paid ${fmtMoney(invoiceTotals(inv).paid)} of ${fmtMoney(invoiceTotals(inv).total)}.` : ""}
        </div>
      )}
      {inv && invoiceTotals(inv).balance > 0 ? (
        <button type="button" className="crm-btn crm-btn--pri" style={{ alignSelf: "flex-start" }} onClick={() => setPay(true)}>
          Pay deposit ({fmtMoney(inv.deposit ?? invoiceTotals(inv).balance)})
        </button>
      ) : null}
      {pay && inv ? <PayDialog inv={inv} amount={inv.deposit} title="Pay deposit" onClose={() => setPay(false)} onPaid={(_, m) => (setPay(false), reload(), show(m === "eft" ? "We'll confirm when the EFT arrives." : m === "invoice" ? "Noted — pay on the invoice terms." : "Payment received. Thank you!"))} /> : null}
    </div>
  );
}

export function AccountInvoicesPage() {
  const me = useCustomer();
  const [msg, show] = useMsg();
  const [pay, setPay] = useState<string | null>(null);
  const res = useCustomerData(() => listInvoices({ email: me.email }), [me.email]);
  return (
    <Panel title="Invoices & payments" sub="Certification, calibration and other ESWASA invoices. Pay by MoMo or card, or see the EFT reference.">
      <Toast msg={msg} />
      <Loadable res={res} what="Invoices">
        {(rows) => {
          const due = rows.filter((i) => ["unpaid", "part_paid", "overdue"].includes(i.status)).reduce((n, i) => n + invoiceTotals(i).balance, 0);
          const p = rows.find((i) => i.id === pay);
          return (
            <>
              <p>
                Outstanding: <b>{fmtMoney(due)}</b>
              </p>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>For</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Due</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const t = invoiceTotals(i);
                    return (
                      <tr key={i.id}>
                        <td>
                          <Link to={`/print/invoice/${i.id}`} target="_blank">
                            <b>{i.id}</b>
                          </Link>
                          <span className="crm-small">{fmtD(i.issued_at)}</span>
                        </td>
                        <td>
                          {i.title}
                          <span className="crm-small">{i.ref}</span>
                        </td>
                        <td>{fmtMoney(t.total)}</td>
                        <td>{fmtMoney(t.balance)}</td>
                        <td>
                          {fmtD(i.due_at)} <span className={`crm-pill crm-pill--${i.status === "paid" ? "green" : i.status === "overdue" ? "red" : "amber"}`}>{i.status.replace("_", " ")}</span>
                        </td>
                        <td className="num">
                          {t.balance > 0 && i.status !== "cancelled" ? (
                            <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setPay(i.id)}>
                              Pay
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {p ? <PayDialog inv={p} onClose={() => setPay(null)} onPaid={(_, m) => (setPay(null), show(m === "eft" ? "We'll confirm when the EFT arrives." : m === "invoice" ? "Noted." : "Payment received. Thank you!"))} /> : null}
            </>
          );
        }}
      </Loadable>
    </Panel>
  );
}

export function HelpPage() {
  const [q, setQ] = useState("");
  const [thanks, setThanks] = useState<string[]>([]);
  const hits = searchArticles(q);
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Help" }]} title="Help & answers" lead="Search common questions before contacting us. Still stuck? Lodge an enquiry or complaint and track it online.">
      <input className="crm-input" style={{ fontSize: 17, padding: 12, maxWidth: 560 }} placeholder="e.g. how long does certification take?" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="crm-stack" style={{ marginTop: 16, maxWidth: 760 }}>
        {hits.map((a) => (
          <details key={a.id} className="crm-card">
            <summary style={{ cursor: "pointer" }}>
              <b>{a.title}</b>
            </summary>
            <p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
            {thanks.includes(a.id) ? (
              <span className="crm-small">Thanks for the feedback.</span>
            ) : (
              <button type="button" className="crm-link" onClick={() => (markArticleHelpful(a.id), setThanks([...thanks, a.id]))}>
                This helped
              </button>
            )}
          </details>
        ))}
        {!hits.length ? <p className="page-note">No articles match. Try other words, or contact us below.</p> : null}
        <div className="crm-row">
          <Link className="cf-btn cf-btn--pri" to="/complaints">
            Contact us / lodge a case
          </Link>
          <Link className="cf-btn cf-btn--ghost" to="/complaints/track">
            Track a case
          </Link>
        </div>
      </div>
    </PublicPage>
  );
}

/** Customer-safe printable documents (certificate, calibration certificate, invoice, quotes). */
export function CustomerPrintPage() {
  const { kind = "", id = "" } = useParams();
  const [params] = useSearchParams();
  const body = usePrintDoc(async () => {
    if (kind === "certificate") {
      const c = getCertificate(id);
      return c ? <CertificateDoc cert={c.cert} /> : null;
    }
    if (kind === "calcert") {
      const j = getJob(id);
      return j ? <CalCertificateDoc job={j.job} method={j.method} refs={j.refs} settings={j.settings} /> : null;
    }
    if (kind === "invoice") {
      const i = getInvoice(id);
      return i ? <InvoiceDoc inv={i} /> : null;
    }
    if (kind === "certquote") {
      const b = await getApplication(id);
      return b ? <CertQuoteDoc app={b.app} /> : null;
    }
    if (kind === "quote") {
      const q = await getQuoteForCustomer(id, { code: params.get("code") ?? undefined, email: "demo" });
      return q ? <CrmQuoteDoc q={q} totals={quoteTotals(q)} acceptUrl={`${window.location.origin}/quotes/${q.id}?code=${q.public_code ?? ""}`} /> : null;
    }
    return <p>Unknown document.</p>;
  }, [kind, id]);
  return <PrintFrame>{body}</PrintFrame>;
}

