/** Typed mocks for Home until live audits/HR wire-up. */

export type NextAudit = {
  id: string;
  company: string;
  standard: string;
  stage: string;
  time: string;
  location: string;
  whenLabel: string;
  mapsQuery: string;
};

export type ScheduleItem = {
  id: string;
  title: string;
  subtitle: string;
  time: string;
};

export type MeGlance = {
  leaveDaysLeft: number;
  nextPayday: string;
};

// TODO: wire real — GET /api/certification/audits (next assigned visit)
export const MOCK_NEXT_AUDIT: NextAudit = {
  id: "CERT-2026-00012",
  company: "Ezulwini Hospitality Group",
  standard: "ISO 9001",
  stage: "Stage 2",
  time: "10:00",
  location: "Mbabane",
  whenLabel: "TODAY",
  mapsQuery: "Ezulwini Hospitality Group, Mbabane",
};

// TODO: wire real — today's schedule from certification audits
export const MOCK_SCHEDULE: ScheduleItem[] = [
  {
    id: "CERT-2026-00012",
    title: "Ezulwini Hospitality",
    subtitle: "10:00 · ISO 9001 Stage 2",
    time: "10:00",
  },
  {
    id: "CERT-2026-00009",
    title: "Swazi Beverages",
    subtitle: "14:00 · Surveillance visit",
    time: "14:00",
  },
];

// TODO: wire real — leave balance + payroll payday from HR APIs
export const MOCK_ME_GLANCE: MeGlance = {
  leaveDaysLeft: 11,
  nextPayday: "24 Feb",
};
