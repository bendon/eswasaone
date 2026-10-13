import { useEffect, useState } from "react";
import { AuthError, DateField, Icon, Select, uploadMedia, useDialogs, validateUpload } from "@eswasaone/shared-ui";
import { errorText, submitClaim } from "./api";
import { fmtDate, fmtMoney, statusKind, statusLabel } from "./helpers";
import { useHrSettings } from "./useHrSettings";
import type { HrExpenseClaims, HrExpenseOptions } from "./types";
import { useMeResource } from "./useMeResource";

type Props = {
  enabled?: boolean;
  refreshKey?: string;
  onAuthRequired: (reason?: string) => void;
};

type Line = { expense_type: string; expense_date: string; amount: string; description: string; receipt: File | null };

const RECEIPT_ACCEPT = "application/pdf,image/jpeg,image/png";

function blankLine(type = ""): Line {
  return { expense_type: type, expense_date: "", amount: "", description: "", receipt: null };
}

/**
 * Expense claims (reimbursement, not payroll). Live GET /hr/me/expense-claims and /options; POST sends the claim to
 * your named expense approver, who decides it in Approvals. Receipts upload to the media store first.
 */
export function ClaimsPane({ enabled = true, refreshKey = "", onAuthRequired }: Props) {
  const dialogs = useDialogs();
  const claimsRes = useMeResource<HrExpenseClaims>("/hr/me/expense-claims", { enabled, refreshKey });
  const optsRes = useMeResource<HrExpenseOptions>("/hr/me/expense-claims/options", { enabled, refreshKey });
  const currency = useHrSettings(enabled, refreshKey)?.currency ?? null;
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (claimsRes.authRequired || optsRes.authRequired) onAuthRequired(claimsRes.error || optsRes.error || undefined);
  }, [claimsRes.authRequired, optsRes.authRequired, claimsRes.error, optsRes.error, onAuthRequired]);

  const types = optsRes.data?.types ?? [];
  const above = optsRes.data?.receipt_required_above ?? null;
  const items = claimsRes.data?.items ?? [];

  function needsReceipt(amount: number): boolean {
    return above == null || amount > above;
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function problems(): string | null {
    const today = new Date().toISOString().slice(0, 10);
    for (const [i, l] of lines.entries()) {
      const n = Number(l.amount);
      const which = lines.length > 1 ? `Line ${i + 1}: ` : "";
      if (!l.expense_type) return `${which}choose the expense type.`;
      if (!l.expense_date) return `${which}give the date of the expense.`;
      if (l.expense_date > today) return `${which}the date can't be in the future.`;
      if (!Number.isFinite(n) || n <= 0) return `${which}the amount must be more than 0.`;
      if (needsReceipt(n) && !l.receipt) return `${which}attach the receipt${above != null ? ` (needed above ${fmtMoney(above, currency)})` : ""}.`;
      if (l.receipt) {
        const bad = validateUpload(l.receipt, { accept: RECEIPT_ACCEPT });
        if (bad) return `${which}${bad}`;
      }
    }
    return null;
  }

  async function submit() {
    setErr(null);
    const bad = problems();
    if (bad) return setErr(bad);
    const total = lines.reduce((s, l) => s + Number(l.amount), 0);
    const ok = await dialogs.confirm({ title: "Send expense claim", message: `Send a claim for ${fmtMoney(total, currency)} to your expense approver?`, confirmLabel: "Send" });
    if (!ok) return;
    setBusy(true);
    try {
      // Receipts first; a failed upload stops the claim (nothing is kept locally).
      const attachments: Array<{ file_name: string; url: string }> = [];
      for (const l of lines) {
        if (!l.receipt) continue;
        const up = await uploadMedia(l.receipt, "hr/expenses", { allowMock: false });
        attachments.push({ file_name: l.receipt.name, url: up.url });
      }
      const r = await submitClaim({
        lines: lines.map((l) => ({
          expense_type: l.expense_type,
          expense_date: l.expense_date,
          amount: Number(l.amount),
          description: l.description.trim() || null,
          receipt: l.receipt?.name ?? null,
        })),
        description: description.trim() || null,
        attachments,
        confirm: true,
      });
      setSent(r.approver ? `Sent to ${r.approver}. They decide it in Approvals; Finance pays it.` : "Sent. Your expense approver decides it in Approvals.");
      setShowForm(false);
      setLines([blankLine(types[0])]);
      setDescription("");
      claimsRes.reload();
    } catch (e) {
      if (e instanceof AuthError && e.authRequired) onAuthRequired(e.reason);
      setErr(errorText(e, "Claim not sent."));
    } finally {
      setBusy(false);
    }
  }

  const awaiting = optsRes.data && !types.length;

  return (
    <div className="me-pane">
      {dialogs.host}
      {sent ? (
        <p className="field-muted" role="status">
          {sent}
        </p>
      ) : null}
      {awaiting ? (
        <div className="field-card">
          <p className="field-muted">Expense claims open once Finance adds the expense types you can claim.</p>
        </div>
      ) : !showForm ? (
        <button
          type="button"
          className="me-btn me-btn--pri"
          disabled={!types.length}
          onClick={() => {
            setSent(null);
            setErr(null);
            setLines([blankLine(types[0])]);
            setShowForm(true);
          }}
        >
          <Icon name="i-plus" />
          New claim
        </button>
      ) : (
        <form
          className="me-form field-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {lines.map((l, i) => (
            <fieldset key={i} className="me-form" style={{ border: 0, padding: 0, margin: 0 }}>
              {lines.length > 1 ? <div className="me-sec-h">Line {i + 1}</div> : null}
              <label className="me-field">
                <span>Type</span>
                <Select value={l.expense_type} onChange={(v) => setLine(i, { expense_type: v })} disabled={busy}>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="me-field">
                <span>Date</span>
                <DateField value={l.expense_date} onChange={(v) => setLine(i, { expense_date: v })} ariaLabel={`Date of expense ${i + 1}`} required disabled={busy} />
              </label>
              <label className="me-field">
                <span>Amount{currency ? ` (${currency})` : ""}</span>
                <input type="number" min="0.01" step="0.01" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} required disabled={busy} />
              </label>
              <label className="me-field">
                <span>What it was for</span>
                <input type="text" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} disabled={busy} />
              </label>
              <label className="me-field">
                <span>Receipt (PDF, JPEG or PNG){above != null ? `, needed above ${fmtMoney(above, currency)}` : ", needed"}</span>
                <input type="file" accept={RECEIPT_ACCEPT} onChange={(e) => setLine(i, { receipt: e.target.files?.[0] ?? null })} disabled={busy} />
              </label>
              {lines.length > 1 ? (
                <button type="button" className="me-link" disabled={busy} onClick={() => setLines((p) => p.filter((_, j) => j !== i))}>
                  Remove line {i + 1}
                </button>
              ) : null}
            </fieldset>
          ))}
          <button type="button" className="me-link" disabled={busy} onClick={() => setLines((p) => [...p, blankLine(types[0])])}>
            Add another expense
          </button>
          <label className="me-field">
            <span>Note for your approver (optional)</span>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
          </label>
          {err ? (
            <p className="me-error" role="alert">
              {err}
            </p>
          ) : null}
          <div className="me-form__actions">
            <button type="button" className="me-btn me-btn--ghost" onClick={() => setShowForm(false)} disabled={busy}>
              Back
            </button>
            <button type="submit" className="me-btn me-btn--pri" disabled={busy}>
              {busy ? "Sending…" : "Confirm & send"}
            </button>
          </div>
        </form>
      )}
      {!showForm && err ? (
        <p className="me-error" role="alert">
          {err}
        </p>
      ) : null}

      <div className="me-sec-h">
        My claims
        {claimsRes.refreshing ? <span className="me-sec-h__hint"> · updating</span> : null}
      </div>
      {claimsRes.loading && !claimsRes.data ? (
        <p className="field-muted">Loading claims…</p>
      ) : claimsRes.error && !claimsRes.data ? (
        <p className="me-error" role="alert">
          {claimsRes.error}
        </p>
      ) : items.length === 0 ? (
        <div className="field-card">
          <p className="field-muted">No claims yet.</p>
        </div>
      ) : (
        <div className="me-card">
          {items.map((item) => (
            <div className="me-row" key={item.id}>
              <span className="me-row__ic me-row__ic--purple" aria-hidden>
                <Icon name="i-file" />
              </span>
              <div className="me-row__b">
                <b>{item.description || item.id}</b>
                <span className="mono">
                  {fmtMoney(item.total, item.currency ?? currency)}
                  {item.posting_date ? ` · ${fmtDate(item.posting_date)}` : ""}
                  {item.approver && item.approval_status === "Draft" ? ` · ${item.approver} decides` : ""}
                </span>
              </div>
              <span className={`me-stt me-stt--${statusKind(item.approval_status === "Rejected" ? "rejected" : item.status)}`}>
                <span className="me-stt__d" />
                {statusLabel(item.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
