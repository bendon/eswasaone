import { useEffect, useMemo, useState } from "react";
import { AuthError, Icon, useDialogs } from "@eswasaone/shared-ui";
import { createLeave } from "./api";
import {
  fmtDateRange,
  leaveRowTitle,
  pickBalanceCards,
  statusKind,
  statusLabel,
} from "./helpers";
import type { HrLeaveBalancesResponse, HrLeaveResponse, HrLeaveSummary } from "./types";
import { useMeResource } from "./useMeResource";

type Props = {
  enabled: boolean;
  refreshKey: string;
  onAuthRequired: (reason?: string) => void;
};

const LEAVE_TYPES = ["Annual", "Sick", "Study"];

export function LeavePane({ enabled, refreshKey, onAuthRequired }: Props) {
  const dialogs = useDialogs();
  const leaveRes = useMeResource<HrLeaveResponse>("/hr/leave?limit=20", {
    enabled,
    refreshKey,
  });
  const balRes = useMeResource<HrLeaveBalancesResponse>("/hr/leave/balances", {
    enabled,
    refreshKey,
  });

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveType, setLeaveType] = useState("Annual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (leaveRes.authRequired || balRes.authRequired) {
      onAuthRequired(leaveRes.error || balRes.error || undefined);
    }
  }, [leaveRes.authRequired, balRes.authRequired, leaveRes.error, balRes.error, onAuthRequired]);

  const cards = useMemo(
    () => pickBalanceCards(balRes.data?.items ?? []),
    [balRes.data],
  );

  const items: HrLeaveSummary[] = leaveRes.data?.items ?? [];

  async function submitLeave() {
    if (!fromDate || !toDate) {
      await dialogs.alert({ message: "Choose from and to dates.", kind: "error" });
      return;
    }
    const ok = await dialogs.confirm({
      title: "Submit leave request",
      message: `Request ${leaveType} leave from ${fromDate} to ${toDate}?`,
      confirmLabel: "Submit",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await createLeave({
        leave_type: leaveType,
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim() || undefined,
        confirm: true,
      });
      await dialogs.alert({ message: "Leave request submitted.", kind: "success" });
      setShowForm(false);
      setReason("");
      leaveRes.reload();
      balRes.reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) {
        onAuthRequired(err.reason);
      } else {
        await dialogs.alert({
          message: err instanceof Error ? err.message : "Leave request failed",
          kind: "error",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="me-pane">
      {dialogs.host}
      {balRes.loading && !balRes.data ? (
        <p className="field-muted">Loading balances…</p>
      ) : (
        <div className="me-bals" aria-label="Leave balances">
          {cards.map((c) => (
            <div key={c.label} className={`me-bal me-bal--${c.tone}`}>
              <div className="me-bal__n">{c.balance}</div>
              <div className="me-bal__l">{c.label}</div>
            </div>
          ))}
        </div>
      )}
      {balRes.error && !balRes.authRequired ? (
        <p className="me-error" role="alert">
          {balRes.error}
        </p>
      ) : null}

      {!showForm ? (
        <button
          type="button"
          className="me-btn me-btn--pri"
          onClick={() => setShowForm(true)}
        >
          <Icon name="i-plus" />
          Request leave
        </button>
      ) : (
        <LeaveRequestForm
          leaveType={leaveType}
          fromDate={fromDate}
          toDate={toDate}
          reason={reason}
          busy={busy}
          onLeaveType={setLeaveType}
          onFrom={setFromDate}
          onTo={setToDate}
          onReason={setReason}
          onCancel={() => setShowForm(false)}
          onSubmit={() => void submitLeave()}
        />
      )}

      <div className="me-sec-h">
        My requests
        {leaveRes.refreshing ? <span className="me-sec-h__hint"> · updating</span> : null}
      </div>
      {leaveRes.loading && !leaveRes.data ? (
        <p className="field-muted">Loading requests…</p>
      ) : items.length === 0 ? (
        <div className="field-card">
          <p className="field-muted">No leave requests yet.</p>
        </div>
      ) : (
        <div className="me-card">
          {items.map((item) => (
            <LeaveRow key={item.id} item={item} />
          ))}
        </div>
      )}
      {leaveRes.error && !leaveRes.authRequired ? (
        <p className="me-error" role="alert">
          {leaveRes.error}
        </p>
      ) : null}
    </div>
  );
}

function LeaveRow({ item }: { item: HrLeaveSummary }) {
  const kind = statusKind(item.status);
  return (
    <div className="me-row">
      <span className="me-row__ic me-row__ic--amber" aria-hidden>
        <Icon name="i-cal" />
      </span>
      <div className="me-row__b">
        <b>{leaveRowTitle(item)}</b>
        <span>{fmtDateRange(item.from_date, item.to_date)}</span>
      </div>
      <span className={`me-stt me-stt--${kind}`}>
        <span className="me-stt__d" />
        {statusLabel(item.status)}
      </span>
    </div>
  );
}

function LeaveRequestForm({
  leaveType,
  fromDate,
  toDate,
  reason,
  busy,
  onLeaveType,
  onFrom,
  onTo,
  onReason,
  onCancel,
  onSubmit,
}: {
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  busy: boolean;
  onLeaveType: (v: string) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onReason: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="me-form field-card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="me-field">
        <span>Leave type</span>
        <select value={leaveType} onChange={(e) => onLeaveType(e.target.value)} disabled={busy}>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="me-field">
        <span>From</span>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => onFrom(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className="me-field">
        <span>To</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => onTo(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className="me-field">
        <span>Reason (optional)</span>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          disabled={busy}
          placeholder="Brief reason"
        />
      </label>
      <div className="me-form__actions">
        <button type="button" className="me-btn me-btn--ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="me-btn me-btn--pri" disabled={busy}>
          {busy ? "Submitting…" : "Confirm & submit"}
        </button>
      </div>
    </form>
  );
}
