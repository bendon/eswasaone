/**
 * Working-day SLA clock. Counts Mon–Fri minus Eswatini fixed-date public holidays,
 * and pauses while ESWASA waits on the customer (workflow map invariant 3).
 * TODO: wire real — movable feasts (Easter, Ascension, Umhlanga, Incwala) come from the HRMS Holiday List.
 */
import type { Case, CaseTypeConfig } from "./types";

const FIXED_HOLIDAYS = ["01-01", "04-19", "04-25", "05-01", "07-22", "09-06", "12-25", "12-26"];

function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return !FIXED_HOLIDAYS.includes(md);
}

/** Whole working days elapsed between two instants (start day excluded). */
export function workingDaysBetween(fromIso: string, to: Date = new Date()): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime()) || to <= from) return 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  let n = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    if (isWorkingDay(cur)) n += 1;
  }
  return n;
}

/** Date that is `days` working days after `fromIso`. */
export function addWorkingDays(fromIso: string, days: number): Date {
  const d = new Date(fromIso);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

export type SlaStatus = "ok" | "due" | "breach";

export type CaseSla = {
  status: SlaStatus;
  paused: boolean;
  stopped: boolean;
  elapsed: number;
  target: number;
  remaining: number;
  due: Date;
  /** Short chip text: "3d left", "2d over", "Paused", "Met". */
  label: string;
  ack: { done: boolean; status: SlaStatus; label: string };
};

const STOPPED = new Set(["Resolved", "Closed"]);

export function caseSla(c: Case, cfg: CaseTypeConfig, now: Date = new Date()): CaseSla {
  const target = cfg.resolve_days;
  const paused = c.state === "Awaiting Customer";
  const stopped = STOPPED.has(c.state);
  const end = stopped && c.resolved_at ? new Date(c.resolved_at) : now;
  const pausedNow = paused && c.paused_since ? workingDaysBetween(c.paused_since, now) : 0;
  const elapsed = Math.max(0, workingDaysBetween(c.created_at, end) - c.paused_wd - pausedNow);
  const remaining = target - elapsed;
  const due = addWorkingDays(c.created_at, target + c.paused_wd + pausedNow);
  const dueSoon = Math.max(1, Math.round(target * 0.2));
  const status: SlaStatus = remaining < 0 ? "breach" : remaining <= dueSoon ? "due" : "ok";

  let label: string;
  if (stopped) label = remaining < 0 ? `Late by ${-remaining}d` : "Met";
  else if (paused) label = "Paused";
  else if (remaining < 0) label = `${-remaining}d over`;
  else if (remaining === 0) label = "Due today";
  else label = `${remaining}d left`;

  const ackElapsed = workingDaysBetween(c.created_at, c.acknowledged_at ? new Date(c.acknowledged_at) : now);
  const ackDone = Boolean(c.acknowledged_at);
  const ackStatus: SlaStatus = ackElapsed > cfg.ack_days ? "breach" : ackElapsed === cfg.ack_days ? "due" : "ok";

  return {
    status: stopped ? (remaining < 0 ? "breach" : "ok") : paused ? "ok" : status,
    paused,
    stopped,
    elapsed,
    target,
    remaining,
    due,
    label,
    ack: {
      done: ackDone,
      status: ackDone ? "ok" : ackStatus,
      label: ackDone ? "Acknowledged" : `Ack ${Math.max(0, cfg.ack_days - ackElapsed)}d left`,
    },
  };
}
