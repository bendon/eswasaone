import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";

/**
 * Journey building blocks shared by My HR, My team and HR screens.
 * Spec: docs/EswasaOne_HR_SCREENS_AND_JOURNEYS.md §2 (every screen ends with a Next step card).
 */

export function NextStep({
  title,
  body,
  to,
  label,
}: {
  title: string;
  body?: string;
  to?: string;
  label?: string;
}) {
  return (
    <aside className="hr-next" aria-label="Next step">
      <span className="hr-next__k">Next step</span>
      <div>
        <b>{title}</b>
        {body ? <p>{body}</p> : null}
      </div>
      {to && label ? (
        <Link className="btn pri" to={to}>
          {label}
          <Icon name="i-arrow" />
        </Link>
      ) : null}
    </aside>
  );
}

const BANNER_ICON: Record<string, IconName> = {
  info: "i-bell",
  warn: "i-warn",
  bad: "i-alert-c",
  ok: "i-check-c",
  lock: "i-lock",
};

export function Banner({
  kind,
  title,
  children,
  action,
}: {
  kind: "info" | "warn" | "bad" | "ok" | "lock";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`hr-banner ${kind}`} role={kind === "bad" || kind === "warn" ? "alert" : undefined}>
      <Icon name={BANNER_ICON[kind]} />
      <div style={{ flex: 1 }}>
        <b>{title}</b>
        {children ? <p>{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type TrackStep = { title: string; detail?: string; state?: "done" | "now" };

export function Track({ steps }: { steps: TrackStep[] }) {
  return (
    <ol className="hr-track">
      {steps.map((s) => (
        <li key={s.title} className={s.state ?? ""} aria-current={s.state === "now" ? "step" : undefined}>
          <i aria-hidden="true" />
          <div>
            <b>{s.title}</b>
            {s.detail ? <span>{s.detail}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Crumbs({ items }: { items: Array<[string, string?]> }) {
  return (
    <nav className="hr-crumbs" aria-label="Breadcrumb">
      {items.map(([label, to], i) =>
        to && i < items.length - 1 ? (
          <span key={label}>
            <Link to={to}>{label}</Link> <span aria-hidden="true">/</span>
          </span>
        ) : (
          <span key={label} aria-current="page">
            {label}
          </span>
        ),
      )}
    </nav>
  );
}

/** Leave Application status in plain words, with its pill class. */
export function leaveStatus(status: string): { label: string; cls: string } {
  const s = (status || "").toLowerCase();
  if (s === "approved") return { label: "Approved", cls: "ok" };
  if (s === "rejected") return { label: "Not approved", cls: "bad" };
  if (s === "cancelled") return { label: "Cancelled", cls: "mute" };
  return { label: "Waiting for a decision", cls: "leave" };
}

export function StatusPill({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={`hr-st ${cls}`}>
      <span className="d" />
      {label}
    </span>
  );
}

const FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const FMT_Y = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "2 Nov" or "2 to 6 Nov 2026" style dates for screens. */
export function fmtDay(iso?: string | null, withYear = false): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return (withYear ? FMT_Y : FMT).format(d);
}

export function fmtRange(from?: string | null, to?: string | null): string {
  if (!from) return "—";
  if (!to || to.slice(0, 10) === from.slice(0, 10)) return fmtDay(from, true);
  return `${fmtDay(from)} to ${fmtDay(to, true)}`;
}

export function fmtDays(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${v} ${Math.abs(n) === 1 ? "day" : "days"}`;
}

/** Section tabs (same look as Structure's). The caller keeps the active id. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<[T, string]>; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <nav className="hr-struct-tabs" aria-label={label} role="tablist">
      {tabs.map(([id, text]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? "on" : undefined} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </nav>
  );
}
