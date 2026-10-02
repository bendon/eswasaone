import { useState } from "react";
import { AuthError, Icon, useDialogs } from "@eswasaone/shared-ui";
import { createExpense } from "./api";
import { fmtSzl, MOCK_CLAIMS_SEED, statusKind, statusLabel } from "./helpers";
import type { HrExpense } from "./types";

type Props = {
  onAuthRequired: (reason?: string) => void;
};

type ClaimRow = HrExpense & { date_label?: string };

const EXPENSE_TYPES = ["Fuel", "Accommodation", "Travel", "Meals", "Other"];

export function ClaimsPane({ onAuthRequired }: Props) {
  const dialogs = useDialogs();
  // TODO: wire real — GET /hr/expenses list when Core adds it (POST-only in openapi today)
  const [items, setItems] = useState<ClaimRow[]>(() =>
    MOCK_CLAIMS_SEED.map((c) => ({
      id: c.id,
      amount: c.amount,
      expense_type: c.expense_type,
      description: c.description ?? null,
      status: c.status,
      date_label: c.date_label,
    })),
  );
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expenseType, setExpenseType] = useState("Fuel");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  async function submitClaim() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      await dialogs.alert({ message: "Enter a valid amount.", kind: "error" });
      return;
    }
    const ok = await dialogs.confirm({
      title: "Submit expense claim",
      message: `Submit ${expenseType} claim for ${fmtSzl(n)}?`,
      confirmLabel: "Submit",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const created = await createExpense({
        amount: n,
        expense_type: expenseType,
        description: description.trim() || undefined,
        confirm: true,
      });
      setItems((prev) => [
        {
          ...created,
          date_label: new Date().toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          }),
        },
        ...prev,
      ]);
      await dialogs.alert({ message: "Claim submitted.", kind: "success" });
      setShowForm(false);
      setAmount("");
      setDescription("");
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) {
        onAuthRequired(err.reason);
        return;
      }
      // Scaffold endpoint may 404 — keep local typed mock so UI still works.
      // TODO: wire real — POST /hr/expenses when Core expense scaffold is live
      const stub: ClaimRow = {
        id: `EXP-LOCAL-${Date.now().toString(36)}`,
        amount: n,
        expense_type: expenseType,
        description: description.trim() || null,
        status: "Pending",
        date_label: new Date().toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
      };
      setItems((prev) => [stub, ...prev]);
      await dialogs.alert({
        message:
          err instanceof Error
            ? `Saved locally (API: ${err.message}). Will sync when expenses are live.`
            : "Saved locally — expenses API not ready.",
        kind: "info",
      });
      setShowForm(false);
      setAmount("");
      setDescription("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="me-pane">
      {dialogs.host}
      {!showForm ? (
        <button type="button" className="me-btn me-btn--pri" onClick={() => setShowForm(true)}>
          <Icon name="i-plus" />
          New claim
        </button>
      ) : (
        <form
          className="me-form field-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submitClaim();
          }}
        >
          <label className="me-field">
            <span>Type</span>
            <select
              value={expenseType}
              onChange={(e) => setExpenseType(e.target.value)}
              disabled={busy}
            >
              {EXPENSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="me-field">
            <span>Amount (SZL)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="me-field">
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fuel — site visit"
              disabled={busy}
            />
          </label>
          <div className="me-form__actions">
            <button
              type="button"
              className="me-btn me-btn--ghost"
              onClick={() => setShowForm(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="me-btn me-btn--pri" disabled={busy}>
              {busy ? "Submitting…" : "Confirm & submit"}
            </button>
          </div>
        </form>
      )}

      <div className="me-sec-h">My claims</div>
      <div className="me-card">
        {items.map((item) => {
          const kind = statusKind(item.status);
          const title = item.description || item.expense_type;
          const meta = `${fmtSzl(item.amount)}${item.date_label ? ` · ${item.date_label}` : ""}`;
          return (
            <div className="me-row" key={item.id}>
              <span className="me-row__ic me-row__ic--purple" aria-hidden>
                <Icon name="i-file" />
              </span>
              <div className="me-row__b">
                <b>{title}</b>
                <span className="mono">{meta}</span>
              </div>
              <span className={`me-stt me-stt--${kind}`}>
                <span className="me-stt__d" />
                {statusLabel(item.status)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
