/**
 * Typed Overview / Competence / Cases sample data matching docs/mocks/eswasaone-hr.html.
 * // TODO: wire real — replace with Core/HRMS endpoints once Orchestrator owns the contract.
 */

export type AttnTone = "bad" | "leave" | "info";

export type AttentionItem = {
  id: string;
  when: string;
  tone: AttnTone;
  title: string;
  detail: string;
  jump: "time-off" | "payroll" | "directory" | "competence" | "structure" | "recruitment";
  jumpLabel: string;
};

export type EstDept = {
  name: string;
  head: string;
  approved: number;
  filled: number;
  recruiting: number;
  frozen: number;
  costCentre: string;
};

export type AwayPerson = { initials: string; name: string; detail: string };

export type Movement = {
  tone: "ok" | "info" | "mute";
  label: string;
  name: string;
  detail: string;
};

export type HeadcountPoint = { label: string; value: number };

export const ATTENTION: AttentionItem[] = [
  {
    id: "cover",
    when: "By 13 Oct",
    tone: "bad",
    title: "Zanele Nkosi is on leave 14 to 16 Oct with no cover",
    detail: "3 technical reviews in Certification would wait until she is back.",
    jump: "time-off",
    jumpLabel: "Time off",
  },
  {
    id: "payroll",
    when: "By 20 Oct",
    tone: "leave",
    title: "3 payroll changes are waiting for approval",
    detail: "October cut-off is 20 Oct. Unapproved changes roll to November.",
    jump: "payroll",
    jumpLabel: "Payroll",
  },
  {
    id: "probation",
    when: "By 31 Oct",
    tone: "leave",
    title: "2 probation reviews are due",
    detail: "Bongani Dlamini and one other. No review means automatic confirmation.",
    jump: "directory",
    jumpLabel: "Directory",
  },
  {
    id: "auth",
    when: "From 15 Nov",
    tone: "leave",
    title: "4 auditor and metrologist authorisations expire",
    detail: "Once expired, Certification and Metrology can no longer assign these people to that work.",
    jump: "competence",
    jumpLabel: "Competence",
  },
  {
    id: "contracts",
    when: "By 30 Nov",
    tone: "leave",
    title: "3 fixed-term contracts end",
    detail: "Decide to renew, convert to permanent, or let them end.",
    jump: "directory",
    jumpLabel: "Directory",
  },
  {
    id: "impartiality",
    when: "Open",
    tone: "info",
    title: "6 impartiality declarations are outstanding for 2026/27",
    detail: "80 of 86 signed. Unsigned staff are excluded from audit and decision work.",
    jump: "competence",
    jumpLabel: "Competence",
  },
];

export const ESTABLISHMENT: EstDept[] = [
  { name: "Executive Office", head: "Office of the CEO", approved: 4, filled: 4, recruiting: 0, frozen: 0, costCentre: "Main" },
  { name: "Standards Development", head: "Sibusiso Maseko", approved: 12, filled: 10, recruiting: 1, frozen: 0, costCentre: "Main" },
  { name: "Certification", head: "Nomvula Tsabedze", approved: 16, filled: 14, recruiting: 1, frozen: 0, costCentre: "Certification" },
  { name: "Metrology & Laboratories", head: "Themba Ginindza", approved: 18, filled: 15, recruiting: 2, frozen: 1, costCentre: "Metrology" },
  { name: "Field Operations", head: "Sipho Magagula (acting)", approved: 10, filled: 9, recruiting: 0, frozen: 1, costCentre: "Certification" },
  { name: "Training", head: "Ntombi Khumalo", approved: 6, filled: 6, recruiting: 0, frozen: 0, costCentre: "Training" },
  { name: "Finance", head: "Busisiwe Fakudze", approved: 9, filled: 9, recruiting: 0, frozen: 0, costCentre: "Main" },
  { name: "HR & Administration", head: "Nokuthula Shongwe", approved: 7, filled: 6, recruiting: 0, frozen: 0, costCentre: "Main" },
  { name: "Marketing & Communications", head: "Sakhile Dludlu", approved: 6, filled: 5, recruiting: 0, frozen: 0, costCentre: "Standards Sales" },
  { name: "ICT", head: "Mxolisi Bhembe", approved: 8, filled: 8, recruiting: 0, frozen: 0, costCentre: "Main" },
];

export const HEADCOUNT_SERIES: HeadcountPoint[] = [
  { label: "Nov 2025", value: 81 },
  { label: "Dec 2025", value: 81 },
  { label: "Jan 2026", value: 82 },
  { label: "Feb 2026", value: 83 },
  { label: "Mar 2026", value: 83 },
  { label: "Apr 2026", value: 84 },
  { label: "May 2026", value: 83 },
  { label: "Jun 2026", value: 84 },
  { label: "Jul 2026", value: 85 },
  { label: "Aug 2026", value: 85 },
  { label: "Sep 2026", value: 86 },
  { label: "Oct 2026", value: 86 },
];

export const AWAY_TODAY: AwayPerson[] = [
  { initials: "ND", name: "Nomsa Dube", detail: "Annual leave, back Tue 13 Oct. Sipho Magagula covers." },
  { initials: "MZ", name: "Mandla Zwane", detail: "Annual leave, back Mon 12 Oct" },
  { initials: "TM", name: "Thabiso Mkhonta", detail: "Sick leave, day 2" },
  { initials: "LS", name: "Lindiwe Simelane", detail: "Field work, audit in Manzini" },
  { initials: "GM", name: "Gcina Mavuso", detail: "Field work, on-site calibration" },
];

export const MOVEMENTS: Movement[] = [
  {
    tone: "ok",
    label: "Joined",
    name: "Sandile Ndwandwe",
    detail: "Laboratory Technician, Metrology. Onboarding 5 of 8 tasks.",
  },
  {
    tone: "info",
    label: "Promoted",
    name: "Phindile Motsa",
    detail: "Standards Officer to Senior Standards Officer, from 1 Oct",
  },
  {
    tone: "mute",
    label: "Leaving",
    name: "Mandla Zwane",
    detail: "Accountant, Finance. Last day 31 Oct. Offboarding 2 of 7 tasks.",
  },
];

export const CAL_DAYS: { dow: string; day: number }[] = [
  { dow: "Mon", day: 12 },
  { dow: "Tue", day: 13 },
  { dow: "Wed", day: 14 },
  { dow: "Thu", day: 15 },
  { dow: "Fri", day: 16 },
  { dow: "Mon", day: 19 },
  { dow: "Tue", day: 20 },
  { dow: "Wed", day: 21 },
  { dow: "Thu", day: 22 },
  { dow: "Fri", day: 23 },
];

/** Cell codes: A annual, S sick, F field, a pending annual, . empty */
export const CAL_ROWS: { name: string; cells: string }[] = [
  { name: "Nomsa Dube", cells: "A........." },
  { name: "Sifiso Hlophe", cells: "SS........" },
  { name: "Zanele Nkosi", cells: "..AAA....." },
  { name: "Bongani Dlamini", cells: "...FF....." },
  { name: "Sipho Magagula", cells: "......AAA." },
  { name: "Lindiwe Simelane", cells: ".....aaaaa" },
  { name: "Gcina Mavuso", cells: "F....FF..." },
];

export const CAL_KIND: Record<string, string> = {
  A: "Annual leave",
  S: "Sick leave",
  T: "Study leave",
  F: "Field work",
  a: "Annual leave, requested",
};

export type CompCell = "Y" | "T" | "." | `E:${string}`;

export type CompRow = { name: string; role: string; cells: CompCell[] };

export const COMP_HEADERS = [
  "QMS lead auditor\nISO 9001",
  "FSMS lead auditor\nISO 22000",
  "EMS auditor\nISO 14001",
  "OH&S auditor\nISO 45001",
  "Technical reviewer",
  "Mass calibration",
  "Volume calibration",
] as const;

export const COMP_ROWS: CompRow[] = [
  { name: "Thandi Mamba", role: "Lead Auditor", cells: ["Y", "E:30 Nov", "Y", ".", ".", ".", "."] },
  { name: "Sipho Magagula", role: "Certification Manager", cells: ["Y", ".", "E:15 Nov", ".", "Y", ".", "."] },
  { name: "Zanele Nkosi", role: "Technical Reviewer", cells: ["Y", "Y", ".", ".", "Y", ".", "."] },
  { name: "Lindiwe Simelane", role: "Auditor", cells: ["Y", "T", ".", "Y", ".", ".", "."] },
  { name: "Bongani Dlamini", role: "Certification Officer", cells: ["T", ".", ".", ".", ".", ".", "."] },
  { name: "Sifiso Hlophe", role: "Senior Metrologist", cells: [".", ".", ".", ".", ".", "Y", "E:2 Dec"] },
  { name: "Gcina Mavuso", role: "Metrologist", cells: [".", ".", ".", ".", ".", "E:20 Nov", "T"] },
];

export const COMP_COVER = [
  "4 people",
  { text: "2, 1 expiring", tone: "leave" as const },
  { text: "2, 1 expiring", tone: "leave" as const },
  { text: "1 person only", tone: "bad" as const },
  "2 people",
  { text: "2, 1 expiring", tone: "leave" as const },
  { text: "1, expiring", tone: "bad" as const },
];

export type HrCase = {
  id: string;
  kind: string;
  opened: string;
  stage: string;
  stageTone: "ok" | "leave" | "info";
  owner: string;
  next: string;
};

export const HR_CASES: HrCase[] = [
  {
    id: "HRC-2026-005",
    kind: "Disciplinary",
    opened: "29 Sep",
    stage: "Hearing scheduled",
    stageTone: "info",
    owner: "Nokuthula Shongwe",
    next: "Hearing, Fri 16 Oct",
  },
  {
    id: "HRC-2026-004",
    kind: "Grievance",
    opened: "18 Sep",
    stage: "Investigation",
    stageTone: "leave",
    owner: "Nokuthula Shongwe",
    next: "Report, Wed 14 Oct",
  },
  {
    id: "HRC-2026-003",
    kind: "Grievance",
    opened: "2 Sep",
    stage: "Outcome issued",
    stageTone: "ok",
    owner: "Busisiwe Fakudze",
    next: "Appeal window closes Tue 20 Oct",
  },
];

export const PAYROLL_STEPS = [
  { em: "Step 1", title: "Inputs open", detail: "Done 1 Oct", state: "done" as const },
  { em: "Step 2", title: "Approve changes", detail: "3 waiting", state: "now" as const },
  { em: "Step 3", title: "Calculate", detail: "After cut-off", state: "" as const },
  { em: "Step 4", title: "Review differences", detail: "HR Manager", state: "" as const },
  { em: "Step 5", title: "Approve the run", detail: "Finance Manager", state: "" as const },
  { em: "Step 6", title: "Pay and post", detail: "Fri 23 Oct", state: "" as const },
];
