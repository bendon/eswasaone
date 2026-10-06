import { apiFetch } from "@eswasaone/shared-ui";
import {
  addWorkingDays,
  CHARTER,
  REQUIRED_DOCS,
  stageFromStatus,
  type CertFlow,
} from "../certification/flows";
import {
  demoMode,
  newRef,
  NotConnectedError,
  readStore,
  updateStore,
  writeStore,
} from "../certification/demoStore";

export { NotConnectedError } from "../certification/demoStore";

export type CertificationApplication = {
  id: string;
  scheme: string;
  applicant: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Certification schemes as published on eswasa.co.sz (Certification.php,
 * managementsystems.php, product.php, ingelo.php). Only facts stated there:
 * no fees, durations or validity periods the site does not publish.
 */
export type Scheme = {
  id: string;
  flow: CertFlow;
  code: string;
  title: string;
  body: string;
  /** Facts shown on the card; each is stated on the ESWASA website. */
  facts: { label: string; value: string }[];
  chip: string;
  accent: string;
  tint: string;
  tone: string;
  /** False for request types that are not a published scheme (e.g. combined). */
  listed: boolean;
  cta: string;
  ctaClass?: "primary" | "gold";
  secondaryLabel: string;
  /** Page on eswasa.co.sz the content comes from. */
  source: string;
};

const MS_FACTS = [
  { label: "Audits", value: "Stage 1 and Stage 2" },
  { label: "After certification", value: "2 surveillance audits, then recertification" },
  { label: "Fee", value: "By quotation" },
];

const MS_STYLE = { chip: "Management system", cta: "Start application", secondaryLabel: "Process", listed: true };
const MS_SOURCE = "https://www.eswasa.co.sz/managementsystems.php";

export const SCHEMES: Scheme[] = [
  {
    id: "iso9001",
    flow: "ms",
    code: "SZNS ISO 9001:2015",
    title: "Quality Management Systems: Requirements",
    body: "Certification of your quality management system against SZNS ISO 9001:2015. ESWASA's management systems certification for ISO 9001 is accredited by SADCAS.",
    facts: [...MS_FACTS.slice(0, 2), { label: "Accreditation", value: "SADCAS (ISO/IEC 17021-1)" }, MS_FACTS[2]],
    ...MS_STYLE,
    accent: "#313391",
    tint: "#ECEEFC",
    tone: "#313391",
    source: MS_SOURCE,
  },
  {
    id: "iso14001",
    flow: "ms",
    code: "SZNS ISO 14001:2015",
    title: "Environmental Management Systems: Requirements with guidance for use",
    body: "Certification of your environmental management system against SZNS ISO 14001:2015.",
    facts: MS_FACTS,
    ...MS_STYLE,
    accent: "#0E7C7B",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
    source: MS_SOURCE,
  },
  {
    id: "iso22000",
    flow: "ms",
    code: "SZNS ISO 22000:2018",
    title: "Food Safety Management Systems: Requirements for any organization in the food chain",
    body: "Certification of your food safety management system against SZNS ISO 22000:2018.",
    facts: MS_FACTS,
    ...MS_STYLE,
    accent: "#15803D",
    tint: "#E3F4E9",
    tone: "#15803D",
    source: MS_SOURCE,
  },
  {
    id: "iso45001",
    flow: "ms",
    code: "SZNS ISO 45001:2018",
    title: "Occupational Health and Safety Management Systems: Requirements with guidance for use",
    body: "Certification of your occupational health and safety management system against SZNS ISO 45001:2018.",
    facts: MS_FACTS,
    ...MS_STYLE,
    accent: "#7C3AED",
    tint: "#F0E9FB",
    tone: "#7C3AED",
    source: MS_SOURCE,
  },
  {
    id: "haccp",
    flow: "ms",
    code: "SZNS SANS 10330:2020",
    title: "Hazard Analysis and Critical Control Point (HACCP)",
    body: "Certification of your HACCP system against SZNS SANS 10330:2020.",
    facts: MS_FACTS,
    ...MS_STYLE,
    accent: "#15803D",
    tint: "#E3F4E9",
    tone: "#15803D",
    source: MS_SOURCE,
  },
  {
    id: "product",
    flow: "product",
    code: "Product Certification Mark",
    title: "Product certification",
    body: "A voluntary scheme for products manufactured to national or international standards, with independent testing at an accredited laboratory. Certified examples include concrete roof tiles (SZNS SANS 542:2020) and chilli sauce (SZNS CODEXSTAN 306:2015).",
    facts: [
      { label: "Process", value: "Factory assessment, sampling & testing, CAC decision" },
      { label: "Validity", value: "3 years, with post-permit surveillance" },
      { label: "Fee", value: "By quotation" },
    ],
    chip: "Product",
    accent: "#B8860B",
    tint: "#FEF6DC",
    tone: "#B8860B",
    listed: true,
    cta: "Start application",
    secondaryLabel: "Process",
    source: "https://www.eswasa.co.sz/product.php",
  },
  {
    id: "ingelo",
    flow: "ingelo",
    code: "Ingelo Certification Scheme",
    title: "Ingelo: certification for local MSME producers",
    body: "A Ministry of Commerce, Industry and Trade initiative supporting local producers through system and product certification, so they can meet market quality and safety requirements. ESWASA offers free pre-application consultations and gap-analysis workshops.",
    facts: [
      { label: "For", value: "Emaswati-owned local MSMEs" },
      { label: "Support", value: "Free consultation & gap analysis" },
      { label: "Outcome", value: "ESWASA Approved mark" },
    ],
    chip: "MSME · Ingelo",
    accent: "#16A34A",
    tint: "#DCFCE7",
    tone: "#166534",
    listed: true,
    cta: "Check eligibility",
    ctaClass: "gold",
    secondaryLabel: "Eligibility",
    source: "https://www.eswasa.co.sz/ingelo.php",
  },
  {
    // Not a published scheme: the RFQ form offers "Combined (e.g., ISO + Product)"
    // as a request type. The applicant chooses which standards and products.
    id: "combined",
    flow: "combined",
    code: "Combined request",
    title: "Combined request (e.g., ISO + Product)",
    body: "One request covering more than one type of certification. You choose the management-system standard(s) and the product(s); ESWASA confirms how it will be assessed.",
    facts: [{ label: "Fee", value: "By quotation" }],
    chip: "Combined",
    accent: "#0E7C7B",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
    listed: false,
    cta: "Start application",
    secondaryLabel: "Process",
    source: "https://www.eswasa.co.sz/qoute_certification.php",
  },
];

/** Schemes shown in the catalogue (published by ESWASA). */
export const LISTED_SCHEMES = SCHEMES.filter((s) => s.listed);

export function schemeById(id: string): Scheme | undefined {
  return SCHEMES.find((s) => s.id === id);
}

/** Infer the flow from a scheme id or display name returned by Core. */
export function flowForScheme(scheme: string): CertFlow {
  const known = schemeById(scheme);
  if (known) return known.flow;
  const s = scheme.toLowerCase();
  if (s.includes("ingelo")) return "ingelo";
  if (s.includes("combined") || s.includes("+")) return "combined";
  if (s.includes("product") || s.includes("mark") || s.includes("permit")) return "product";
  return "ms";
}

/** Best scheme match for a quote, so "Accept & apply" opens the right wizard. */
export function schemeForQuote(q: Pick<Quote, "flow" | "standards">): string {
  if (q.flow === "combined" || q.flow === "ingelo" || q.flow === "product") return q.flow;
  const hit = SCHEMES.find((s) => s.flow === "ms" && q.standards.includes(s.code.split(":")[0]));
  return hit?.id ?? "iso9001";
}

export function schemeTitle(scheme: string): string {
  return schemeById(scheme)?.title ?? scheme;
}

/* ===================== Application payload (wizard) ===================== */

export type Person = { name: string; position: string; email: string; phone: string };

export type Site = { name: string; address: string; employees: string; shifts: string };

export type ProductLine = { name: string; brand: string; model: string; standard: string };

export type UploadedFile = { key: string; name: string; size: number };

export type ApplicationPayload = {
  scheme: string;
  flow: CertFlow;
  org: {
    name: string;
    registration_no: string;
    trading_licence: string;
    year_registered: string;
    address: string;
    town: string;
    region: string;
    inkhundla: string;
    employees: string;
  };
  contact: Person;
  alt_contact: Person;
  scope: string;
  sites: Site[];
  standards: string[];
  existing_certs: string;
  consultant: string;
  quote_ref: string;
  /** Flow-specific answers (MS, product, Ingelo CER_FO_002_IPC sections). */
  details: Record<string, string | boolean | string[] | ProductLine[]>;
  documents: UploadedFile[];
  declarations: {
    accurate: boolean;
    mark_rules: boolean;
    impartiality: boolean;
    terms: boolean;
    notify_changes: boolean;
  };
  signature: { name: string; date: string };
  consultation?: { date: string; mode: string; topic: string };
};

/* ===================== Application detail (tracker) ===================== */

export type QuoteStatus = "requested" | "issued" | "accepted" | "declined" | "expired";

export type QuoteLine = { label: string; amount: number };

export type Quote = {
  id: string;
  status: QuoteStatus;
  flow: CertFlow;
  org: string;
  contact_email: string;
  standards: string;
  scope: string;
  requested_at: string;
  due_by: string;
  issued_at?: string;
  valid_until?: string;
  lines?: QuoteLine[];
  total?: number;
  application_id?: string;
};

export type AppDocument = {
  key: string;
  label: string;
  required: boolean;
  status: "missing" | "uploaded" | "requested" | "accepted";
  file?: string;
  uploaded_at?: string;
};

export type AppAudit = {
  id: string;
  type: string;
  date?: string;
  auditor?: string;
  status: "planned" | "confirmed" | "reschedule_requested" | "done";
  note?: string;
};

export type Finding = {
  id: string;
  clause: string;
  severity: "major" | "minor" | "observation";
  statement: string;
  due: string;
  status: "open" | "submitted" | "accepted" | "rejected";
  response?: { root_cause: string; correction: string; corrective_action: string; evidence: string[] };
};

export type LabResult = {
  sample: string;
  field: string;
  status: "pending" | "in_test" | "pass" | "fail";
  drawn_at?: string;
  report?: string;
};

export type Decision = {
  outcome: "pending" | "granted" | "refused";
  body: string;
  date?: string;
  note?: string;
};

export type CertRecord = {
  id: string;
  number: string;
  issued: string;
  expires: string;
  status: "valid" | "suspended" | "withdrawn" | "reduced";
  scope: string;
};

export type Activity = { at: string; who: "you" | "eswasa"; text: string };

export type ApplicationRequest = {
  kind: "changes" | "scope" | "appeal" | "withdraw" | "complaint";
  text: string;
  at: string;
  status: "received" | "in_review" | "closed";
};

export type ApplicationDetail = CertificationApplication & {
  flow: CertFlow;
  stage: string;
  org: string;
  payload?: ApplicationPayload;
  quote?: Quote;
  documents: AppDocument[];
  audits: AppAudit[];
  findings: Finding[];
  lab: LabResult[];
  decision?: Decision;
  certificate?: CertRecord;
  surveillance: { label: string; due: string; status: "planned" | "done" }[];
  consultation?: { date: string; mode: string; status: "booked" | "held" };
  requests: ApplicationRequest[];
  activity: Activity[];
  /** True while the record is local-only (Core has no detail endpoint yet). */
  local?: boolean;
};

/* ===================== Demo fixtures (fallback only) ===================== */

function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function docsFor(flow: CertFlow, uploaded: string[] = []): AppDocument[] {
  return REQUIRED_DOCS[flow].map((d) => ({
    key: d.key,
    label: d.label,
    required: d.required,
    status: uploaded.includes(d.key) ? "accepted" : d.required ? "requested" : "missing",
    file: uploaded.includes(d.key) ? `${d.key}.pdf` : undefined,
  }));
}

function seedDetails(): Record<string, ApplicationDetail> {
  const base = {
    requests: [] as ApplicationRequest[],
    surveillance: [] as ApplicationDetail["surveillance"],
    lab: [] as LabResult[],
    findings: [] as Finding[],
    audits: [] as AppAudit[],
  };
  const ms: ApplicationDetail = {
    ...base,
    id: "CERT-0051",
    scheme: "iso9001",
    flow: "ms",
    stage: "stage2",
    status: "NC Resolution",
    applicant: "Thandi Dlamini",
    org: "Swazi Fresh Produce Ltd",
    created_at: iso(-48),
    quote: {
      id: "QTE-00318",
      status: "accepted",
      flow: "ms",
      org: "Swazi Fresh Produce Ltd",
      contact_email: "quality@swazifresh.co.sz",
      standards: "ISO 9001:2015",
      scope: "Packing and distribution of fresh vegetables",
      requested_at: iso(-60),
      due_by: iso(-53),
      issued_at: iso(-55),
      valid_until: iso(5),
      lines: [
        { label: "Application fee", amount: 2500 },
        { label: "Stage 1 audit (1 auditor-day)", amount: 6500 },
        { label: "Stage 2 audit (3 auditor-days)", amount: 19500 },
        { label: "Certification fee", amount: 4000 },
      ],
      total: 32500,
      application_id: "CERT-0051",
    },
    documents: docsFor("ms", ["registration", "orgchart", "manual", "procedures", "internal_audit", "mgmt_review"]),
    audits: [
      { id: "AUD-1101", type: "Stage 1 audit", date: iso(-20), auditor: "S. Mamba", status: "done" },
      { id: "AUD-1102", type: "Stage 2 audit", date: iso(-6), auditor: "S. Mamba", status: "done" },
    ],
    findings: [
      {
        id: "NC-1",
        clause: "ISO 9001 §7.1.5",
        severity: "minor",
        statement: "Two weighing scales in the packhouse had no calibration records for the last 12 months.",
        due: iso(24),
        status: "open",
      },
      {
        id: "NC-2",
        clause: "ISO 9001 §9.2",
        severity: "major",
        statement: "The internal audit programme did not cover the dispatch process within the audit cycle.",
        due: iso(24),
        status: "open",
      },
    ],
    activity: [
      { at: iso(-60), who: "you", text: "Requested a quote for ISO 9001:2015" },
      { at: iso(-55), who: "eswasa", text: "Quote QTE-00318 issued" },
      { at: iso(-48), who: "you", text: "Accepted the quote and submitted the application" },
      { at: iso(-45), who: "eswasa", text: "Application receipt confirmed" },
      { at: iso(-20), who: "eswasa", text: "Stage 1 audit completed" },
      { at: iso(-6), who: "eswasa", text: "Stage 2 audit completed: 2 non-conformities raised" },
    ],
  };
  const product: ApplicationDetail = {
    ...base,
    id: "CERT-0042",
    scheme: "product",
    flow: "product",
    stage: "testing",
    status: "Audit In Progress",
    applicant: "Sipho Nkambule",
    org: "Ubombo Honey Co. (Pty) Ltd",
    created_at: iso(-30),
    documents: docsFor("product", ["registration", "spec", "process_flow", "qc_plan"]),
    audits: [
      { id: "AUD-1120", type: "Initial factory assessment", date: iso(-9), auditor: "N. Shongwe", status: "done" },
    ],
    lab: [
      { sample: "Raw honey, batch UH-2609", field: "Chemistry", status: "in_test", drawn_at: iso(-9) },
      { sample: "Raw honey, batch UH-2609", field: "Microbiology", status: "pass", drawn_at: iso(-9), report: "LAB-MB-7712" },
    ],
    decision: { outcome: "pending", body: "Certification Approval Committee" },
    activity: [
      { at: iso(-30), who: "you", text: "Applied for the SZNS Product Mark" },
      { at: iso(-27), who: "eswasa", text: "Application receipt confirmed; assessment planned" },
      { at: iso(-9), who: "eswasa", text: "Factory assessment done; samples drawn for testing" },
      { at: iso(-3), who: "eswasa", text: "Microbiology results: pass" },
    ],
  };
  const ingelo: ApplicationDetail = {
    ...base,
    id: "ING-0007",
    scheme: "ingelo",
    flow: "ingelo",
    stage: "consultation",
    status: "Submitted",
    applicant: "Lindiwe Hlophe",
    org: "Lilanga Natural Skincare",
    created_at: iso(-5),
    documents: docsFor("ingelo", ["national_id", "photo"]),
    consultation: { date: iso(6), mode: "In person (Matsapha)", status: "booked" },
    activity: [
      { at: iso(-5), who: "you", text: "Passed the Ingelo eligibility check" },
      { at: iso(-5), who: "you", text: "Booked a free pre-application consultation" },
    ],
  };
  const certified: ApplicationDetail = {
    ...base,
    id: "CERT-0019",
    scheme: "iso22000",
    flow: "ms",
    stage: "surveillance",
    status: "Surveillance",
    applicant: "Thandi Dlamini",
    org: "Swazi Fresh Produce Ltd",
    created_at: iso(-420),
    documents: docsFor("ms", REQUIRED_DOCS.ms.map((d) => d.key)),
    audits: [
      { id: "AUD-0901", type: "Stage 1 audit", date: iso(-390), auditor: "P. Simelane", status: "done" },
      { id: "AUD-0902", type: "Stage 2 audit", date: iso(-370), auditor: "P. Simelane", status: "done" },
      { id: "AUD-1180", type: "Surveillance audit 1", date: iso(21), auditor: "P. Simelane", status: "planned" },
    ],
    decision: { outcome: "granted", body: "Certification reviewer", date: iso(-350) },
    certificate: {
      id: "CRT-0311",
      number: "ESWASA-ISO22000-2025-00311",
      issued: iso(-350),
      expires: iso(745),
      status: "valid",
      scope: "Processing and packing of fresh-cut vegetables",
    },
    surveillance: [
      { label: "Surveillance audit 1", due: iso(21), status: "planned" },
      { label: "Surveillance audit 2", due: iso(380), status: "planned" },
      { label: "Recertification audit", due: iso(700), status: "planned" },
    ],
    activity: [
      { at: iso(-350), who: "eswasa", text: "Certificate ESWASA-ISO22000-2025-00311 issued" },
      { at: iso(-14), who: "eswasa", text: "Surveillance audit 1 planned" },
    ],
  };
  return { [ms.id]: ms, [product.id]: product, [ingelo.id]: ingelo, [certified.id]: certified };
}

function seedQuotes(): Record<string, Quote> {
  return {
    "QTE-00342": {
      id: "QTE-00342",
      status: "issued",
      flow: "combined",
      org: "Ubombo Honey Co. (Pty) Ltd",
      contact_email: "sipho@ubombohoney.co.sz",
      standards: "ISO 22000:2018 + SZNS Product Mark",
      scope: "Processing and bottling of honey",
      requested_at: iso(-8),
      due_by: iso(-1),
      issued_at: iso(-3),
      valid_until: iso(27),
      lines: [
        { label: "Application fee", amount: 2500 },
        { label: "Stage 1 + 2 audit (4 auditor-days)", amount: 26000 },
        { label: "Sampling & laboratory testing", amount: 7800 },
        { label: "Certification & permit fee", amount: 6000 },
      ],
      total: 42300,
    },
  };
}

function store() {
  const s = readStore();
  if (!s.seeded) {
    // Sample cases are fictional: only ever shown with VITE_DEMO_MODE=true.
    if (demoMode()) {
      s.details = seedDetails();
      s.quotes = seedQuotes();
    }
    s.seeded = true;
    writeStore(s);
  }
  return s;
}

function saveDetail(d: ApplicationDetail): ApplicationDetail {
  updateStore((s) => {
    s.details[d.id] = d;
  });
  return d;
}

function localDetail(id: string): ApplicationDetail | undefined {
  return store().details[id] as ApplicationDetail | undefined;
}

function blankDetail(app: CertificationApplication): ApplicationDetail {
  const flow = flowForScheme(app.scheme);
  return {
    ...app,
    flow,
    stage: stageFromStatus(flow, app.status),
    org: app.applicant,
    documents: docsFor(flow),
    audits: [],
    findings: [],
    lab: [],
    surveillance: [],
    requests: [],
    activity: app.created_at
      ? [{ at: app.created_at, who: "you", text: "Application submitted" }]
      : [],
  };
}

/* ===================== Applications ===================== */

export async function listApplications(status?: string): Promise<ApplicationDetail[]> {
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await apiFetch<{ items: CertificationApplication[] }>(
      `/certification/applications${qs}`,
    );
    // TODO: wire real (GET /account/applications) to scope the list to the signed-in applicant.
    return (res.items ?? []).map((a) => ({ ...blankDetail(a), ...stripLive(localDetail(a.id)), ...a }));
  } catch (err) {
    if (!demoMode()) throw err;
    return Object.values(store().details as Record<string, ApplicationDetail>).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );
  }
}

/** Keep locally-held detail (documents, NCs…) but let live fields win. */
function stripLive(d?: ApplicationDetail): Partial<ApplicationDetail> {
  if (!d) return {};
  const { id: _id, scheme: _s, applicant: _a, status: _st, ...rest } = d;
  return rest;
}

export async function getApplication(id: string): Promise<CertificationApplication> {
  return apiFetch<CertificationApplication>(`/certification/applications/${encodeURIComponent(id)}`);
}

export async function getApplicationDetail(id: string): Promise<ApplicationDetail | null> {
  let live: CertificationApplication | null = null;
  try {
    live = await getApplication(id);
  } catch (err) {
    if (!demoMode()) throw err;
    live = null;
  }
  // TODO: wire real (GET /certification/applications/{id}/timeline).
  const local = localDetail(id);
  if (live) {
    const merged: ApplicationDetail = { ...blankDetail(live), ...stripLive(local), ...live };
    const flow = merged.flow;
    if (!local) merged.stage = stageFromStatus(flow, live.status);
    return merged;
  }
  return local ?? null;
}

export async function createApplication(payload: ApplicationPayload): Promise<ApplicationDetail> {
  const now = new Date().toISOString();
  const body = {
    scheme: payload.scheme,
    applicant_name: payload.contact.name || payload.org.name,
    contact_email: payload.contact.email || undefined,
    confirm: true,
    // Accepted by Frappe create_application; Core drops them until the contract grows.
    applicant_org: payload.org.name,
    contact_phone: payload.contact.phone,
    site_address: payload.org.address,
    details: payload,
  };
  let created: CertificationApplication;
  let local = false;
  try {
    created = await apiFetch<CertificationApplication>("/certification/applications", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (!demoMode()) throw err;
    local = true;
    created = {
      id: newRef(payload.flow === "ingelo" ? "ING" : "CERT"),
      scheme: payload.scheme,
      applicant: body.applicant_name,
      status: "Submitted",
      created_at: now,
    };
  }
  const flow = payload.flow;
  const uploaded = payload.documents.map((d) => d.key);
  const quote = payload.quote_ref
    ? (store().quotes[payload.quote_ref] as Quote | undefined)
    : undefined;
  const detail: ApplicationDetail = {
    ...blankDetail({ ...created, created_at: created.created_at ?? now }),
    flow,
    stage: flow === "ingelo" && payload.consultation ? "consultation" : "application",
    org: payload.org.name,
    payload,
    quote: quote ? { ...quote, status: "accepted", application_id: created.id } : undefined,
    documents: REQUIRED_DOCS[flow].map((d) => {
      const f = payload.documents.find((x) => x.key === d.key);
      return {
        key: d.key,
        label: d.label,
        required: d.required,
        // Outside demo mode files are not transmitted (no upload endpoint yet).
        status: local && uploaded.includes(d.key) ? "uploaded" : d.required ? "requested" : "missing",
        file: local ? f?.name : undefined,
        uploaded_at: local && f ? now : undefined,
      };
    }),
    consultation: payload.consultation
      ? { date: payload.consultation.date, mode: payload.consultation.mode, status: "booked" }
      : undefined,
    activity: [
      { at: now, who: "you", text: `Application submitted for ${schemeTitle(payload.scheme)}` },
      ...(payload.consultation
        ? [{ at: now, who: "you" as const, text: "Booked a free pre-application consultation" }]
        : []),
    ],
    local,
  };
  if (quote) {
    updateStore((s) => {
      s.quotes[quote.id] = { ...quote, status: "accepted", application_id: created.id };
    });
  }
  return saveDetail(detail);
}

/* ===================== Quotes (RFQ) ===================== */

export type QuoteRequest = {
  flow: CertFlow;
  org: string;
  registration_no: string;
  contact: string;
  position: string;
  email: string;
  phone: string;
  address: string;
  standards: string;
  scope: string;
  employees: string;
  sites: string;
  based_in_eswatini: "yes" | "no" | "";
  made_in_eswatini: "yes" | "no" | "";
  existing_certs: string;
  timeline: string;
  files: { name: string; size: number }[];
  comments: string;
};

export async function requestQuote(req: QuoteRequest): Promise<Quote> {
  const now = new Date();
  const fallback: Quote = {
    id: newRef("QTE"),
    status: "requested",
    flow: req.flow,
    org: req.org,
    contact_email: req.email,
    standards: req.standards,
    scope: req.scope,
    requested_at: now.toISOString(),
    due_by: addWorkingDays(now, CHARTER.quoteDays).toISOString(),
  };
  try {
    // TODO: wire real (POST /certification/quotes, multipart for files).
    return await apiFetch<Quote>("/certification/quotes", {
      method: "POST",
      body: JSON.stringify({ ...req, confirm: true }),
    });
  } catch {
    if (!demoMode()) throw new NotConnectedError("Quote requests");
    updateStore((s) => {
      s.quotes[fallback.id] = fallback;
    });
    return fallback;
  }
}

export async function listQuotes(): Promise<Quote[]> {
  try {
    const res = await apiFetch<{ items: Quote[] }>("/certification/quotes");
    return res.items ?? [];
  } catch {
    if (!demoMode()) return [];
    return Object.values(store().quotes as Record<string, Quote>).sort((a, b) =>
      b.requested_at.localeCompare(a.requested_at),
    );
  }
}

export async function getQuote(id: string): Promise<Quote | null> {
  try {
    return await apiFetch<Quote>(`/certification/quotes/${encodeURIComponent(id)}`);
  } catch {
    if (!demoMode()) return null;
    return (store().quotes[id] as Quote | undefined) ?? null;
  }
}

export async function respondToQuote(id: string, accept: boolean): Promise<Quote | null> {
  const action = accept ? "accept" : "decline";
  try {
    return await apiFetch<Quote>(`/certification/quotes/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
  } catch {
    if (!demoMode()) throw new NotConnectedError("Quote responses");
    let out: Quote | null = null;
    updateStore((s) => {
      const q = s.quotes[id] as Quote | undefined;
      if (q) {
        out = { ...q, status: accept ? "accepted" : "declined" };
        s.quotes[id] = out;
      }
    });
    return out;
  }
}

/* ===================== Ingelo ===================== */

export type IngeloEligibility = {
  citizen: boolean | null;
  local_msme: boolean | null;
  made_here: boolean | null;
  willing_to_scale: boolean | null;
};

export function checkIngeloEligibility(a: IngeloEligibility): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (a.citizen === false) reasons.push("Ingelo is for businesses owned by Emaswati.");
  if (a.local_msme === false) reasons.push("Ingelo is for local micro, small and medium enterprises.");
  if (a.made_here === false) reasons.push("The product must be produced in Eswatini.");
  if (a.willing_to_scale === false)
    reasons.push("Applicants must be willing to scale up production to meet export quota requirements.");
  const answered = [a.citizen, a.local_msme, a.made_here, a.willing_to_scale].every((v) => v !== null);
  return { eligible: answered && reasons.length === 0, reasons };
}

/* ===================== Applicant actions on a case ===================== */

function mutate(id: string, fn: (d: ApplicationDetail) => void): ApplicationDetail | null {
  const d = localDetail(id);
  if (!d) return null;
  const next: ApplicationDetail = JSON.parse(JSON.stringify(d));
  fn(next);
  return saveDetail(next);
}

async function ensureLocal(id: string): Promise<void> {
  if (localDetail(id)) return;
  const d = await getApplicationDetail(id);
  if (d) saveDetail(d);
}

export async function uploadApplicationDocument(
  id: string,
  key: string,
  file: File,
): Promise<ApplicationDetail | null> {
  try {
    // TODO: wire real (POST /certification/applications/{id}/documents). Needs multipart;
    // apiFetch is JSON-only, so metadata goes up until a file transport exists.
    await apiFetch(`/certification/applications/${encodeURIComponent(id)}/documents`, {
      method: "POST",
      body: JSON.stringify({ key, name: file.name, size: file.size, confirm: true }),
    });
  } catch {
    if (!demoMode()) throw new NotConnectedError("Document uploads");
  }
  await ensureLocal(id);
  const now = new Date().toISOString();
  return mutate(id, (d) => {
    d.documents = d.documents.map((doc) =>
      doc.key === key ? { ...doc, status: "uploaded", file: file.name, uploaded_at: now } : doc,
    );
    d.activity.push({ at: now, who: "you", text: `Uploaded ${file.name}` });
  });
}

export async function submitCorrectiveAction(
  id: string,
  findingId: string,
  response: NonNullable<Finding["response"]>,
): Promise<ApplicationDetail | null> {
  try {
    // TODO: wire real (POST /certification/findings/{id}/corrective-action).
    await apiFetch(`/certification/findings/${encodeURIComponent(findingId)}/corrective-action`, {
      method: "POST",
      body: JSON.stringify({ ...response, application_id: id, confirm: true }),
    });
  } catch {
    if (!demoMode()) throw new NotConnectedError("Corrective actions");
  }
  await ensureLocal(id);
  const now = new Date().toISOString();
  return mutate(id, (d) => {
    d.findings = d.findings.map((f) =>
      f.id === findingId ? { ...f, status: "submitted", response } : f,
    );
    d.activity.push({ at: now, who: "you", text: `Corrective action submitted for ${findingId}` });
  });
}

export async function respondToAudit(
  id: string,
  auditId: string,
  answer: { confirm: true } | { confirm: false; reason: string; preferred: string },
): Promise<ApplicationDetail | null> {
  try {
    // TODO: wire real (applicant-side audit confirmation; staff use PATCH /certification/audits/{id}).
    await apiFetch(`/certification/applications/${encodeURIComponent(id)}/audits/${encodeURIComponent(auditId)}`, {
      method: "POST",
      body: JSON.stringify({ ...answer, confirm_commit: true }),
    });
  } catch {
    if (!demoMode()) throw new NotConnectedError("Audit date responses");
  }
  await ensureLocal(id);
  const now = new Date().toISOString();
  return mutate(id, (d) => {
    d.audits = d.audits.map((a) =>
      a.id === auditId
        ? {
            ...a,
            status: answer.confirm ? "confirmed" : "reschedule_requested",
            note: answer.confirm ? undefined : `${answer.reason} (preferred ${answer.preferred})`,
          }
        : a,
    );
    d.activity.push({
      at: now,
      who: "you",
      text: answer.confirm ? `Confirmed audit ${auditId}` : `Asked to reschedule audit ${auditId}`,
    });
  });
}

const REQUEST_PATH: Record<ApplicationRequest["kind"], string> = {
  changes: "changes",
  scope: "scope-extension",
  appeal: "appeal",
  withdraw: "withdraw",
  complaint: "complaint",
};

const REQUEST_TEXT: Record<ApplicationRequest["kind"], string> = {
  changes: "Notified ESWASA of changes (CER_FO_028)",
  scope: "Requested a scope extension (CER_PR_012)",
  appeal: "Lodged an appeal (CER_PR_002)",
  withdraw: "Withdrew the application",
  complaint: "Raised a complaint (CER_PR_006)",
};

export async function sendApplicationRequest(
  id: string,
  kind: ApplicationRequest["kind"],
  text: string,
): Promise<ApplicationDetail | null> {
  try {
    // TODO: wire real (POST /certification/applications/{id}/{changes|scope-extension|appeal|withdraw}).
    await apiFetch(`/certification/applications/${encodeURIComponent(id)}/${REQUEST_PATH[kind]}`, {
      method: "POST",
      body: JSON.stringify({ text, confirm: true }),
    });
  } catch {
    if (!demoMode()) throw new NotConnectedError("This request");
  }
  await ensureLocal(id);
  const now = new Date().toISOString();
  return mutate(id, (d) => {
    d.requests.push({ kind, text, at: now, status: "received" });
    d.activity.push({ at: now, who: "you", text: REQUEST_TEXT[kind] });
    if (kind === "withdraw") {
      d.status = "Withdrawn";
      d.stage = "withdrawn";
    }
  });
}

export async function bookConsultation(
  id: string,
  slot: { date: string; mode: string; topic: string },
): Promise<ApplicationDetail | null> {
  try {
    // TODO: wire real (POST /certification/ingelo/consultations).
    await apiFetch("/certification/ingelo/consultations", {
      method: "POST",
      body: JSON.stringify({ ...slot, application_id: id, confirm: true }),
    });
  } catch {
    if (!demoMode()) throw new NotConnectedError("Consultation bookings");
  }
  await ensureLocal(id);
  const now = new Date().toISOString();
  return mutate(id, (d) => {
    d.consultation = { date: slot.date, mode: slot.mode, status: "booked" };
    d.activity.push({ at: now, who: "you", text: "Booked a free consultation / gap-analysis workshop" });
  });
}

/** Signed certificate download. Core: GET /certification/certificates/{id}/pdf. */
export async function getCertificateDownload(certId: string): Promise<string | null> {
  try {
    const res = await apiFetch<{ download_url?: string | null }>(
      `/certification/certificates/${encodeURIComponent(certId)}/pdf`,
    );
    return res.download_url ?? null;
  } catch {
    return null;
  }
}

/* ===================== Public status register ===================== */

export type RegisterEntry = {
  holder: string;
  certificate: string;
  scope: string;
  since: string;
  reason?: string;
};

export type StatusRegister = {
  suspended: RegisterEntry[];
  withdrawn: RegisterEntry[];
  reduced: RegisterEntry[];
};

export async function getStatusRegister(flow: CertFlow): Promise<StatusRegister> {
  try {
    // TODO: wire real (GET /certification/register?flow=). Public, no auth.
    return await apiFetch<StatusRegister>(`/certification/register?flow=${flow}`);
  } catch (err) {
    // Never claim "nothing suspended" unless the register actually answered.
    if (!demoMode()) throw err;
    return { suspended: [], withdrawn: [], reduced: [] };
  }
}

/** Is there something the applicant must do on this case? */
export function actionsRequired(d: ApplicationDetail): string[] {
  const out: string[] = [];
  if (d.quote?.status === "issued") out.push("Accept or decline your quote");
  const missing = d.documents.filter((x) => x.required && x.status === "requested").length;
  if (missing) out.push(`${missing} document${missing > 1 ? "s" : ""} requested`);
  const open = d.findings.filter((f) => f.status === "open" || f.status === "rejected").length;
  if (open) out.push(`${open} non-conformit${open > 1 ? "ies" : "y"} to answer`);
  const planned = d.audits.filter((a) => a.status === "planned" && a.date && a.date > new Date().toISOString()).length;
  if (planned) out.push("Confirm your audit date");
  return out;
}
/**
 * Account workspace — issued certificate card, display-ready.
 * No `/account/certificates` contract yet: this is the shape the
 * Certificates tab renders (and the smoke test mocks). TODO: wire real.
 */
export type Certificate = {
  id: string;
  /** Scheme chip label, e.g. "Training", "ISO 9001". */
  chip: string;
  tint?: string;
  tone?: string;
  accent?: string;
  /** Certificate number, e.g. "TRN-2024-00841". */
  num: string;
  title: string;
  holder?: string;
  /** Display dates, e.g. "12 Nov 2024". */
  issued: string;
  expires: string;
  expiring?: boolean;
};

export async function listCertificates(entity = "personal"): Promise<Certificate[]> {
  try {
    const res = await apiFetch<{ items: Certificate[] }>(
      `/account/certificates?entity=${encodeURIComponent(entity)}`,
    );
    return res.items || [];
  } catch {
    return [];
  }
}
