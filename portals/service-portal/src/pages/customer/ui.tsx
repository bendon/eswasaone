/**
 * Shared bits for the customer pages added for gaps 04–08: who the customer is, a store-backed resource
 * hook, the demo checkout (MoMo / card / EFT / invoice me) and small layout helpers.
 */
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { billingStore, fmtMoney, invoiceTotals, payInvoice, type Invoice, type PayMethod } from "@eswasaone/shared-ui/billing";
import { certStore } from "@eswasaone/shared-ui/certification";
import { fieldStore } from "@eswasaone/shared-ui/field";
import { metStore } from "@eswasaone/shared-ui/metrology";
import { notifyStore } from "@eswasaone/shared-ui/notify";
import { stdStore } from "@eswasaone/shared-ui/standards";
import { useStoreResource, type StoreResource } from "@eswasaone/shared-ui/store";
import { BANKING } from "@eswasaone/shared-ui/print";
import { useAuth } from "../../auth/AuthProvider";

export function useCustomer(): { email?: string; name: string } {
  const { user } = useAuth();
  return { email: user?.email ?? undefined, name: user?.full_name || user?.username || "Customer" };
}

export function useCustomerData<T>(load: () => T | Promise<T>, deps: unknown[] = []): StoreResource<T> {
  return useStoreResource([certStore, fieldStore, metStore, stdStore, billingStore, notifyStore], load, deps);
}

export function Loadable<T>({ res, children, what = "This" }: { res: StoreResource<T>; children: (d: NonNullable<T>) => ReactNode; what?: string }) {
  if (res.loading && res.data === undefined) return <p className="page-note">Loading…</p>;
  if (res.error) return <div className="crm-banner crm-banner--err">{res.error}</div>;
  if (res.data === undefined || res.data === null) return <div className="crm-empty"><Icon name="i-search" /><b>{what} not found</b></div>;
  return <>{children(res.data as NonNullable<T>)}</>;
}

export function Panel({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel is-on" role="tabpanel">
      <div className="panel__head">
        <div>
          <h2>{title}</h2>
          {sub ? <p>{sub}</p> : null}
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PublicPage({ crumbs, title, lead, children }: { crumbs: { label: string; to?: string }[]; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb" style={{ marginBottom: 12, fontSize: 13 }}>
        {crumbs.map((c, i) => (
          <span key={c.label}>
            {i ? " / " : ""}
            {c.to ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
          </span>
        ))}
      </nav>
      <h1 className="page-h">{title}</h1>
      {lead ? <p className="page-lead">{lead}</p> : null}
      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  );
}

export const fmtD = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="crm-toast" role="status">{msg}</div> : null;
}

export function useMsg(): [string | null, (m: string) => void] {
  const [m, setM] = useState<string | null>(null);
  return [m, (x: string) => (setM(x), window.setTimeout(() => setM(null), 3500))];
}

/**
 * Demo checkout. MoMo/card settle at once; EFT shows the banking reference (staff confirm on receipt);
 * "Invoice me" records the choice. TODO: wire real — e-store checkout / MoMo push / card gateway.
 */
export function PayDialog({ inv, amount, title = "Pay", onClose, onPaid }: { inv: Invoice; amount?: number; title?: string; onClose: () => void; onPaid: (inv: Invoice, method: PayMethod) => void }) {
  const t = invoiceTotals(inv);
  const [method, setMethod] = useState<PayMethod>("momo");
  const [phone, setPhone] = useState("");
  const [amt, setAmt] = useState(String(Math.min(t.balance, amount ?? t.balance).toFixed(2)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pay = async () => {
    setErr(null);
    if (method === "momo" && phone.replace(/\D/g, "").length < 8) return setErr("Enter the MoMo number to send the payment request to.");
    setBusy(true);
    try {
      const out = await payInvoice(inv.id, Number(amt), method);
      onPaid(out, method);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="crm-scrim eo-scrim" onClick={onClose} />
      <div className="eo-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="eo-modal__h">
          <h3>{title}</h3>
          <button type="button" className="crm-drawer__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="eo-modal__b">
          <p style={{ margin: 0 }}>
            {inv.title} · invoice <b>{inv.id}</b> · balance {fmtMoney(t.balance)}
          </p>
          <div className="crm-choices" role="radiogroup" aria-label="Payment method">
            {(
              [
                ["momo", "MTN MoMo", "Approve the request on your phone"],
                ["card", "Card", "Visa / Mastercard"],
                ["eft", "Bank transfer (EFT)", "We confirm when it arrives"],
                ["invoice", "Invoice me", "Pay later on the invoice terms"],
              ] as [PayMethod, string, string][]
            ).map(([k, l, d]) => (
              <button key={k} type="button" className={`crm-choice${method === k ? " on" : ""}`} aria-pressed={method === k} onClick={() => setMethod(k)}>
                <b>{l}</b>
                <span className="crm-small">{d}</span>
              </button>
            ))}
          </div>
          {method === "momo" ? (
            <label className="crm-field">
              MoMo number
              <input className="crm-input" inputMode="tel" placeholder="+268 76…" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          ) : null}
          {method === "card" ? <p className="crm-small">Demo: no card details are taken. In production you're sent to the bank's secure page.</p> : null}
          {method === "eft" ? <p className="crm-small">{BANKING.replace("your document number", inv.id)}</p> : null}
          {method === "momo" || method === "card" ? (
            <label className="crm-field">
              Amount (E)
              <input className="crm-input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </label>
          ) : null}
          {err ? <p className="eo-error" role="alert">{err}</p> : null}
        </div>
        <div className="eo-modal__f">
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="crm-btn crm-btn--pri" disabled={busy} onClick={() => (method === "eft" || method === "invoice" ? onPaid(inv, method) : void pay())}>
            {busy ? "Processing…" : method === "momo" ? `Send MoMo request for E ${Number(amt).toFixed(2)}` : method === "card" ? `Pay E ${Number(amt).toFixed(2)}` : method === "eft" ? "I'll pay by EFT" : "Invoice me"}
          </button>
        </div>
      </div>
    </>
  );
}
