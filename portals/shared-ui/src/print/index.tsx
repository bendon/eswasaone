/**
 * Printable document kit (gap 01 C10) shared by the Institution /print route and the Service portal's
 * customer downloads: letterhead with verify link, signature blocks, and layouts for certificates,
 * calibration certificates, quotes, invoices, refusal letters and audit plans. Styled by `.eo-print`
 * (@media print) in workflow.css.
 * TODO: wire real — server-rendered PDF with a signed QR (GET /documents/{kind}/{id}.pdf).
 */
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "../brand/BrandLogo";
import { QrCode } from "./qr";
import { invoiceTotals, type Invoice } from "../billing/store";
import type { CertApplication, CertificateRec } from "../certification/types";
import type { CrmQuote } from "../crm/types";
import type { FieldVisit } from "../field/types";
import type { CalJob, LabEquipment, Method, MetrologySettings } from "../metrology/types";

/** Public Service-portal origin printed in verify QR codes (documents are printed from either portal). */
export function serviceUrl(path = ""): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const base = (env?.VITE_SERVICE_URL || "https://eswasa.co.sz").replace(/\/$/, "");
  return path ? `${base}/${path.replace(/^\//, "")}` : base;
}

export const fmtLong = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—");
export const money = (n: number) => `E ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const BANKING = "Standard Bank Eswatini · Account 9110 0034 5521 · Branch Mbabane (661164) · MTN MoMo Pay merchant 77 001 · Reference: your document number";

/** `verify` is the public Service-portal path the QR opens, e.g. "verify/<token>" or "verify/cal/<token>". */
export function Letterhead({ title, reference, status, verify }: { title: string; reference: string; status?: string; verify?: string }) {
  const url = serviceUrl(verify ?? `verify/${reference}`);
  return (
    <>
      <div className="eo-print__lh">
        <BrandLogo variant="mark" />
        <div>
          <b>Eswatini Standards Authority (ESWASA)</b>
          <span>Mbabane Business Park, Mbabane · +268 2518 4633 · info@eswasa.co.sz</span>
        </div>
        <div className="eo-print__qr">
          <QrCode value={url} size={74} title={`Scan to verify: ${url}`} />
          <span>Scan to verify</span>
          <br />
          <b style={{ fontSize: 10, color: "#1f3a78" }}>{url.replace(/^https?:\/\//, "")}</b>
        </div>
      </div>
      <h1>{title}</h1>
      <p style={{ margin: "0 0 18px", color: "#555" }}>
        Reference <b>{reference}</b>
        {status ? ` · ${status}` : ""}
      </p>
    </>
  );
}

export function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="eo-print__sig">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

export function PrintFrame({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <>
      <div className="eo-print__bar">
        <button type="button" className="crm-btn" onClick={() => (onClose ? onClose() : window.history.length > 1 ? window.history.back() : window.close())}>
          Back
        </button>
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
      <article className="eo-print">{children}</article>
    </>
  );
}

/** Load-and-render helper for print routes. */
export function usePrintDoc(load: () => ReactNode | Promise<ReactNode>, deps: unknown[]): ReactNode {
  const [body, setBody] = useState<ReactNode>(<p>Loading…</p>);
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(load)
      .then((n) => alive && setBody(n ?? <p>Document not found.</p>))
      .catch((e: unknown) => alive && setBody(<p>{e instanceof Error ? e.message : String(e)}</p>));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return body;
}

/* ---------------- certification ---------------- */

export function CertificateDoc({ cert }: { cert: CertificateRec }) {
  const valid = cert.state === "Active" || cert.state === "Surveillance Due";
  return (
    <>
      <Letterhead title="Certificate of registration" reference={cert.number} verify={`verify/${cert.token}`} status={valid ? `Valid until ${fmtLong(cert.expires_at)}` : cert.state.toUpperCase()} />
      {!valid ? <p className="eo-watermark">{cert.state}</p> : null}
      <p style={{ fontSize: 15 }}>This is to certify that</p>
      <h2 style={{ fontSize: 24, margin: "4px 0 10px" }}>{cert.org}</h2>
      <p style={{ fontSize: 15 }}>
        operates a system / produces products that conform to the requirements of <b>{cert.standard}</b> for the following scope:
      </p>
      <p style={{ fontSize: 16, fontWeight: 600, border: "1px solid #ccd", padding: 12, borderRadius: 6 }}>{cert.scope}</p>
      <table>
        <tbody>
          <tr>
            <th>Site(s)</th>
            <td>{cert.sites.join("; ")}</td>
          </tr>
          <tr>
            <th>First issued</th>
            <td>{fmtLong(cert.issued_at)}</td>
          </tr>
          <tr>
            <th>Expires</th>
            <td>{fmtLong(cert.expires_at)}</td>
          </tr>
          <tr>
            <th>Surveillance</th>
            <td>{cert.cycle.map((c) => `${c.label}: ${fmtLong(c.due)}${c.done_at ? " ✓" : ""}`).join(" · ")}</td>
          </tr>
          {cert.conditions ? (
            <tr>
              <th>Conditions</th>
              <td>{cert.conditions}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "#555" }}>Validity depends on satisfactory surveillance. Check the current status by scanning the QR code. Issued under CER_PR_014; use of the mark per CER_RU_028.</p>
      <Signatures left="Head of Certification" right="Executive Director" />
    </>
  );
}

export function RefusalLetterDoc({ app }: { app: CertApplication }) {
  const d = app.decision;
  return (
    <>
      <Letterhead title="Certification decision" reference={`${app.id}-DEC`} status={fmtLong(d?.at)} />
      <p>
        {app.contact}
        <br />
        {app.org}
      </p>
      <p>Dear {app.contact},</p>
      <p>
        <b>
          Application {app.id} — {app.standard}
        </b>
      </p>
      <p>After an independent technical review, the {d?.body ?? "certification body"} decided not to grant certification for the scope "{app.scope}".</p>
      <p>
        <b>Reasons:</b> {d?.note}
      </p>
      <p>
        You may appeal this decision until <b>{fmtLong(d?.appeal_until)}</b> (CER_PR_002). Lodge the appeal from your ESWASA account (Complaints → Appeal) or in writing. The appeal is heard by a panel that had no part in the original decision.
      </p>
      <p>You may re-apply at any time once the issues above are addressed.</p>
      <Signatures left={`${d?.by ?? ""}, for ESWASA`} right="" />
    </>
  );
}

export function CertQuoteDoc({ app }: { app: CertApplication }) {
  const q = app.quote;
  if (!q) return <p>No quote on this application.</p>;
  const t = invoiceTotals({ lines: q.lines, vat_rate: 0.15, payments: [] });
  return (
    <>
      <Letterhead title="Certification quotation & agreement" reference={q.id} status={`Valid until ${fmtLong(q.valid_until)}`} />
      <p>
        To: <b>{app.org}</b> · {app.contact} · Application {app.id} · {app.standard}
      </p>
      <LinesTable lines={q.lines} />
      <TotalsTable net={t.net} vat={t.vat} total={t.total} extra={[{ label: `Deposit due on acceptance (${q.deposit_pct}%)`, value: money(Math.round(t.total * q.deposit_pct) / 100) }]} />
      <h2>Terms</h2>
      <ol style={{ fontSize: 12.5 }}>
        <li>Audit duration: {q.auditor_days} auditor-days, based on {app.employees} employees and {app.sites.length} site(s). Changes in size or scope change the fee.</li>
        <li>The deposit unlocks audit planning. The balance and the certificate fee are invoiced on the certification decision.</li>
        <li>Surveillance audits are invoiced annually. Travel within Eswatini is included.</li>
        <li>The certification agreement incorporates CER_PR_014 (grant), CER_PR_026 (suspension/withdrawal) and CER_RU_028 (use of the mark).</li>
      </ol>
      <p style={{ fontSize: 12 }}>{BANKING}</p>
      {q.agreement ? (
        <p>
          <b>Accepted online</b> by {q.agreement.name}, {q.agreement.title} on {fmtLong(q.agreement.at)}.
        </p>
      ) : (
        <p style={{ fontSize: 12, color: "#555" }}>Accept online from your application page — scan the QR code at the top.</p>
      )}
      <Signatures left={`For ESWASA — ${q.issued_by}`} right="For the client (name, position, date)" />
    </>
  );
}

export function AuditPlanDoc({ app, visits }: { app: CertApplication; visits: FieldVisit[] }) {
  return (
    <>
      <Letterhead title="Audit plan" reference={`${app.id}-PLAN`} status={app.plan_sent_at ? `Sent ${fmtLong(app.plan_sent_at)}` : "Draft"} />
      <p>
        <b>{app.org}</b> · {app.standard} · Scope: {app.scope}
      </p>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Date</th>
            <th>Auditor-days</th>
            <th>Team</th>
            <th>Site</th>
          </tr>
        </thead>
        <tbody>
          {app.stages.map((s) => {
            const v = visits.find((x) => x.id === s.visit_id);
            return (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{fmtLong(v?.planned_date ?? s.date)}</td>
                <td>{s.days}</td>
                <td>{v?.lead ? [`${v.lead} (lead)`, ...v.team].join(", ") : "To be assigned"}</td>
                <td>{v?.site.name ?? app.sites[0]?.name}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12.5 }}>Opening meeting 08:30 on the first day; closing meeting at the end of the last day with your top management. Please make the management representative and records available. You may object to a team member within 5 working days on impartiality grounds.</p>
      <Signatures left="Scheme Manager" right="Client acknowledgement" />
    </>
  );
}

/* ---------------- metrology ---------------- */

export function CalCertificateDoc({ job, method, refs, settings }: { job: CalJob; method?: Method; refs: LabEquipment[]; settings: MetrologySettings }) {
  const c = job.certificate;
  if (!c) return <p>No certificate has been issued for this job yet.</p>;
  return (
    <>
      <Letterhead title="Calibration certificate" reference={c.id} verify={`verify/cal/${c.token}`} status={`Issued ${fmtLong(c.issued_at)}${c.version > 1 ? ` · version ${c.version} (supersedes earlier issue: ${c.reason})` : ""}`} />
      <table>
        <tbody>
          <tr>
            <th>Customer</th>
            <td>{job.customer}</td>
          </tr>
          <tr>
            <th>Job</th>
            <td>
              {job.id} · {job.location === "onsite" ? `On site — ${job.site ?? ""}` : "ESWASA metrology laboratory, Matsapha"}
            </td>
          </tr>
          <tr>
            <th>Method</th>
            <td>{method ? `${method.code} ${method.title}${method.accredited ? " (accredited scope)" : ""}` : "—"}</td>
          </tr>
          <tr>
            <th>Conditions</th>
            <td>{job.worksheet.env.temp_c !== undefined ? `${job.worksheet.env.temp_c} °C, ${job.worksheet.env.rh_pct} % RH` : "As recorded on site"}</td>
          </tr>
          <tr>
            <th>Traceability</th>
            <td>{refs.map((r) => `${r.id} ${r.name} (${r.traceability})`).join("; ") || "—"}</td>
          </tr>
        </tbody>
      </table>
      {job.items.map((item) => (
        <section key={item.id}>
          <h2>
            {item.description} — SN {item.serial}
          </h2>
          <p style={{ fontSize: 12.5 }}>
            {item.make ?? ""} {item.model ?? ""} · Range {item.range}
            {item.resolution ? ` · Resolution ${item.resolution}` : ""}
          </p>
          <table>
            <thead>
              <tr>
                <th>Nominal</th>
                <th>As found</th>
                <th>As left</th>
                <th>Error</th>
                <th>Tolerance</th>
                <th>U (k=2)</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {job.worksheet.points
                .filter((p) => p.item_id === item.id)
                .map((p) => {
                  const err = Math.round((p.as_found - p.nominal) * 1e6) / 1e6;
                  const oot = Math.abs(err) > p.tolerance;
                  return (
                    <tr key={p.id}>
                      <td>
                        {p.nominal} {p.unit}
                      </td>
                      <td>{p.as_found}</td>
                      <td>{p.as_left}</td>
                      <td>{err}</td>
                      <td>±{p.tolerance}</td>
                      <td>{p.uncertainty}</td>
                      <td>
                        <b>{oot ? "Out of tolerance (as found)" : "Pass"}</b>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}
      <p style={{ fontSize: 12 }}>{settings.certificate_statement}</p>
      <Signatures left={`Calibrated by ${job.metrologist ?? ""}`} right={`Approved by ${job.duties?.Reviewer?.[0] ?? c.by}`} />
    </>
  );
}

/* ---------------- commercial ---------------- */

function LinesTable({ lines }: { lines: { label: string; qty: number; unit_price: number }[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td>{l.label}</td>
            <td>{l.qty}</td>
            <td>{money(l.unit_price)}</td>
            <td>{money(l.qty * l.unit_price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsTable({ net, vat, total, discount, extra = [] }: { net: number; vat: number; total: number; discount?: { pct: number; amount: number }; extra?: { label: string; value: string }[] }) {
  return (
    <table style={{ width: 360, marginLeft: "auto" }}>
      <tbody>
        {discount?.amount ? (
          <tr>
            <th>Discount ({discount.pct}%)</th>
            <td>−{money(discount.amount)}</td>
          </tr>
        ) : null}
        <tr>
          <th>Net</th>
          <td>{money(net)}</td>
        </tr>
        <tr>
          <th>VAT 15%</th>
          <td>{money(vat)}</td>
        </tr>
        <tr>
          <th>Total</th>
          <td>
            <b>{money(total)}</b>
          </td>
        </tr>
        {extra.map((x) => (
          <tr key={x.label}>
            <th>{x.label}</th>
            <td>{x.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CrmQuoteDoc({ q, totals, acceptUrl }: { q: CrmQuote; totals: { subtotal: number; discount: number; net: number; vat: number; total: number }; acceptUrl: string }) {
  return (
    <>
      <Letterhead title="Quotation" reference={q.id} verify={`quotes/${q.id}`} status={`Valid until ${fmtLong(q.valid_until)}`} />
      <p>
        To: <b>{q.client_name}</b> · Date {fmtLong(q.sent_at ?? q.created_at)}
      </p>
      <LinesTable lines={q.lines} />
      <TotalsTable net={totals.net} vat={totals.vat} total={totals.total} discount={{ pct: q.discount_pct, amount: totals.discount }} />
      <h2>Terms</h2>
      <ol style={{ fontSize: 12.5 }}>
        <li>Prices in Emalangeni (E), VAT at 15 % where applicable. Valid until {fmtLong(q.valid_until)}.</li>
        <li>50 % deposit on acceptance unless agreed otherwise; balance on invoice, payable within 30 days.</li>
        <li>ESWASA's impartiality: commercial terms never influence certification or test outcomes.</li>
      </ol>
      <p style={{ fontSize: 12 }}>{BANKING}</p>
      <p style={{ fontSize: 12.5 }}>
        <b>Accept online:</b> {acceptUrl} (or scan the QR code).
      </p>
      {q.customer_acceptance && q.status === "accepted" ? (
        <p>
          Accepted online by {q.customer_acceptance.name}, {q.customer_acceptance.title}, on {fmtLong(q.customer_acceptance.at)}.
        </p>
      ) : null}
      <Signatures left={`For ESWASA — ${q.created_by}`} right="Accepted for the client (name, signature, date)" />
    </>
  );
}

export function InvoiceDoc({ inv }: { inv: Invoice }) {
  const t = invoiceTotals(inv);
  return (
    <>
      <Letterhead title="Tax invoice" reference={inv.id} status={`${inv.status.replace("_", " ")} · due ${fmtLong(inv.due_at)}`} />
      <p>
        To: <b>{inv.customer}</b> · For: {inv.title} ({inv.ref}) · Issued {fmtLong(inv.issued_at)}
      </p>
      <LinesTable lines={inv.lines} />
      <TotalsTable net={t.net} vat={t.vat} total={t.total} extra={[{ label: "Paid", value: money(t.paid) }, { label: "Balance due", value: money(t.balance) }]} />
      {inv.payments.length ? (
        <>
          <h2>Payments</h2>
          <table>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtLong(p.at)}</td>
                  <td>{p.method.toUpperCase()}</td>
                  <td>{p.reference}</td>
                  <td>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <p style={{ fontSize: 12 }}>{BANKING}</p>
    </>
  );
}

export { QrCode, qrMatrix } from "./qr";

/**
 * Calibration labels (07 P3): one sticker per item with a QR that opens the public certificate
 * verification page. `due` is the next calibration date per item (interval or recall suggestion).
 */
export function CalLabelsDoc({ job, due }: { job: CalJob; due: (itemId: string) => string | undefined }) {
  const c = job.certificate;
  if (!c) return <p>Labels print once the certificate is issued.</p>;
  const url = serviceUrl(`verify/cal/${c.token}`);
  return (
    <div className="eo-labels">
      {job.items.map((it) => (
        <div key={it.id} className="eo-label">
          <QrCode value={url} size={92} title={`Verify ${c.id}`} />
          <div>
            <b>ESWASA · CALIBRATED</b>
            <span>{it.description}</span>
            <span>S/N {it.serial}</span>
            <span>
              Cert <b>{c.id}</b>
            </span>
            <span>Cal {new Date(c.issued_at).toLocaleDateString()}</span>
            <span>
              Due <b>{due(it.id) ? new Date(due(it.id)!).toLocaleDateString() : "—"}</b>
            </span>
            <span className="eo-label__by">By {c.by.split(" ")[0]} · scan to verify</span>
          </div>
        </div>
      ))}
    </div>
  );
}
