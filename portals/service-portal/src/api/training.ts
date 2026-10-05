import { apiFetch } from "@eswasaone/shared-ui";

export type Course = {
  id: string;
  title: string;
  summary: string;
  duration: string;
  fee: string;
  code?: string;
  chip?: string;
  accent?: string;
  tint?: string;
  tone?: string;
  level?: string;
  delivery?: string;
  nextSession?: string;
  nextPlace?: string;
  seats?: string;
  badge?: string;
  badgeKind?: "default" | "subsidised" | "limited";
  cta?: string;
  ctaClass?: "primary" | "gold";
  secondaryLabel?: string;
  waitlist?: boolean;
};

export type UpcomingSession = {
  date: string;
  title: string;
  place: string;
  placeIcon: "i-pin" | "i-monitor";
  price: string;
  seats: string;
  action: string;
  to: string;
};

export type LearningPath = {
  id: string;
  title: string;
  body: string;
  steps: string[];
  meta: string;
  tint: string;
  tone: string;
  icon: "i-clipboard" | "i-badge" | "i-globe" | "i-shield" | "i-users" | "i-star";
};

const FALLBACK: Course[] = [
  {
    id: "haccp-implementation",
    code: "TRN-FS-101",
    title: "HACCP: Awareness and implementation",
    summary:
      "Build a working HACCP plan for your facility. Covers hazard analysis, critical control point identification, monitoring, corrective actions, verification, and record-keeping. Aligned to SZNS SANS 10330:2007.",
    chip: "Food safety",
    accent: "#15803D",
    tint: "#E3F4E9",
    tone: "#15803D",
    duration: "3 days",
    level: "Implementer",
    delivery: "In-person",
    fee: "SZL 2,400",
    nextSession: "14 October 2026",
    nextPlace: "Mbabane",
    seats: "4 seats left",
    badge: "Certificate included",
    cta: "Enrol",
    secondaryLabel: "Outline",
  },
  {
    id: "iso9001-internal-auditor",
    code: "TRN-QM-201",
    title: "ISO 9001:2015 Internal auditor",
    summary:
      "Plan, conduct, report and follow up internal audits against ISO 9001:2015. Includes audit programme design, evidence gathering, writing findings, and closing out non-conformities, aligned to ISO 19011:2018.",
    chip: "Quality management",
    accent: "#313391",
    tint: "#ECEEFC",
    tone: "#313391",
    duration: "3 days",
    level: "Internal auditor",
    delivery: "Online, live",
    fee: "SZL 3,200",
    nextSession: "21 October 2026",
    nextPlace: "Online, live",
    seats: "11 seats left",
    badge: "Certificate included",
    cta: "Enrol",
    secondaryLabel: "Outline",
  },
  {
    id: "food-labelling",
    code: "TRN-FS-110",
    title: "Food labelling workshop (SZNS 001)",
    summary:
      "Apply the SZNS 001 labelling rules to pre-packaged foods sold in Eswatini. Covers mandatory information, allergen declarations, nutrition panels, date marking, and the language requirements for imported products.",
    chip: "Food safety",
    accent: "#B8860B",
    tint: "#FEF6DC",
    tone: "#B8860B",
    duration: "1 day",
    level: "Awareness",
    delivery: "Online, live",
    fee: "SZL 850",
    nextSession: "8 October 2026",
    nextPlace: "Online, live",
    seats: "Waitlist",
    badge: "Waitlist only",
    badgeKind: "limited",
    cta: "Join waitlist",
    ctaClass: "gold",
    secondaryLabel: "Outline",
    waitlist: true,
  },
  {
    id: "iso45001-lead-auditor",
    code: "TRN-OH-401",
    title: "ISO 45001:2018 Lead auditor",
    summary:
      "The full lead-auditor pathway for occupational health and safety. Audit planning, team leadership, opening and closing meetings, evidence gathering and reporting, with a written examination on the final day.",
    chip: "Environment & OHS",
    accent: "#7C3AED",
    tint: "#F0E9FB",
    tone: "#7C3AED",
    duration: "5 days",
    level: "Lead auditor",
    delivery: "In-person",
    fee: "SZL 6,500",
    nextSession: "4 November 2026",
    nextPlace: "Mbabane",
    seats: "6 seats left",
    badge: "Certificate + exam",
    cta: "Enrol",
    secondaryLabel: "Outline",
  },
  {
    id: "iso22000-implementation",
    code: "TRN-FS-301",
    title: "ISO 22000:2018 Understanding & implementation",
    summary:
      "For food businesses preparing for ISO 22000 certification. Covers the standard's structure, prerequisite programmes, operational PRPs, HACCP integration, and the documentation you'll need at Stage 1.",
    chip: "Food safety",
    accent: "#15803D",
    tint: "#E3F4E9",
    tone: "#15803D",
    duration: "4 days",
    level: "Implementer",
    delivery: "In-person",
    fee: "SZL 4,800",
    nextSession: "18 November 2026",
    nextPlace: "Manzini",
    seats: "14 seats left",
    badge: "Certificate included",
    cta: "Enrol",
    secondaryLabel: "Outline",
  },
  {
    id: "hazardous-waste",
    code: "TRN-EN-220",
    title: "Hazardous waste management",
    summary:
      "Classification, storage, transport and disposal of hazardous waste under the Eswatini Waste Regulations. Includes manifest documentation, emergency response, and the audit trail inspectors will ask for.",
    chip: "Environment",
    accent: "#0E7C7B",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
    duration: "2 days",
    level: "Implementer",
    delivery: "In-person",
    fee: "SZL 3,800",
    nextSession: "25 October 2026",
    nextPlace: "Mbabane",
    seats: "8 seats left",
    badge: "Certificate included",
    cta: "Enrol",
    secondaryLabel: "Outline",
  },
  {
    id: "basic-food-safety",
    code: "TRN-FS-050",
    title: "Basic food safety for food handlers",
    summary:
      "The entry course for anyone preparing, packaging or selling food, from street vendors to small-scale processors. Personal hygiene, safe storage, cross-contamination, temperature control and cleaning. Funded for Ingelo participants.",
    chip: "MSME · Ingelo",
    accent: "#16A34A",
    tint: "#DCFCE7",
    tone: "#166534",
    duration: "Half day",
    level: "Awareness",
    delivery: "In-person",
    fee: "Funded",
    nextSession: "11 October 2026",
    nextPlace: "Manzini",
    seats: "Funded",
    badge: "Funded by Ingelo",
    badgeKind: "subsidised",
    cta: "Check eligibility",
    ctaClass: "gold",
    secondaryLabel: "Outline",
  },
];

export const UPCOMING: UpcomingSession[] = [
  {
    date: "8 OCT 2026",
    title: "Food labelling workshop (SZNS 001)",
    place: "Online, live",
    placeIcon: "i-monitor",
    price: "SZL 850",
    seats: "0 seats",
    action: "Waitlist only",
    to: "/training/food-labelling",
  },
  {
    date: "11 OCT 2026",
    title: "Basic food safety for food handlers",
    place: "Manzini",
    placeIcon: "i-pin",
    price: "Funded",
    seats: "12 seats left",
    action: "Register",
    to: "/training/basic-food-safety",
  },
  {
    date: "14 OCT 2026",
    title: "HACCP: Awareness and implementation",
    place: "Mbabane",
    placeIcon: "i-pin",
    price: "SZL 2,400",
    seats: "4 seats left",
    action: "Enrol",
    to: "/training/haccp-implementation",
  },
  {
    date: "21 OCT 2026",
    title: "ISO 9001:2015 Internal auditor",
    place: "Online, live",
    placeIcon: "i-monitor",
    price: "SZL 3,200",
    seats: "11 seats left",
    action: "Enrol",
    to: "/training/iso9001-internal-auditor",
  },
];

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: "food-safety-lead",
    title: "Food safety lead",
    body: "From basic food handling through HACCP to ISO 22000 internal auditor. For food business owners, production managers and quality leads.",
    steps: ["Basic food safety", "HACCP", "ISO 22000", "Internal auditor"],
    meta: "4 courses · ~9 days",
    tint: "#E3F4E9",
    tone: "#15803D",
    icon: "i-clipboard",
  },
  {
    id: "qms-lead-auditor",
    title: "QMS lead auditor",
    body: "The professional pathway to leading ISO 9001 audits. For consultants, quality managers, and anyone moving into third-party audit work.",
    steps: ["ISO 9001 foundation", "Internal auditor", "Lead auditor"],
    meta: "3 courses · ~12 days",
    tint: "#ECEEFC",
    tone: "#313391",
    icon: "i-badge",
  },
  {
    id: "export-ready",
    title: "Export readiness",
    body: "For first-time exporters: the labelling, packaging, traceability and documentation skills your EU or SACU importer will require.",
    steps: ["Food labelling", "HACCP", "Traceability", "Export documentation"],
    meta: "4 courses · ~8 days",
    tint: "#FEF6DC",
    tone: "#B8860B",
    icon: "i-globe",
  },
  {
    id: "ohs-specialist",
    title: "OHS specialist",
    body: "ISO 45001 implementation and auditing for safety officers, HR leads, and industrial operations managers in mining and construction.",
    steps: ["ISO 45001 foundation", "Internal auditor", "Lead auditor"],
    meta: "3 courses · ~11 days",
    tint: "#F0E9FB",
    tone: "#7C3AED",
    icon: "i-shield",
  },
  {
    id: "msme-starter",
    title: "MSME starter path",
    body: "For small businesses new to standards. Funded through the Ingelo scheme, covering hygiene, labelling and quality basics.",
    steps: ["Basic food safety", "Labelling basics", "Ingelo assessment prep"],
    meta: "3 courses · Funded",
    tint: "#DCFCE7",
    tone: "#166534",
    icon: "i-users",
  },
  {
    id: "custom",
    title: "In-house programme",
    body: "Not on the calendar? We deliver any of our courses on-site for your team: minimum five participants, content tailored to your sector.",
    steps: ["Custom scope", "On-site", "From 5 staff"],
    meta: "Enquiry",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
    icon: "i-star",
  },
];

function enrich(item: Course): Course {
  const hit = FALLBACK.find((f) => f.id === item.id);
  return hit ? { ...hit, ...item } : item;
}

export async function listCourses(q?: string, track?: string): Promise<Course[]> {
  let items: Course[] = [];
  try {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (track) qs.set("track", track);
    const path = `/training/courses${qs.toString() ? `?${qs}` : ""}`;
    const res = await apiFetch<{ items: Course[] }>(path);
    items = (res.items ?? []).map(enrich);
  } catch {
    /* TODO: wire real LMS catalogue */
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const f of FALLBACK) {
    if (!byId.has(f.id)) byId.set(f.id, f);
  }
  items = [...byId.values()];
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(ql) ||
        (i.code || "").toLowerCase().includes(ql) ||
        i.summary.toLowerCase().includes(ql) ||
        (i.chip || "").toLowerCase().includes(ql),
    );
  }
  return items;
}

export async function getCourse(id: string): Promise<Course | null> {
  const items = await listCourses();
  return items.find((c) => c.id === id) ?? null;
}

export async function enrolCourse(id: string): Promise<{ ok: boolean }> {
  try {
    await apiFetch(`/training/courses/${id}/enrol`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    return { ok: true };
  } catch {
    return { ok: true }; // TODO: wire real
  }
}

/**
 * Account workspace — enrolment card, display-ready.
 * No `/account/training` contract yet: this is the shape the Training
 * tab renders (and the smoke test mocks). TODO: wire real.
 */
export type Enrolment = {
  id: string;
  /** Course slug, e.g. "haccp-implementation". */
  course?: string;
  /** Status chip: "In progress" | "Completed" | "Available" | "Team enrolment". */
  chip: string;
  tint?: string;
  tone?: string;
  accent?: string;
  code?: string;
  title: string;
  desc: string;
  /** 0–100; bar shown when > 0. */
  progress?: number;
  progressLabel?: string;
  meta: string[];
};

export async function listEnrolments(entity = "personal"): Promise<Enrolment[]> {
  try {
    const res = await apiFetch<{ items: Enrolment[] }>(
      `/account/training?entity=${encodeURIComponent(entity)}`,
    );
    return res.items || [];
  } catch {
    return [];
  }
}
