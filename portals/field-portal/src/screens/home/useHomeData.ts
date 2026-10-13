import { useCallback, useEffect, useState } from "react";
import { AuthError, apiFetch } from "@eswasaone/shared-ui";
import { useAuth } from "../../auth/AuthProvider";
import { readSnapshot, writeSnapshot } from "../../lib/localSnapshot";
import { companyOf, schemeLabel } from "../audits/api";
import type { FieldAuditRow } from "../audits/types";
import { EMPTY_ME_GLANCE, type MeGlance, type NextAudit, type ScheduleItem } from "./homeTypes";

const AUDITS_PATH = "/certification/audits?limit=50";
const BALANCES_PATH = "/hr/leave/balances";

type LeaveBalances = {
  items?: Array<{ leave_type?: string; allocated?: number; balance?: number }>;
};

function pickNext(rows: FieldAuditRow[]): NextAudit | null {
  if (!rows.length) return null;
  const a = rows[0];
  return {
    id: a.id,
    company: companyOf(a),
    standard: a.scheme || null,
    stage: a.stage || a.status || null,
    time: a.time_label || null,
    location: a.location || null,
    whenLabel: a.due_date ? `DUE ${a.due_date}` : "SCHEDULED",
    mapsQuery: `${companyOf(a)}${a.location ? `, ${a.location}` : ""}`,
  };
}

function toSchedule(rows: FieldAuditRow[]): ScheduleItem[] {
  return rows.slice(0, 5).map((a) => ({
    id: a.id,
    title: companyOf(a),
    subtitle: schemeLabel(a),
    time: a.time_label || a.due_date || "—",
  }));
}

/** The leave type with the largest allocation (the main entitlement), as HR named it. */
function balancesToGlance(b: LeaveBalances | null): MeGlance {
  const items = (b?.items ?? []).filter((i) => typeof i.balance === "number");
  if (!items.length) return EMPTY_ME_GLANCE;
  const main = items.reduce((a, c) => ((c.allocated ?? 0) > (a.allocated ?? 0) ? c : a));
  return { leaveDaysLeft: main.balance ?? null, leaveType: main.leave_type ?? null };
}

/**
 * Home data with last-known-good snapshots — avoids blank reload flashes.
 */
export function useHomeData() {
  const { user } = useAuth();
  const [next, setNext] = useState<NextAudit | null>(() => {
    const snap = readSnapshot<{ items: FieldAuditRow[] }>(AUDITS_PATH);
    return snap ? pickNext(snap.data.items ?? []) : null;
  });
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() => {
    const snap = readSnapshot<{ items: FieldAuditRow[] }>(AUDITS_PATH);
    return toSchedule(snap?.data.items ?? []);
  });
  const [me, setMe] = useState<MeGlance>(() => {
    const snap = readSnapshot<LeaveBalances>(`${user?.username ?? "guest"}:${BALANCES_PATH}`);
    return balancesToGlance(snap?.data ?? null);
  });
  const [fromCache, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    let gotNetwork = false;
    try {
      const audits = await apiFetch<{ items: FieldAuditRow[] }>(AUDITS_PATH);
      writeSnapshot(AUDITS_PATH, audits);
      const rows = audits.items ?? [];
      setNext(pickNext(rows));
      setSchedule(toSchedule(rows));
      gotNetwork = true;
    } catch (e) {
      if (!(e instanceof AuthError)) {
        const snap = readSnapshot<{ items: FieldAuditRow[] }>(AUDITS_PATH);
        if (snap?.data.items?.length) {
          const n = pickNext(snap.data.items);
          if (n) setNext(n);
          setSchedule(toSchedule(snap.data.items));
        }
      }
    }

    try {
      const bal = await apiFetch<LeaveBalances>(BALANCES_PATH);
      writeSnapshot(`${user?.username ?? "guest"}:${BALANCES_PATH}`, bal);
      setMe(balancesToGlance(bal));
      gotNetwork = true;
    } catch {
      const snap = readSnapshot<LeaveBalances>(`${user?.username ?? "guest"}:${BALANCES_PATH}`);
      if (snap) setMe(balancesToGlance(snap.data));
    }

    setFromCache(!gotNetwork);
    setRefreshing(false);
  }, [user?.username]);

  useEffect(() => {
    void reload();
  }, [reload, user?.username]);

  return { next, schedule, me, fromCache, refreshing, reload };
}
