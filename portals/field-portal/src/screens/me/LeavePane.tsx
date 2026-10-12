import { useEffect, useMemo, useState } from "react";
import { AuthError, DateField, Icon, Select, useDialogs } from "@eswasaone/shared-ui";
import { cancelLeave, createLeave, errorText } from "./api";
import { fmtDateRange, leaveRowTitle, statusKind, statusLabel } from "./helpers";
import type { HrLeaveSummary, HrMe } from "./types";
import { useMeResource } from "./useMeResource";

type Props = {
  enabled: boolean;
  refreshKey: string;
  onAuthRequired: (reason?: string) => void;
};

const TONES = ["c1", "c2", "c3"] as const;

/** E2/E3 on mobile: your balances, your requests, apply and cancel. Live GET /hr/me; POST /hr/leave, /cancel. */
export function LeavePane({ enabled, refreshKey, onAuthRequired }: Props) {
  const dialogs = useDialogs();
  const meRes = useMeResource<HrMe>("/hr/me", { enabled, refreshKey });

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveType, setLeaveType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (meRes.authRequired) onAuthRequired(meRes.error || undefined);
  }, [meRes.authRequired, meRes.error, onAuthRequired]);

  const me = meRes.data;
  const balances = useMemo(() => me?.balances ?? [], [me]);
  const items: HrLeaveSummary[] = me?.leave ?? [];

  useEffect(() => {
    if (!leaveType && balances.length) setLeaveType(balances[0].leave_type);
  }, [balances, leaveType]);

  async function submitLeave() {
    setErr(null);
    if (!leaveType) return setErr("Choose a leave type.");
    if (!fromDate || !toDate) return setErr("Choose from and to dates.");
    if (toDate < fromDate) return setErr("The last day is before the first day.");
    const ok = await dialogs.confirm({
      title: "Send leave request",
      message: `Ask for ${leaveType} from ${fromDate} to ${toDate}? ${me?.leave_approver?.name ? `${me.leave_approver.name} decides it.` : ""}`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await createLeave({ leave_type: leaveType, from_date: fromDate, to_date: toDate, reason: reason.trim() || undefined, confirm: true });
      setShowForm(false);
      setReason("");
      setFromDate("");
      setToDate("");
      meRes.reload();
    } catch (e) {
      if (e instanceof AuthError && e.authRequired) onAuthRequired(e.reason);
      setErr(errorText(e, "Leave request not sent."));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(item: HrLeaveSummary) {
    const why = await dialogs.prompt({
      title: "Cancel this leave",
      message: `${leaveRowTitle(item)}, ${fmtDateRange(item.from_date, item.to_date)}. Your approver is told.`,
      label: "Why are you cancelling?",
      confirmLabel: "Cancel leave",
    });
    if (why == null) return;
    if (!why.trim()) {
      setErr("Say why you're cancelling.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await cancelLeave(item.id, why.trim());
      meRes.reload();
    } catch (e) {
      if (e instanceof AuthError && e.authRequired) onAuthRequired(e.reason);
      setErr(errorText(e, "Not cancelled."));
    } finally {
      setBusy(false);
    }
  }

  if (meRes.loading && !me) {
    return (
      <div className="me-pane">
        <p className="field-muted">Loading your leave…</p>
      </div>
    );
  }

  if (meRes.error && !me) {
    return (
      <div className="me-pane">
        <p className="me-error" role="alert">
          {meRes.error}
        </p>
        <button type="button" className="me-btn me-btn--ghost" onClick={meRes.reload}>
          Try again
        </button>
      </div>
    );
  }

  if (me && !me.linked) {
    return (
      <div className="me-pane">
        <div className="field-card">
          <p className="field-muted">Your login isn't linked to an employee record yet. Ask HR to link it, then your leave shows here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="me-pane">
      {dialogs.host}
      {meRes.fromCache ? <p className="field-muted">Offline: showing what was last loaded.</p> : null}
      {balances.length ? (
        <div className="me-bals" aria-label="Leave balances">
          {balances.slice(0, 3).map((b, i) => (
            <div key={b.leave_type} className={`me-bal me-bal--${TONES[i]}`}>
              <div className="me-bal__n">{b.balance}</div>
              <div className="me-bal__l">{b.leave_type}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="field-card">
          <p className="field-muted">No leave allocated to you yet. ESWASA HR sets leave types and entitlements first.</p>
        </div>
      )}

      {err ? (
        <p className="me-error" role="alert">
          {err}
        </p>
      ) : null}

      {!showForm ? (
        <button type="button" className="me-btn me-btn--pri" disabled={!balances.length} onClick={() => setShowForm(true)}>
          <Icon name="i-plus" />
          Request leave
        </button>
      ) : (
        <form
          className="me-form field-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submitLeave();
          }}
        >
          <label className="me-field">
            <span>Leave type</span>
            <Select value={leaveType} onChange={(val) => setLeaveType(val)} disabled={busy}>
              {balances.map((b) => (
                <option key={b.leave_type} value={b.leave_type}>
                  {b.leave_type} ({b.balance} left)
                </option>
              ))}
            </Select>
          </label>
          <label className="me-field">
            <span>From</span>
            <DateField value={fromDate} onChange={setFromDate} ariaLabel="From" required disabled={busy} />
          </label>
          <label className="me-field">
            <span>To</span>
            <DateField value={toDate} onChange={setToDate} min={fromDate || undefined} ariaLabel="To" required disabled={busy} />
          </label>
          <label className="me-field">
            <span>Reason (optional)</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
          </label>
          {me?.leave_approver?.name ? <p className="field-muted">{me.leave_approver.name} decides this in Approvals.</p> : null}
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

      <div className="me-sec-h">
        My requests
        {meRes.refreshing ? <span className="me-sec-h__hint"> · updating</span> : null}
      </div>
      {items.length === 0 ? (
        <div className="field-card">
          <p className="field-muted">No leave requests yet.</p>
        </div>
      ) : (
        <div className="me-card">
          {items.map((item) => (
            <LeaveRow key={item.id} item={item} busy={busy} onCancel={() => void cancel(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Open requests, or approved leave that hasn't started, can be cancelled (the server has the last word). */
function cancellable(item: HrLeaveSummary): boolean {
  const s = (item.status ?? "").toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  return s === "open" || (s === "approved" && Boolean(item.from_date) && (item.from_date as string) > today);
}

function LeaveRow({ item, busy, onCancel }: { item: HrLeaveSummary; busy: boolean; onCancel: () => void }) {
  const kind = statusKind(item.status);
  return (
    <div className="me-row">
      <span className="me-row__ic me-row__ic--amber" aria-hidden>
        <Icon name="i-cal" />
      </span>
      <div className="me-row__b">
        <b>{leaveRowTitle(item)}</b>
        <span>{fmtDateRange(item.from_date, item.to_date)}</span>
        {cancellable(item) ? (
          <button type="button" className="me-link" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <span className={`me-stt me-stt--${kind}`}>
        <span className="me-stt__d" />
        {statusLabel(item.status)}
      </span>
    </div>
  );
}
