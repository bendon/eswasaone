import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon";
import { CUSTOMER_STATE_LABEL, STATE_TONE } from "./caseFlow";
import type { CaseSla } from "./sla";
import type { Case, CaseMessage, CaseState } from "./types";
import { fmtWhen } from "./useCrm";

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function StatePill({ state, customer = false }: { state: CaseState; customer?: boolean }) {
  const tone = STATE_TONE[state];
  return <span className={`crm-pill crm-pill--${tone}`}>{customer ? CUSTOMER_STATE_LABEL[state] : state}</span>;
}

export function SlaChip({ sla }: { sla: CaseSla }) {
  const cls = sla.paused ? "paused" : sla.stopped ? (sla.status === "breach" ? "breach" : "ok") : sla.status;
  return (
    <span className={`crm-sla crm-sla--${cls}`} title={`Target ${sla.target} working days · ${sla.elapsed} used`}>
      {sla.label}
    </span>
  );
}

export function SlaClock({ sla }: { sla: CaseSla }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const used = Math.min(1, sla.elapsed / Math.max(1, sla.target));
  const cls = sla.paused ? "paused" : sla.status;
  return (
    <div className="crm-clock">
      <svg className={`crm-clock__ring ${cls}`} viewBox="0 0 64 64" aria-hidden="true">
        <circle className="bg" cx="32" cy="32" r={r} />
        <circle className="fg" cx="32" cy="32" r={r} strokeDasharray={circ} strokeDashoffset={circ * (1 - used)} />
      </svg>
      <div>
        <b>{sla.paused ? "Clock paused" : sla.stopped ? (sla.status === "breach" ? "Resolved late" : "Resolved in time") : sla.label}</b>
        <span className="crm-small">
          {sla.elapsed} of {sla.target} working days used
          {sla.stopped ? "" : ` · due ${sla.due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
        </span>
      </div>
    </div>
  );
}

export function Thread({
  messages,
  customerView = false,
  selfLabel,
}: {
  messages: CaseMessage[];
  customerView?: boolean;
  /** In the customer view, label for the reporter's own messages. */
  selfLabel?: string;
}) {
  return (
    <div className="crm-thread">
      {messages.map((m) => {
        const kind =
          m.role === "system" ? "system" : m.visibility === "internal" ? "internal" : m.role === "staff" ? "staff" : "customer";
        // Customers see their own messages on the right.
        const side = customerView ? (m.role === "customer" ? "staff" : kind === "system" ? "system" : "customer") : kind;
        const author = customerView && m.role === "customer" ? selfLabel ?? "You" : customerView && m.role === "staff" ? "ESWASA" : m.author;
        return (
          <div key={m.id} className={`crm-msg crm-msg--${side}${kind === "internal" ? " crm-msg--internal" : ""}`}>
            <span className="crm-msg__av">{author === "ESWASA" ? "ES" : initials(author)}</span>
            <div className="crm-msg__b">
              <div className="crm-msg__meta">
                <b>{author}</b>
                {kind === "internal" ? <span className="crm-pill crm-pill--gold">Internal note</span> : null}
                <span>{fmtWhen(m.at)}</span>
              </div>
              <div className="crm-msg__body">{m.body}</div>
              {m.attachments?.length ? (
                <div className="crm-msg__files">
                  {m.attachments.map((a) => (
                    <span key={a} className="crm-pill crm-pill--outline">
                      <Icon name="i-clip" size={12} /> {a}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CaseTimeline({ c, customer = false }: { c: Case; customer?: boolean }) {
  const events = [...c.events].reverse();
  return (
    <ul className="crm-timeline">
      {events.map((e, i) => {
        const label = customer && e.to ? CUSTOMER_STATE_LABEL[e.to] : e.action;
        const cls = i === 0 ? "is-now" : e.to === "Resolved" || e.to === "Closed" ? "is-ok" : e.to === "Awaiting Customer" || e.to === "Escalated" ? "is-warn" : "";
        return (
          <li key={`${e.at}-${i}`} className={cls}>
            <b>{label}</b>
            <span>
              {fmtWhen(e.at)}
              {!customer ? ` · ${e.actor}` : ""}
              {!customer && e.note ? ` — ${e.note}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function CrmEmpty({
  icon = "i-search",
  title,
  detail,
  action,
}: {
  icon?: IconName;
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="crm-empty">
      <Icon name={icon} />
      <b>{title}</b>
      {detail ? <p>{detail}</p> : null}
      {action}
    </div>
  );
}

/** Shown only when demo data is explicitly off (VITE_DEMO_MODE=false) and Core endpoints aren't live. */
export function CrmNotConnected({ what = "This screen", audience = "staff" }: { what?: string; audience?: "staff" | "public" }) {
  return (
    <CrmEmpty
      icon="i-link"
      title={`${what} isn't connected yet`}
      detail={
        audience === "staff"
          ? "This screen still needs a live Core Engine endpoint. Certification applications, CRM deals and metrology jobs are wired; cases and clients are not yet connected."
          : "Online cases aren't connected to ESWASA yet. Please email info@eswasa.co.sz or call (+268) 2518 4633 and we'll log it for you."
      }
    />
  );
}

export function CrmBanner({
  tone = "warn",
  icon,
  children,
}: {
  tone?: "warn" | "info" | "lock" | "ok" | "err";
  icon?: IconName;
  children: ReactNode;
}) {
  const ic: IconName = icon ?? (tone === "lock" ? "i-lock" : tone === "ok" ? "i-check-c" : tone === "info" ? "i-spark" : "i-warn");
  return (
    <div className={`crm-banner${tone === "warn" ? "" : ` crm-banner--${tone}`}`} role={tone === "err" ? "alert" : undefined}>
      <Icon name={ic} />
      <div>{children}</div>
    </div>
  );
}

export function CrmDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="crm-scrim" onClick={onClose} />
      <aside className={`crm-drawer${wide ? " crm-drawer--wide" : ""}`} role="dialog" aria-label={title}>
        <div className="crm-drawer__h">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="crm-drawer__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="crm-drawer__b">{children}</div>
        {footer ? <div className="crm-drawer__f">{footer}</div> : null}
      </aside>
    </>
  );
}

/** Tiny toast hook: `const [toast, show] = useCrmToast(); … {toast}` */
export function useCrmToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="crm-toast" role="status">{msg}</div> : null, setMsg];
}

export function Stars({ value, onChange, size }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <span className="crm-stars" role={onChange ? "radiogroup" : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? "on" : ""}
          style={size ? { fontSize: size } : undefined}
          onClick={() => onChange?.(n)}
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          aria-checked={onChange ? n === value : undefined}
          role={onChange ? "radio" : undefined}
        >
          ★
        </button>
      ))}
    </span>
  );
}
