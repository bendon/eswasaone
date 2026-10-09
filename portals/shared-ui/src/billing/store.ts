/**
 * Invoices and payments for customer-facing work (gap 05 C11, 04 R2, 07 M7): certification deposits and
 * certificate fees, calibration jobs, accepted CRM quotes. One place the Service portal's
 * /account/invoices reads, and the demo checkout (MoMo / card / "invoice me") writes.
 *
 * TODO: wire real — GET /account/invoices, POST /finance/invoices, POST /estore/checkout {invoice},
 *       payment webhook → Payment Entry in ERPNext. Payments in demo mode never touch a real gateway.
 */
import { createLocalStore, isoIn, nowIso } from "../store/localStore";

export type InvoiceSource = "certification" | "metrology" | "crm" | "standards" | "training";
export type InvoiceStatus = "unpaid" | "part_paid" | "paid" | "overdue" | "cancelled";
export type PayMethod = "momo" | "card" | "eft" | "invoice";

export type InvoiceLine = { label: string; qty: number; unit_price: number };

export type Invoice = {
  id: string;
  source: InvoiceSource;
  /** Record the invoice belongs to (application id, job id, quote id). */
  ref: string;
  title: string;
  customer: string;
  customer_email: string;
  client_id?: string;
  lines: InvoiceLine[];
  vat_rate: number;
  issued_at: string;
  due_at: string;
  /** Portion that unlocks the next step (deposit), if any. */
  deposit?: number;
  payments: { id: string; at: string; amount: number; method: PayMethod; reference: string }[];
  status: InvoiceStatus;
};

type BillingState = { v: 1; seq: number; invoices: Record<string, Invoice> };

const DEMO_EMAIL = "demo";

function inv(p: Omit<Invoice, "status" | "payments" | "vat_rate"> & Partial<Pick<Invoice, "payments" | "vat_rate">>): Invoice {
  const i: Invoice = { vat_rate: 0.15, payments: [], status: "unpaid", ...p };
  i.status = statusOf(i);
  return i;
}

function seed(): BillingState {
  const rows: Invoice[] = [
    inv({ id: "INV-26-4101", source: "certification", ref: "CERT-APP-26-0019", title: "ISO 22000 surveillance audit 1 fee", customer: "Swazi Fresh Produce Ltd", customer_email: DEMO_EMAIL, lines: [{ label: "Surveillance audit (2 auditor-days)", qty: 2, unit_price: 6500 }], issued_at: isoIn(-12), due_at: isoIn(18) }),
    inv({ id: "INV-26-4087", source: "metrology", ref: "CJ-26-0231", title: "Calibration — 3 thermometers", customer: "Swazi Fresh Produce Ltd", customer_email: DEMO_EMAIL, lines: [{ label: "Thermometer calibration (3 points)", qty: 3, unit_price: 650 }], issued_at: isoIn(-40), due_at: isoIn(-10), payments: [{ id: "PAY-1", at: isoIn(-20), amount: 2242.5, method: "momo", reference: "MOMO-88213" }] }),
    inv({ id: "INV-26-4095", source: "certification", ref: "CERT-APP-26-0053", title: "ISO 9001 certification — Ubombo Honey Co. (Pty) Ltd", customer: "Ubombo Honey Co. (Pty) Ltd", customer_email: DEMO_EMAIL, lines: [{ label: "Application fee", qty: 1, unit_price: 2500 }, { label: "Stage 1 + Stage 2 audit (auditor-days)", qty: 4, unit_price: 6500 }, { label: "Certificate fee", qty: 1, unit_price: 4000 }], issued_at: isoIn(-20), due_at: isoIn(10), deposit: 18687.5, payments: [{ id: "PAY-2", at: isoIn(-20), amount: 18687.5, method: "card", reference: "CARD-55120" }] }),
    inv({ id: "INV-26-4050", source: "standards", ref: "EST-26-0880", title: "SZNS 044:2026 Bottled water (PDF)", customer: "Swazi Fresh Produce Ltd", customer_email: DEMO_EMAIL, lines: [{ label: "Standard — PDF licence", qty: 1, unit_price: 480 }], issued_at: isoIn(-60), due_at: isoIn(-30) }),
  ];
  return { v: 1, seq: 4120, invoices: Object.fromEntries(rows.map((r) => [r.id, r])) };
}

export const billingStore = createLocalStore<BillingState>({
  key: "eswasaone.billing.v1",
  v: 1,
  seed,
  onRead: (s) => {
    for (const i of Object.values(s.invoices)) i.status = statusOf(i);
  },
});

export function invoiceTotals(i: Pick<Invoice, "lines" | "vat_rate" | "payments">) {
  const net = i.lines.reduce((n, l) => n + l.qty * l.unit_price, 0);
  const vat = Math.round(net * i.vat_rate * 100) / 100;
  const total = net + vat;
  const paid = i.payments.reduce((n, p) => n + p.amount, 0);
  return { net, vat, total, paid, balance: Math.max(0, Math.round((total - paid) * 100) / 100) };
}

function statusOf(i: Invoice): InvoiceStatus {
  if (i.status === "cancelled") return "cancelled";
  const t = invoiceTotals(i);
  if (t.balance <= 0.009) return "paid";
  if (new Date(i.due_at).getTime() < Date.now()) return "overdue";
  return t.paid > 0 ? "part_paid" : "unpaid";
}

export function depositPaid(i: Invoice | null | undefined): boolean {
  if (!i) return false;
  const t = invoiceTotals(i);
  return t.paid >= (i.deposit ?? t.total) - 0.009;
}

export function createInvoice(input: Omit<Invoice, "id" | "status" | "payments" | "issued_at" | "vat_rate"> & { vat_rate?: number }): Invoice {
  billingStore.guard("Invoices");
  return billingStore.mutate((s) => {
    s.seq += 1;
    const i = inv({ ...input, id: `INV-26-${s.seq}`, issued_at: nowIso() });
    s.invoices[i.id] = i;
    return i;
  });
}

export function listInvoices(f: { email?: string; ref?: string; source?: InvoiceSource } = {}): Invoice[] {
  billingStore.guard("Invoices");
  const email = f.email?.toLowerCase();
  return billingStore.view((s) =>
    Object.values(s.invoices)
      .filter((i) => !f.ref || i.ref === f.ref)
      .filter((i) => !f.source || i.source === f.source)
      .filter((i) => !email || i.customer_email === DEMO_EMAIL || i.customer_email.toLowerCase() === email)
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at)),
  );
}

export function getInvoice(id: string): Invoice | null {
  return billingStore.view((s) => s.invoices[id] ?? null);
}

export function invoiceFor(ref: string): Invoice | null {
  return billingStore.view((s) => Object.values(s.invoices).filter((i) => i.ref === ref && i.status !== "cancelled").sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0] ?? null);
}

/**
 * Demo checkout. "invoice" records the choice without money moving (status stays unpaid).
 * TODO: wire real — POST /estore/checkout {invoice_id, amount, method} → gateway redirect / MoMo push.
 */
export async function payInvoice(id: string, amount: number, method: PayMethod): Promise<Invoice> {
  billingStore.guard("Payments");
  await new Promise((r) => setTimeout(r, 400));
  return billingStore.mutate((s) => {
    const i = s.invoices[id];
    if (!i) throw new Error("Invoice not found.");
    if (method === "invoice") return i;
    const bal = invoiceTotals(i).balance;
    if (amount <= 0 || amount > bal + 0.009) throw new Error(`Enter an amount up to E ${bal.toFixed(2)}.`);
    i.payments.push({ id: `PAY-${Date.now().toString(36)}`, at: nowIso(), amount, method, reference: `${method.toUpperCase()}-${Math.floor(Math.random() * 90000 + 10000)}` });
    i.status = statusOf(i);
    return i;
  });
}

export function cancelInvoice(id: string): void {
  billingStore.mutate((s) => {
    if (s.invoices[id]) s.invoices[id].status = "cancelled";
  });
}

export const fmtMoney = (n: number) => `E ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
