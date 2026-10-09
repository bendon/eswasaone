import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon";
import { Select } from "./Select";

/* ---------- ModuleHeader ---------- */

export type SummaryTile = {
  label: string;
  value: string | number;
  /** "breach" = red, "due" = amber, "ok" = green, undefined = neutral */
  variant?: "breach" | "due" | "ok";
};

type ModuleHeaderProps = {
  title: string;
  subtitle?: string;
  summary?: SummaryTile[];
  /** Extra content on the right (buttons, view toggles) */
  extra?: ReactNode;
};

/** Page-level header with title, subtitle, and optional KPI summary tiles.
 *  Matches the `.inbox-head` pattern from the Approvals page. */
export function ModuleHeader({ title, subtitle, summary, extra }: ModuleHeaderProps) {
  return (
    <div className="mod-head">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {summary?.length ? (
        <div className="mod-summary">
          {summary.map((s) => (
            <div key={s.label} className={`mod-sm${s.variant ? ` ${s.variant}` : ""}`}>
              <span className="n">{s.value}</span>
              <span className="l">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {extra ? <div className="mod-extra">{extra}</div> : null}
    </div>
  );
}

/* ---------- DataRow ---------- */

export type DataMetaItem = {
  label: string;
  /** Render as SLA pill instead of plain text */
  sla?: "breach" | "due" | "ok";
  /** Render as a tag/badge */
  tag?: boolean;
  /** Render in mono font (references, IDs) */
  mono?: boolean;
};

type DataRowProps = {
  icon?: IconName;
  iconVariant?: "navy" | "purple" | "amber" | "green" | "red";
  title: string;
  badge?: string;
  meta?: DataMetaItem[];
  actions?: ReactNode;
  /** Expandable inline detail (key-value pairs) */
  detail?: { label: string; value: string }[];
  /** Clicking the row opens a drawer (set onOpen) */
  onOpen?: () => void;
  /** Controlled expand state for inline detail */
  expanded?: boolean;
  onToggleExpand?: () => void;
};

/** Row card matching the `.inbox-row` pattern.
 *  - Clicking the row body calls `onOpen` (for drawer)
 *  - Caret button toggles inline detail expansion
 *  - Action buttons rendered on the right */
export function DataRow({
  icon,
  iconVariant = "navy",
  title,
  badge,
  meta,
  actions,
  detail,
  onOpen,
  expanded,
  onToggleExpand,
}: DataRowProps) {
  return (
    <div className={`data-row${expanded ? " open" : ""}`}>
      <div className="data-row__main">
        {icon ? (
          <span className={`data-row__ic ic-${iconVariant}`}>
            <Icon name={icon} />
          </span>
        ) : null}
        <div className="data-row__body" onClick={onOpen} role={onOpen ? "button" : undefined}>
          <div className="data-row__title">
            {title}
            {badge ? <span className="data-row__badge">{badge}</span> : null}
          </div>
          {meta?.length ? (
            <div className="data-row__meta">
              {meta.map((m, i) => {
                if (m.sla) {
                  return (
                    <span key={i} className={`sla ${m.sla}`}>
                      <span className="d" />
                      {m.label}
                    </span>
                  );
                }
                if (m.tag) {
                  return (
                    <span key={i} className="tag">{m.label}</span>
                  );
                }
                return (
                  <span key={i} className={m.mono ? "mono" : undefined}>{m.label}</span>
                );
              })}
            </div>
          ) : null}
        </div>
        {actions ? <div className="data-row__act">{actions}</div> : null}
        {detail ? (
          <button
            type="button"
            className="data-caret"
            aria-expanded={expanded}
            aria-label="Toggle detail"
            onClick={onToggleExpand}
          >
            <Icon name="i-cev" />
          </button>
        ) : null}
      </div>
      {detail && expanded ? (
        <div className="data-row__detail">
          <div className="data-kvs">
            {detail.map((d) => (
              <div key={d.label}>
                <b>{d.label}</b>
                <span>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- RecordDrawer ---------- */

export type DrawerSection = {
  heading?: string;
  content: ReactNode;
};

export type DrawerAction = {
  label: string;
  icon?: IconName;
  variant?: "pri" | "gold" | "ghost";
  onClick: () => void;
  disabled?: boolean;
};

type RecordDrawerProps = {
  open: boolean;
  onClose: () => void;
  reference?: string;
  title: string;
  subtitle?: ReactNode;
  sections: DrawerSection[];
  actions?: DrawerAction[];
};

/** Slide-in drawer matching the `.cert-drawer` pattern.
 *  Renders a scrim + right-side panel with header, scrollable body, and footer actions. */
export function RecordDrawer({
  open,
  onClose,
  reference,
  title,
  subtitle,
  sections,
  actions,
}: RecordDrawerProps) {
  if (!open) return null;

  return (
    <>
      <div className="drawer-scrim show" onClick={onClose} />
      <aside className="record-drawer show" role="dialog" aria-label={`${title} details`}>
        <div className="record-drawer__h">
          <button className="x" type="button" onClick={onClose} aria-label="Close">×</button>
          {reference ? <div className="record-drawer__ref mono">{reference}</div> : null}
          <div className="record-drawer__title">{title}</div>
          {subtitle ? <div className="record-drawer__sub">{subtitle}</div> : null}
        </div>
        <div className="record-drawer__b">
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading ? <div className="dh">{s.heading}</div> : null}
              {s.content}
            </div>
          ))}
        </div>
        {actions?.length ? (
          <div className="record-drawer__f">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={`btn ${a.variant || "pri"}${a.variant === "ghost" ? "" : ""}`}
                style={{ flex: a.variant === "ghost" ? undefined : 1 }}
                onClick={a.onClick}
                disabled={a.disabled}
              >
                {a.icon ? <Icon name={a.icon} /> : null}
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </aside>
    </>
  );
}

/* ---------- Toolbar ---------- */

type ToolbarProps = {
  /** Filter dropdowns */
  filters?: { label: string; value: string; options: string[]; onChange: (v: string) => void }[];
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  extra?: ReactNode;
};

/** Unified toolbar with filter dropdowns and search.
 *  Matches the `.inbox-toolbar` pattern. */
export function Toolbar({ filters, search, extra }: ToolbarProps) {
  return (
    <div className="mod-toolbar">
      {filters?.map((f) => (
        <Select
          key={f.label}
          className="mod-sel"
          value={f.value}
          onChange={f.onChange}
          options={f.options}
          aria-label={f.label}
        />
      ))}
      {search ? (
        <div className="mod-search">
          <Icon name="i-search" />
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder || "Search…"}
            aria-label="Search"
          />
        </div>
      ) : null}
      {extra}
    </div>
  );
}

/* ---------- Toast ---------- */

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mod-toast show" role="status" aria-live="polite">
      {message}
    </div>
  );
}