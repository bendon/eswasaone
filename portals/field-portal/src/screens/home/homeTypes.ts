/** Home data shapes. Everything shown comes from the API (or this device's last-known-good copy of it). */

export type NextAudit = {
  id: string;
  company: string;
  standard: string | null;
  stage: string | null;
  time: string | null;
  location: string | null;
  whenLabel: string;
  mapsQuery: string;
};

export type ScheduleItem = {
  id: string;
  title: string;
  subtitle: string;
  time: string;
};

/** Live only: null until /hr/leave/balances answers (HR never shows a sample value). */
export type MeGlance = {
  leaveDaysLeft: number | null;
  /** The leave type the number is for, as HR named it. */
  leaveType: string | null;
};

export const EMPTY_ME_GLANCE: MeGlance = { leaveDaysLeft: null, leaveType: null };
