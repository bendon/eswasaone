/**
 * Certification flows: the three ESWASA paths (plus "combined") as the live
 * site describes them (eswasa.co.sz: managementsystems.php, product.php,
 * ingelo.php, qoute_certification.php, service-charter.php).
 *
 * Static reference data only. No network here.
 */

export type CertFlow = "ms" | "product" | "ingelo" | "combined";

export type FlowStage = {
  key: string;
  title: string;
  body: string;
  /** Who acts at this stage. */
  who: "you" | "eswasa" | "both";
  /** Service Charter commitment, when one applies. */
  sla?: string;
};

export const FLOW_LABEL: Record<CertFlow, string> = {
  ms: "Management systems",
  product: "Product certification",
  ingelo: "Ingelo (MSME)",
  combined: "Combined (e.g., ISO + Product)",
};

export const FLOW_SHORT: Record<CertFlow, string> = {
  ms: "Management system",
  product: "Product",
  ingelo: "Ingelo",
  combined: "Combined",
};

/** Service Charter (service-charter.php). */
export const CHARTER = {
  quoteDays: 5,
  receiptDays: 5,
  auditScheduleDays: 30,
  enquiryAckDays: 3,
  enquiryAnswerDays: 14,
  complaintAckDays: 3,
  complaintResolveDays: 30,
  appealWindowDays: 90,
} as const;

/**
 * Stages as published on eswasa.co.sz. Wording stays close to the site;
 * nothing is added that the site does not state.
 */
export const FLOW_STAGES: Record<CertFlow, FlowStage[]> = {
  // managementsystems.php: 8-step process.
  ms: [
    {
      key: "enquiry",
      title: "Initial enquiry",
      body: "You contact ESWASA about the standard you want. You can request a quote online.",
      who: "you",
      sla: `Quote within ${CHARTER.quoteDays} working days`,
    },
    {
      key: "application",
      title: "Promotional visit & application",
      body: "ESWASA conducts a preliminary visit and you submit your application.",
      who: "both",
      sla: `Receipt confirmed within ${CHARTER.receiptDays} working days`,
    },
    {
      key: "quote",
      title: "Quote, contract & payment",
      body: "Pricing is provided, and the formal agreement and payment are arranged.",
      who: "both",
    },
    {
      key: "stage1",
      title: "Stage 1 audit",
      body: "Documentation review and site readiness assessment.",
      who: "eswasa",
      sla: `Audit scheduled within ${CHARTER.auditScheduleDays} working days`,
    },
    {
      key: "stage2",
      title: "Stage 2 audit",
      body: "Verification that the management system is implemented effectively.",
      who: "both",
    },
    {
      key: "decision",
      title: "Certification decision",
      body: "ESWASA evaluates the audit findings.",
      who: "eswasa",
    },
    {
      key: "certificate",
      title: "Certificate issued",
      body: "The certificate is granted on approval. Use of the mark follows CER_RU_028.",
      who: "eswasa",
    },
    {
      key: "surveillance",
      title: "Surveillance & recertification",
      body: "Two surveillance audits, followed by a recertification audit.",
      who: "both",
    },
  ],
  // product.php: 6-step process.
  product: [
    {
      key: "application",
      title: "Application, quote, planning & scheduling",
      body: "You apply and receive a quote; ESWASA plans and schedules the assessment.",
      who: "both",
      sla: `Receipt confirmed within ${CHARTER.receiptDays} working days`,
    },
    {
      key: "assessment",
      title: "Initial assessment",
      body: "Process and systems are assessed at your factory or plant.",
      who: "eswasa",
      sla: `Scheduled within ${CHARTER.auditScheduleDays} working days`,
    },
    {
      key: "testing",
      title: "Sampling & testing",
      body: "Product samples are tested at an accredited laboratory.",
      who: "eswasa",
    },
    {
      key: "cac",
      title: "Certification Approval Committee",
      body: "Results are submitted to the Certification Approval Committee (CAC).",
      who: "eswasa",
    },
    {
      key: "permit",
      title: "Permit / certification awarded",
      body: "Permit / certification awarded for 3 years.",
      who: "eswasa",
    },
    {
      key: "surveillance",
      title: "Post-permit surveillance",
      body: "Post-permit inspection, audits, sampling and product testing.",
      who: "both",
    },
  ],
  // ingelo.php: eligibility, free consultation, form CER_FO_002_IPC, ESWASA Approved mark.
  ingelo: [
    {
      key: "eligibility",
      title: "Eligibility check",
      body: "Emaswati, running a local MSME producing goods or services, willing to scale production to meet export quota requirements.",
      who: "you",
    },
    {
      key: "consultation",
      title: "Free consultation & gap analysis",
      body: "ESWASA offers free pre-application consultations and gap-analysis workshops.",
      who: "both",
    },
    {
      key: "application",
      title: "Application (CER_FO_002_IPC)",
      body: "The Ingelo application form. On eswasa.co.sz it is emailed or handed in at Matsapha; here it is completed online.",
      who: "you",
      sla: `Receipt confirmed within ${CHARTER.receiptDays} working days`,
    },
    {
      key: "assessment",
      title: "Certification",
      body: "ESWASA takes your product or system through certification, with technical guidance along the way.",
      who: "both",
    },
    {
      key: "mark",
      title: "ESWASA Approved mark",
      body: "Certified producers may display the ESWASA Approved mark on their products.",
      who: "eswasa",
    },
  ],
  // RFQ request type "Combined (e.g., ISO + Product)": the applicant names the
  // standards and products; each part follows its own published process.
  combined: [
    {
      key: "application",
      title: "Combined request",
      body: "You name the management-system standard(s) and the product(s). ESWASA confirms how each part will be assessed and quotes.",
      who: "both",
      sla: `Receipt confirmed within ${CHARTER.receiptDays} working days`,
    },
    {
      key: "stage1",
      title: "Management-system audits",
      body: "Stage 1 and Stage 2 audits for the standard(s) you chose.",
      who: "eswasa",
      sla: `Audit scheduled within ${CHARTER.auditScheduleDays} working days`,
    },
    {
      key: "stage2",
      title: "Product initial assessment",
      body: "Process and systems assessed at your factory or plant.",
      who: "eswasa",
    },
    {
      key: "testing",
      title: "Sampling & testing",
      body: "Product samples tested at an accredited laboratory.",
      who: "eswasa",
    },
    {
      key: "decision",
      title: "Certification decisions",
      body: "ESWASA evaluates the audit findings; product results go to the Certification Approval Committee.",
      who: "eswasa",
    },
    {
      key: "certificate",
      title: "Certificate and permit",
      body: "Management-system certificate on approval; product permit awarded for 3 years.",
      who: "eswasa",
    },
    {
      key: "surveillance",
      title: "Surveillance",
      body: "Surveillance audits for the system; post-permit surveillance for the product.",
      who: "both",
    },
  ],
};

/** Map the backend workflow state (or its display label) to a stage key per flow. */
export function stageFromStatus(flow: CertFlow, status: string): string {
  const s = status.toLowerCase();
  const pick = (m: Record<CertFlow, string>) => m[flow];
  if (s.includes("withdraw")) return "withdrawn";
  if (s.includes("surveil") || s.includes("renew")) return flow === "ingelo" ? "mark" : "surveillance";
  if (s.includes("certified"))
    return pick({ ms: "certificate", product: "permit", ingelo: "mark", combined: "certificate" });
  if (s.includes("nc"))
    return pick({ ms: "stage2", product: "assessment", ingelo: "assessment", combined: "stage2" });
  if (s.includes("in progress") || s === "audit")
    return pick({ ms: "stage2", product: "testing", ingelo: "assessment", combined: "stage2" });
  if (s.includes("sched"))
    return pick({ ms: "stage1", product: "assessment", ingelo: "assessment", combined: "stage1" });
  if (s.includes("review") || s.includes("assess"))
    return pick({ ms: "quote", product: "application", ingelo: "application", combined: "application" });
  return pick({ ms: "application", product: "application", ingelo: "application", combined: "application" });
}

/** Certification governance documents referenced on the live site. */
export type CertDocument = { code: string; title: string; flows: CertFlow[] | "all" };

export const CERT_DOCUMENTS: CertDocument[] = [
  { code: "CER_RU_028", title: "Rules for the use of the certification mark", flows: "all" },
  { code: "CER_PR_002", title: "Procedure for appeals handling", flows: "all" },
  { code: "CER_PR_006", title: "Procedure for complaints handling", flows: "all" },
  { code: "CER_PR_026", title: "Procedure for suspension, withdrawal & reduced scope", flows: "all" },
  { code: "IMP-POL", title: "Impartiality policy", flows: "all" },
  { code: "CER_PR_015", title: "Handling requests for information", flows: "all" },
  { code: "CER_PR_014", title: "Grant of certification procedure", flows: "all" },
  { code: "CER_PR_020", title: "Procedure for management systems certification audits", flows: ["ms", "combined"] },
  { code: "CER_FO_028", title: "Client notice of changes", flows: "all" },
  { code: "CER_PR_012", title: "Extending scope of certification procedure", flows: "all" },
  { code: "CER_PR_028", title: "Special audits procedure", flows: "all" },
  { code: "CER_FO_002_IPC", title: "Ingelo certification application form", flows: ["ingelo"] },
];

export function documentsFor(flow: CertFlow): CertDocument[] {
  return CERT_DOCUMENTS.filter((d) => d.flows === "all" || d.flows.includes(flow));
}

/**
 * Uploads per flow. ESWASA publishes no document checklist for management
 * systems or products, so those are free "supporting documents". The Ingelo
 * entries come from form CER_FO_002_IPC (informant passport-size photo).
 */
export type RequiredDoc = { key: string; label: string; required: boolean; hint?: string; multiple?: boolean };

const SUPPORTING: RequiredDoc = {
  key: "supporting",
  label: "Supporting documents",
  required: false,
  hint: "Anything you already have. ESWASA will tell you what else it needs.",
  multiple: true,
};

export const REQUIRED_DOCS: Record<CertFlow, RequiredDoc[]> = {
  ms: [SUPPORTING],
  product: [SUPPORTING],
  ingelo: [
    { key: "photo", label: "Passport-size photo of the informant", required: true, hint: "Asked for on form CER_FO_002_IPC" },
    SUPPORTING,
  ],
  combined: [SUPPORTING],
};

/* ---------- Request for Quotation (qoute_certification.php) ---------- */

export const RFQ_TYPES: { value: CertFlow; label: string }[] = [
  { value: "ms", label: "Management Systems (e.g., ISO 9001, ISO 14001)" },
  { value: "product", label: "Product Certification (e.g., electrical, food, building materials)" },
  { value: "ingelo", label: "Ingelo Quality Mark (locally manufactured goods)" },
  { value: "combined", label: "Combined (e.g., ISO + Product)" },
];

export const RFQ_MAX_FILES = 5;
export const RFQ_MAX_MB = 10;

/* ---------- Ingelo form CER_FO_002_IPC options ---------- */

export const INGELO_PRODUCT_USE = ["Food", "Skincare", "Building", "Clothing", "Other"] as const;
export const INGELO_DISTRIBUTION = ["Informal", "Retailers", "Wholesalers"] as const;
export const INGELO_VOLUME_PERIOD = ["Daily", "Weekly", "Monthly", "Annually"] as const;
export const INGELO_WATER = ["Borehole", "ESWC", "None"] as const;

/** Eswatini regions; Tinkhundla are free text (59 constituencies). */
export const REGIONS = ["Hhohho", "Manzini", "Lubombo", "Shiselweni"] as const;

/** IAF sector codes in ESWASA's SADCAS accreditation scope. */
export const IAF_CODES = [
  { code: "3", label: "IAF 3: Food products, beverages and tobacco" },
  { code: "12", label: "IAF 12: Chemicals, chemical products and fibres" },
  { code: "13", label: "IAF 13: Pharmaceuticals" },
  { code: "38", label: "IAF 38: Health and social work" },
  { code: "other", label: "Other sector (ESWASA will confirm scope)" },
] as const;

export const LAB_FIELDS = [
  "Chemistry",
  "Microbiology",
  "Textiles",
  "Mechanical",
  "Civil",
  "Electrical",
] as const;

/* ---------- Working-day helpers (charter countdowns) ---------- */

export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d;
}

export function workingDaysBetween(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  const sign = b >= a ? 1 : -1;
  const [start, end] = sign === 1 ? [a, b] : [b, a];
  let n = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n * sign;
}

export function fmtDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function stageProgress(flow: CertFlow, stage: string): number {
  const stages = FLOW_STAGES[flow];
  const i = stages.findIndex((s) => s.key === stage);
  if (i < 0) return 0;
  return Math.round(((i + 1) / stages.length) * 100);
}

export function stageTitle(flow: CertFlow, stage: string): string {
  if (stage === "withdrawn") return "Withdrawn";
  return FLOW_STAGES[flow].find((s) => s.key === stage)?.title ?? stage;
}
