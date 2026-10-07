import { useState, type FormEvent, type ReactNode } from "react";
import { Select } from "./Select";

export type FormDrawerField = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "textarea" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
};

export type FormDrawerProps = {
  open: boolean;
  title: string;
  mode: "create" | "edit";
  fields: FormDrawerField[];
  /** Initial values for edit mode */
  values?: Record<string, string>;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  children?: ReactNode;
};

/**
 * Lightweight create/edit drawer for portal forms.
 * Wave 0: field list is caller-supplied (typed module forms).
 * Full DocType meta via GET /api/meta/:doctype lands when F0b ships that contract —
 * until then do not invent meta clients; use this or DeskLink.
 */
export function FormDrawer({
  open,
  title,
  mode,
  fields,
  values,
  submitLabel,
  busy = false,
  error,
  onClose,
  onSubmit,
  children,
}: FormDrawerProps) {
  const [local, setLocal] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.name] = values?.[f.name] ?? f.defaultValue ?? "";
    }
    return init;
  });

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void onSubmit(local);
  }

  return (
    <div className="overlay show" role="dialog" aria-modal="true" aria-label={title}>
      <div className="record-drawer form-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="record-drawer__head">
          <h3>
            {title}
            <span className="muted"> · {mode}</span>
          </h3>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="form-drawer__body">
          {fields.map((f) => (
            <label key={f.name} className="dialog-field">
              {f.label}
              {f.type === "textarea" ? (
                <textarea
                  value={local[f.name] ?? ""}
                  placeholder={f.placeholder}
                  required={f.required}
                  disabled={busy}
                  onChange={(e) => setLocal((s) => ({ ...s, [f.name]: e.target.value }))}
                />
              ) : f.type === "select" ? (
                <Select
                  block
                  value={local[f.name] ?? ""}
                  required={f.required}
                  disabled={busy}
                  placeholder={f.placeholder ?? "Select…"}
                  options={f.options ?? []}
                  onChange={(v) => setLocal((s) => ({ ...s, [f.name]: v }))}
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  value={local[f.name] ?? ""}
                  placeholder={f.placeholder}
                  required={f.required}
                  disabled={busy}
                  onChange={(e) => setLocal((s) => ({ ...s, [f.name]: e.target.value }))}
                />
              )}
            </label>
          ))}
          {children}
          {error ? (
            <p className="form-drawer__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="alt" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="cta" disabled={busy}>
              {submitLabel ?? (mode === "create" ? "Create" : "Save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
