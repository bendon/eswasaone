/**
 * ActionBar + ReasonDialog (gap 01 C3). Renders only legal next steps, explains blocked ones (SoD),
 * collects the reason / note / payload a transition needs, shows the consequence, rule id and the
 * exact outbound message before confirming. Writes are never disabled for demo mode.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Select } from "../components/Select";
import { MessagePreview, type PreviewMessage } from "../notify/MessagePreview";
import type { ActInput, ActionOption, FieldSpec } from "./types";

export type ActionBarProps = {
  actions: ActionOption[];
  /** The record's current state, sent as expected_state. */
  state: string;
  onAct: (action: ActionOption, input: ActInput) => Promise<void>;
  /** Outbound message for an action, given the reason typed so far. */
  preview?: (action: ActionOption, reason: string) => PreviewMessage | null;
  /** Assistant pre-fill for the reason (L8: proposes only). */
  suggest?: (action: ActionOption) => string | null;
  busy?: boolean;
  size?: "sm" | "md";
  empty?: ReactNode;
  className?: string;
};

export function ActionBar({ actions, state, onAct, preview, suggest, busy, size = "md", empty = null, className = "eo-actionbar" }: ActionBarProps) {
  const [open, setOpen] = useState<ActionOption | null>(null);
  if (!actions.length) return <>{empty}</>;
  const sm = size === "sm" ? " crm-btn--sm" : "";
  return (
    <div className={className} role="group" aria-label="Available actions">
      {actions.map((a) => (
        <button
          key={a.action}
          type="button"
          className={`crm-btn${sm}${a.danger ? " crm-btn--danger" : a.primary ? " crm-btn--pri" : ""}`}
          disabled={busy || Boolean(a.disabledReason)}
          title={a.disabledReason ?? (a.rule ? `${a.label} (${a.rule})` : a.consequence ?? a.label)}
          onClick={() => setOpen(a)}
        >
          {a.label}
          {a.disabledReason ? <span aria-hidden="true"> 🔒</span> : null}
        </button>
      ))}
      {actions.some((a) => a.disabledReason) ? (
        <p className="eo-actionbar__why">
          {actions.filter((a) => a.disabledReason).map((a) => (
            <span key={a.action}>
              <b>{a.label}:</b> {a.disabledReason}
            </span>
          ))}
        </p>
      ) : null}
      {open ? (
        <ReasonDialog
          title={open.label}
          consequence={open.consequence}
          rule={open.rule}
          requires={open.requires}
          fields={open.fields}
          danger={open.danger}
          confirmLabel={open.label}
          initialReason={suggest?.(open) ?? ""}
          preview={preview ? (r) => preview(open, r) : undefined}
          onClose={() => setOpen(null)}
          onSubmit={async (v) => {
            await onAct(open, { expected_state: state, reason: v.reason, note: v.note, payload: v.payload, idempotency_key: `${open.action}-${state}-${Date.now()}` });
            setOpen(null);
          }}
        />
      ) : null}
    </div>
  );
}

export type ReasonValues = { reason?: string; note?: string; payload?: Record<string, string> };

export function ReasonDialog({
  title,
  consequence,
  rule,
  requires,
  fields,
  danger,
  confirmLabel = "Confirm",
  initialReason = "",
  reasonLabel,
  preview,
  onSubmit,
  onClose,
  children,
  canSubmit = true,
}: {
  title: string;
  consequence?: string;
  rule?: string;
  requires?: "reason" | "note" | "payload";
  fields?: FieldSpec[];
  danger?: boolean;
  confirmLabel?: string;
  initialReason?: string;
  reasonLabel?: string;
  preview?: (reason: string) => PreviewMessage | null;
  onSubmit: (v: ReasonValues) => Promise<void>;
  onClose: () => void;
  /** Extra controls (staff picker, date…) rendered above the reason. */
  children?: ReactNode;
  canSubmit?: boolean;
}) {
  const [reason, setReason] = useState(initialReason);
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needsText = requires === "reason" || requires === "note";
  const missingField = (fields ?? []).find((f) => f.required && !payload[f.key]?.trim());
  const blocked = !canSubmit || (needsText && !reason.trim()) || Boolean(missingField);
  const msg = preview?.(reason) ?? null;

  const submit = async () => {
    if (blocked) {
      setErr(needsText && !reason.trim() ? `${requires === "note" ? "A note" : "A reason"} is required.` : missingField ? `${missingField.label} is required.` : "Complete the form first.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        reason: requires === "reason" ? reason.trim() : undefined,
        note: requires !== "reason" && reason.trim() ? reason.trim() : undefined,
        payload: Object.keys(payload).length ? payload : undefined,
      });
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
          {rule ? <span className="crm-pill crm-pill--outline crm-mono">{rule}</span> : null}
          <button type="button" className="crm-drawer__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="eo-modal__b">
          {consequence ? <p className="eo-consequence">{consequence}</p> : null}
          {children}
          {(fields ?? []).map((f) => (
            <label key={f.key} className="crm-field">
              {f.label}
              {f.required ? " *" : ""}
              {f.type === "select" ? (
                <Select value={payload[f.key] ?? ""} onChange={(val) => setPayload({ ...payload, [f.key]: val })} block>
                  <option value="">Choose…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === "textarea" ? (
                <textarea className="crm-textarea" value={payload[f.key] ?? ""} onChange={(e) => setPayload({ ...payload, [f.key]: e.target.value })} />
              ) : (
                <input className="crm-input" type={f.type ?? "text"} value={payload[f.key] ?? ""} onChange={(e) => setPayload({ ...payload, [f.key]: e.target.value })} />
              )}
              {f.hint ? <span className="hint">{f.hint}</span> : null}
            </label>
          ))}
          <label className="crm-field">
            {reasonLabel ?? (requires === "reason" ? "Reason (required — recorded on the history and shown to whoever is affected)" : requires === "note" ? "Note (required)" : "Note (optional)")}
            <textarea
              className="crm-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={requires === "reason" ? "Explain why…" : "Add context for the record…"}
              autoFocus
            />
          </label>
          {msg ? <MessagePreview message={msg} /> : null}
          {err ? (
            <p className="eo-error" role="alert">
              {err}
            </p>
          ) : null}
        </div>
        <div className="eo-modal__f">
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`crm-btn ${danger ? "crm-btn--danger" : "crm-btn--pri"}`} onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
