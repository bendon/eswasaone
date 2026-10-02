import { Icon } from "@eswasaone/shared-ui";
import type { AuditSegment, FieldAuditRow } from "./types";
import { companyOf, codeOf, schemeLabel } from "./api";
import { isSubmittedStatus } from "./segments";

const SEGMENTS: { id: AuditSegment; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "submitted", label: "Submitted" },
];

function statusPill(a: FieldAuditRow): { cls: string; label: string } {
  const s = a.status.toLowerCase();
  if (isSubmittedStatus(a.status)) {
    return { cls: "aud-stt aud-stt--done", label: "Submitted" };
  }
  if (s.includes("progress") || s.includes("draft")) {
    return {
      cls: "aud-stt aud-stt--prog",
      label: a.time_label || "In progress",
    };
  }
  if (s.includes("overdue") || s.includes("late")) {
    return { cls: "aud-stt aud-stt--prog", label: "Overdue" };
  }
  return {
    cls: "aud-stt aud-stt--sched",
    label: a.time_label || "Scheduled",
  };
}

type Props = {
  segment: AuditSegment;
  onSegment: (s: AuditSegment) => void;
  items: FieldAuditRow[];
  onOpen: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function AuditList({
  segment,
  onSegment,
  items,
  onOpen,
  loading,
  error,
  onRetry,
}: Props) {
  return (
    <div className="aud-list">
      <div className="aud-seg" role="tablist" aria-label="Audit filters">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={segment === s.id}
            className={segment === s.id ? "on" : undefined}
            onClick={() => onSegment(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p className="field-muted">Loading audits…</p>}

      {error && (
        <div className="aud-error" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button type="button" className="btn-ghost" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="field-card">
          <p className="field-card__label">No audits</p>
          <p className="field-muted">
            Nothing in {SEGMENTS.find((s) => s.id === segment)?.label.toLowerCase()}{" "}
            right now.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="aud-card" role="list">
          {items.map((a) => {
            const pill = statusPill(a);
            return (
              <button
                key={a.id}
                type="button"
                className="aud-row"
                role="listitem"
                onClick={() => onOpen(a.id)}
              >
                <span className="aud-row__ic" aria-hidden>
                  <Icon name="i-badge" />
                </span>
                <span className="aud-row__b">
                  <b>{companyOf(a)}</b>
                  <span className="aud-row__code">
                    {codeOf(a)} · {schemeLabel(a)}
                  </span>
                </span>
                <span className={pill.cls}>
                  <span className="aud-stt__d" />
                  {pill.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
