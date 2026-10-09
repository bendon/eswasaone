/**
 * Module settings scaffold (gap 01 C11): values that change without code — SLAs, notice periods,
 * thresholds — editable by the module manager, with "to confirm" flags for provisional
 * confirmation-pack values and a reset-demo action.
 */
import { useEffect, useState } from "react";

export type SettingField = {
  key: string;
  label: string;
  type?: "number" | "text";
  hint?: string;
  /** Provisional value from the confirmation pack — shown with a "to confirm" flag. */
  toConfirm?: boolean;
  min?: number;
  max?: number;
};

export function ModuleSettings<V extends Record<string, string | number>>({
  title,
  description,
  fields,
  values,
  onSave,
  onReset,
  canEdit = true,
}: {
  title: string;
  description?: string;
  fields: SettingField[];
  values: V;
  onSave: (v: V) => Promise<void>;
  onReset?: () => Promise<void>;
  canEdit?: boolean;
}) {
  const [draft, setDraft] = useState<V>(values);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setDraft(values), [values]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(values);
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="crm-form">
        {fields.map((f) => (
          <label key={f.key} className="crm-field">
            <span className="crm-row" style={{ gap: 6 }}>
              {f.label}
              {f.toConfirm ? <span className="crm-pill crm-pill--amber">To confirm</span> : null}
            </span>
            <input
              className="crm-input"
              type={f.type ?? "text"}
              min={f.min}
              max={f.max}
              disabled={!canEdit}
              value={String(draft[f.key] ?? "")}
              onChange={(e) => setDraft({ ...draft, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })}
            />
            {f.hint ? <span className="hint">{f.hint}</span> : null}
          </label>
        ))}
      </div>
      {canEdit ? (
        <div className="crm-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="crm-btn crm-btn--pri crm-btn--sm"
            disabled={!dirty}
            onClick={() => void onSave(draft).then(() => setMsg("Saved."), (e: Error) => setMsg(e.message))}
          >
            Save
          </button>
          {onReset ? (
            <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => void onReset().then(() => setMsg("Demo data reset."))}>
              Reset demo data
            </button>
          ) : null}
          {msg ? <span className="crm-small">{msg}</span> : null}
        </div>
      ) : (
        <p className="crm-small">Only the module manager can change these.</p>
      )}
    </div>
  );
}
