import { useState } from "react";
import { Icon, uploadMedia } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrExpenseClaim, HrExpenseClaims, HrExpenseOptions } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill } from "./parts";

/**
 * Expense claims (reimbursement, not payroll). Live GET /hr/me/expense-claims and /options;
 * POST /hr/me/expense-claims sends the claim to your named expense approver, who decides it in Approvals.
 * Receipts upload to the media store first; above the receipt threshold (or always, if none is set) every line needs one.
 */

type Line = { expense_type: string; expense_date: string; amount: string; description: string; receipt: File | null };

const ACCEPT = "application/pdf,image/jpeg,image/png";
const money = (n: number | null | undefined, currency?: string | null) =>
  n == null ? "—" : `${currency || "SZL"} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function blank(type = ""): Line {
  return { expense_type: type, expense_date: "", amount: "", description: "", receipt: null };
}

export function claimPill(c: Pick<HrExpenseClaim, "status" | "approval_status" | "overdue">) {
  const cls = c.approval_status === "Rejected" ? "bad" : c.approval_status === "Approved" ? "ok" : "leave";
  return <StatusPill cls={cls} label={`${c.status}${c.overdue ? " (overdue)" : ""}`} />;
}

export function MyExpenses() {
  const { user, sessionKey } = useInstitution();
  const claims = useApiResource<HrExpenseClaims>("/hr/me/expense-claims", { enabled: Boolean(user), refreshKey: sessionKey });
  const opts = useApiResource<HrExpenseOptions>("/hr/me/expense-claims/options", { enabled: Boolean(user), refreshKey: sessionKey });
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const types = opts.data?.types ?? [];
  const above = opts.data?.receipt_required_above ?? null;
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  function set(i: number, patch: Partial<Line>) {
    setLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function problem(): string | null {
    const today = new Date().toISOString().slice(0, 10);
    for (const [i, l] of lines.entries()) {
      const n = Number(l.amount);
      const at = lines.length > 1 ? `Line ${i + 1}: ` : "";
      if (!l.expense_type) return `${at}choose the expense type.`;
      if (!l.expense_date) return `${at}give the date of the expense.`;
      if (l.expense_date > today) return `${at}the date can't be in the future.`;
      if (!(n > 0)) return `${at}the amount must be more than 0.`;
      if ((above == null || n > above) && !l.receipt) return `${at}attach the receipt${above != null ? ` (needed above ${money(above)})` : ""}.`;
      if (l.receipt && l.receipt.size > 5 * 1024 * 1024) return `${at}${l.receipt.name} is larger than 5 MB.`;
    }
    return null;
  }

  async function submit() {
    setErr(null);
    const bad = problem();
    if (bad) return setErr(bad);
    setBusy(true);
    try {
      const attachments: Array<{ file_name: string; url: string }> = [];
      for (const l of lines) {
        if (l.receipt) attachments.push({ file_name: l.receipt.name, url: (await uploadMedia(l.receipt, "hr/expenses", { allowMock: false })).url });
      }
      const r = await hrSend<{ approver?: string }>("/hr/me/expense-claims", {
        lines: lines.map((l) => ({
          expense_type: l.expense_type,
          expense_date: l.expense_date,
          amount: Number(l.amount),
          description: l.description.trim() || undefined,
          receipt: l.receipt?.name,
        })),
        description: note.trim() || undefined,
        attachments,
      });
      setSent(r?.approver ? `Sent to ${r.approver}.` : "Sent to your expense approver.");
      setOpen(false);
      setLines([blank(types[0])]);
      setNote("");
      claims.reload();
    } catch (e) {
      setErr(errorText(e, "Claim not sent."));
    } finally {
      setBusy(false);
    }
  }

  const items = claims.data?.items ?? [];

  return (
    <ResourceGate loading={opts.loading} error={opts.error} onRetry={opts.reload} refreshing={opts.refreshing} hasData={Boolean(opts.data)}>
      <div className="hr-view">
        <Crumbs items={[["My HR", "/me"], ["Expense claims"]]} />
        <div className="hr-head">
          <div>
            <h2>Expense claims</h2>
            <p>Money you spent for work and want back. Your expense approver decides in Approvals; Finance pays.</p>
          </div>
          {types.length && !open ? (
            <div className="hr-head__r">
              <button type="button" className="btn pri" onClick={() => (setOpen(true), setSent(null), setErr(null), setLines([blank(types[0])]))}>
                <Icon name="i-plus" />
                New claim
              </button>
            </div>
          ) : null}
        </div>

        {!types.length ? (
          <Banner kind="info" title={`Awaiting ${opts.data?.awaiting ?? "ESWASA Finance"}`}>
            Claims open once Finance sets up the expense types.
          </Banner>
        ) : null}

        {sent ? <NextStep title={sent} body="It shows below as waiting for approval. You'll see the decision here." /> : null}

        {open ? (
          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>New claim</h3>
                <p>{above == null ? "Every line needs a receipt." : `Lines above ${money(above)} need a receipt.`}</p>
              </div>
            </div>
            <div className="hr-box__b hr-view" style={{ gap: 12 }}>
              {lines.map((l, i) => (
                <fieldset key={i} className="hr-grid c2" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, margin: 0 }}>
                  <legend style={{ fontSize: 12, fontWeight: 700 }}>Line {i + 1}</legend>
                  <label className="hr-f">
                    <span>Type</span>
                    <select className="hr-in" value={l.expense_type} onChange={(e) => set(i, { expense_type: e.target.value })} disabled={busy}>
                      {types.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hr-f">
                    <span>Date</span>
                    <input className="hr-in" type="date" value={l.expense_date} onChange={(e) => set(i, { expense_date: e.target.value })} disabled={busy} />
                  </label>
                  <label className="hr-f">
                    <span>Amount</span>
                    <input className="hr-in" type="number" min="0.01" step="0.01" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} disabled={busy} />
                  </label>
                  <label className="hr-f">
                    <span>What it was for</span>
                    <input className="hr-in" value={l.description} onChange={(e) => set(i, { description: e.target.value })} disabled={busy} />
                  </label>
                  <label className="hr-f">
                    <span>Receipt</span>
                    <input className="hr-in" type="file" accept={ACCEPT} onChange={(e) => set(i, { receipt: e.target.files?.[0] ?? null })} disabled={busy} />
                  </label>
                  {lines.length > 1 ? (
                    <div>
                      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setLines((p) => p.filter((_, j) => j !== i))}>
                        Remove line
                      </button>
                    </div>
                  ) : null}
                </fieldset>
              ))}
              <div>
                <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setLines((p) => [...p, blank(types[0])])}>
                  Add a line
                </button>
              </div>
              <label className="hr-f">
                <span>Note for your approver (optional)</span>
                <input className="hr-in" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
              </label>
              <p style={{ margin: 0 }}>
                Total <b className="mono">{money(total)}</b>
              </p>
              {err ? (
                <Banner kind="bad" title="Not sent">
                  {err}
                </Banner>
              ) : null}
              <div>
                <button type="button" className="btn pri" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Sending…" : "Send claim"}
                </button>{" "}
                <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>
                  Back
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <ResourceGate loading={claims.loading} error={claims.error} onRetry={claims.reload} refreshing={claims.refreshing} hasData={Boolean(claims.data)}>
          {items.length ? (
            <div className="hr-box hr-scroll">
              <table className="hr-table" aria-label="My claims">
                <thead>
                  <tr>
                    <th>Claim</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Decides</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <b>{c.description || c.id}</b>
                        <small style={{ display: "block", color: "var(--muted)" }}>{c.id}</small>
                      </td>
                      <td>{c.posting_date ? fmtDay(c.posting_date, true) : "—"}</td>
                      <td className="mono">{money(c.total, c.currency)}</td>
                      <td>{c.approver || "—"}</td>
                      <td>{claimPill(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No claims yet" detail="Claims you send appear here with who decides them and where they are." />
          )}
        </ResourceGate>
      </div>
    </ResourceGate>
  );
}
