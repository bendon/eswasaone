import { useCallback, useEffect, useState } from "react";
import { AuthError, apiFetch } from "@eswasaone/shared-ui";
import { useAuth } from "../../auth/AuthProvider";
import { readSnapshot, writeSnapshot } from "../../lib/localSnapshot";
import { companyOf, schemeLabel } from "../audits/api";
import type { FieldAuditRow } from "../audits/types";
import {
  MOCK_ME_GLANCE,
  MOCK_NEXT_AUDIT,
  MOCK_SCHEDULE,
  type MeGlance,
  type NextAudit,
  type ScheduleItem,
} from "./mockData";

const AUDITS_PATH = "/certification/audits?limit=50";
const BALANCES_PATH = "/hr/leave/balances";

type LeaveBalances = {
  annual?: number | null;
  sick?: number | null;
  study?: number | null;
  items?: Array<{ leave_type?: string; balance?: number }>;
};

function pickNext(rows: FieldAuditRow[]): NextAudit | null {
  if (!rows.length) return null;
  const a = rows[0];
  return {
    id: a.id,
    company: companyOf(a),
    standard: a.scheme || "ISO",
    stage: a.stage || a.status || "Visit",
    time: a.time_label || "—",
    location: a.location || "TBD",
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

function balancesToGlance(b: LeaveBalances | null): MeGlance {
  if (!b) return MOCK_ME_GLANCE;
  if (typeof b.annual === "number") {
    return { leaveDaysLeft: b.annual, nextPayday: MOCK_ME_GLANCE.nextPayday };
  }
  const annual = b.items?.find((i) =>
    /annual/i.test(i.leave_type || ""),
  )?.balance;
  if (typeof annual === "number") {
    return { leaveDaysLeft: annual, nextPayday: MOCK_ME_GLANCE.nextPayday };
  }
  return MOCK_ME_GLANCE;
}

/**
 * Home data with last-known-good snapshots — avoids blank reload flashes.
 */
export function useHomeData() {
  const { user } = useAuth();
  const [next, setNext] = useState<NextAudit>(() => {
    const snap = readSnapshot<{ items: FieldAuditRow[] }>(AUDITS_PATH);
    return (snap && pickNext(snap.data.items ?? [])) || MOCK_NEXT_AUDIT;
  });
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() => {
    const snap = readSnapshot<{ items: FieldAuditRow[] }>(AUDITS_PATH);
    const rows = snap?.data.items ?? [];
    return rows.length ? toSchedule(rows) : MOCK_SCHEDULE;
  });
  const [me, setMe] = useState<MeGlance>(() => {
    const snap = readSnapshot<LeaveBalances>(BALANCES_PATH);
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
      const n = pickNext(rows);
      if (n) setNext(n);
      if (rows.length) setSchedule(toSchedule(rows));
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
      writeSnapshot(BALANCES_PATH, bal);
      setMe(balancesToGlance(bal));
      gotNetwork = true;
    } catch {
      const snap = readSnapshot<LeaveBalances>(BALANCES_PATH);
      if (snap) setMe(balancesToGlance(snap.data));
    }

    setFromCache(!gotNetwork);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, user?.username]);

  return { next, schedule, me, fromCache, refreshing, reload };
}
