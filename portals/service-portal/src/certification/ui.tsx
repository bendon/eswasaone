import { useEffect, useId, type ReactNode } from "react";
import { Icon } from "@eswasaone/shared-ui";
import { FLOW_STAGES, fmtDate, type CertFlow } from "./flows";

/* ---------- Fields ---------- */

export function Field({
  label,
  required,
  hint,
  error,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`cf-field${error ? " is-invalid" : ""} ${className}`.trim()}>
      <span className="lbl">
        {label}
        {required ? <em aria-hidden="true">*</em> : null}
      </span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  type = "text",
  placeholder,
  className,
  multiline,
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  error?: string | null;
  type?: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric";
  autoComplete?: string;
}) {
  return (
    <Field label={label} required={required} hint={hint} error={error} className={className}>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-required={required || undefined}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-required={required || undefined}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  hint,
  error,
  className,
  placeholder = "Select…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (string | { value: string; label: string })[];
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} required={required} hint={hint} error={error} className={className}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-required={required || undefined}>
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

/** Single choice rendered as pill radios. */
export function Choice({
  label,
  value,
  onChange,
  options,
  required,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (string | { value: string; label: string })[];
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
}) {
  const name = useId();
  return (
    <div className={`cf-field${error ? " is-invalid" : ""} ${className ?? ""}`.trim()} role="radiogroup" aria-label={label}>
      <span className="lbl">
        {label}
        {required ? <em aria-hidden="true">*</em> : null}
      </span>
      <div className="cf-choices">
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <label className="cf-choice" key={opt.value}>
              <input
                type="radio"
                name={name}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}

export function YesNo({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: "yes" | "no") => void;
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
}) {
  return (
    <Choice
      label={label}
      value={value}
      onChange={(v) => onChange(v as "yes" | "no")}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
      required={required}
      hint={hint}
      error={error}
      className={className}
    />
  );
}

/** Multi-select pills. */
export function MultiChoice({
  label,
  values,
  onChange,
  options,
  hint,
  error,
  required,
  className,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: readonly string[];
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`cf-field${error ? " is-invalid" : ""} ${className ?? ""}`.trim()} role="group" aria-label={label}>
      <span className="lbl">
        {label}
        {required ? <em aria-hidden="true">*</em> : null}
      </span>
      <div className="cf-choices">
        {options.map((o) => (
          <label className="cf-choice" key={o}>
            <input
              type="checkbox"
              checked={values.includes(o)}
              onChange={() =>
                onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o])
              }
            />
            {o}
          </label>
        ))}
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}

/* ---------- Files ---------- */

export function UploadButton({
  label = "Upload",
  accept = "application/pdf,image/*",
  onFile,
  disabled,
}: {
  label?: string;
  accept?: string;
  onFile: (f: File) => void;
  disabled?: boolean;
}) {
  return (
    <label className="cf-upload" aria-disabled={disabled || undefined}>
      <Icon name="i-dl" /> {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function FileRow({
  title,
  sub,
  state,
  action,
}: {
  title: string;
  sub?: string;
  state: "ok" | "req" | "idle";
  action?: ReactNode;
}) {
  return (
    <div className={`cf-file${state === "ok" ? " is-ok" : state === "req" ? " is-req" : ""}`}>
      <span className="ic">
        <Icon name={state === "ok" ? "i-check" : "i-file"} />
      </span>
      <div className="grow">
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </div>
      {action}
    </div>
  );
}

/* ---------- Flow timeline ---------- */

export function FlowTimeline({
  flow,
  current,
  notes,
}: {
  flow: CertFlow;
  current: string;
  /** Extra line under a stage, keyed by stage key. */
  notes?: Record<string, ReactNode>;
}) {
  const stages = FLOW_STAGES[flow];
  const idx = stages.findIndex((s) => s.key === current);
  return (
    <ol className="cf-timeline">
      {stages.map((s, i) => {
        const state = idx < 0 ? "todo" : i < idx ? "done" : i === idx ? "cur" : "todo";
        return (
          <li className={`cf-tl is-${state}`} key={s.key} aria-current={state === "cur" ? "step" : undefined}>
            <span className="cf-tl__dot">{state === "done" ? <Icon name="i-check" /> : i + 1}</span>
            <div className="cf-tl__body">
              <b>{s.title}</b>
              <p>{s.body}</p>
              <div className="cf-tl__meta">
                {state === "cur" ? <span className="cf-chip cf-chip--gold">Current stage</span> : null}
                {s.sla ? (
                  <span className="cf-chip cf-chip--muted">
                    <Icon name="i-clock" /> {s.sla}
                  </span>
                ) : null}
              </div>
              {notes?.[s.key] ? <div style={{ marginTop: 8 }}>{notes[s.key]}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Overlays ---------- */

function useEscape(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function Sheet({
  title,
  lead,
  onClose,
  children,
}: {
  title: string;
  lead?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div
      className="cf-sheet-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cf-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {lead ? <p>{lead}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function SideDrawer({
  kicker,
  title,
  onClose,
  children,
}: {
  kicker?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscape(onClose);
  return (
    <>
      <div className="cf-drawer-bg" onClick={onClose} />
      <aside className="cf-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="cf-btn cf-btn--ghost cf-btn--sm cf-drawer__x" onClick={onClose} aria-label="Close">
          <Icon name="i-x" />
        </button>
        {kicker ? <span className="cf-head__kicker">{kicker}</span> : null}
        <h2>{title}</h2>
        {children}
      </aside>
    </>
  );
}

export function Activity({ items }: { items: { at: string; who: "you" | "eswasa"; text: string }[] }) {
  if (!items.length) return <p className="cf-empty">No activity yet.</p>;
  return (
    <ul className="cf-act">
      {[...items].reverse().map((a, i) => (
        <li key={`${a.at}-${i}`} className={a.who}>
          <span className="d" />
          <div>
            {a.text}
            <small>
              {a.who === "you" ? "You" : "ESWASA"} · {fmtDate(a.at)}
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}
