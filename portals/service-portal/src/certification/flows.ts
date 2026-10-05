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
  combined: "Combined (ISO + Product)",
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

export const FLOW_STAGES: Record<CertFlow, FlowStage[]> = {
  // managementsystems.php: 8-step process.
  ms: [
    {
      key: "enquiry",
      title: "Initial enquiry",
      body: "You tell us which standard and scope you want certified. Request a quote online.",
      who: "you",
      sla: `Quote within ${CHARTER.quoteDays} working days`,
    },
    {
      key: "application",
      title: "Promotional visit & application",
      body: "ESWASA may visit to explain the process. You submit the application with scope, sites and documents.",
      who: "both",
      sla: `Receipt confirmed within ${CHARTER.receiptDays} working days`,
    },
    {
      key: "quote",
      title: "Quote, contract & payment",
      body: "You accept the quote, sign the certification agreement and pay. Audit planning starts once paid.",
      who: "you",
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
      body: "On-site verification that the system is implemented and effective. Any non-conformities must be corrected.",
      who: "both",
    },
    {
      key: "decision",
      title: "Certification decision",
      body: "An independent ESWASA reviewer, not the auditor, evaluates the audit findings and decides.",
      who: "eswasa",
    },
    {
      key: "certificate",
      title: "Certificate issued",
      body: "Certificate granted for 3 years. Use of the mark follows CER_RU_028.",
      who: "eswasa",
    },
    {
      key: "surveillance",
      title: "Surveillance & recertification",
      body: "Two surveillance audits, then a recertification audit before the 3-year cycle ends.",
      who: "both",
    },
  ],
  // product.php: 6-step process.
  product: [
    {
      key: "application",
      title: "Application, quote, planning & scheduling",
      body: "You apply with product and factory details, accept the quote, and ESWASA plans the assessment.",
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
      body: "Product samples are drawn and tested at an accredited laboratory.",
      who: "eswasa",
    },
    {
      key: "cac",
      title: "Certification Approval Committee",
      body: "Assessment and test results go to the CAC for the certification decision.",
      who: "eswasa",
    },
    {
      key: "permit",
      title: "Permit / certification awarded",
      body: "Permit to use the SZNS product mark, valid for 3 years.",
      who: "eswasa",
    },
    {
      key: "surveillance",
      title: "Post-permit surveillance",
      body: "Ongoing inspections, audits, and market or factory sampling and testing.",
      who: "both",
    },
  ],
  // ingelo.php: eligibility, free consultation, form CER_FO_002_IPC, mark.
  ingelo: [
    {
      key: "eligibility",
      title: "Eligibility check",
      body: "Emaswati-owned local MSME producing goods or services, willing to scale up for export quotas.",
      who: "you",
    },
    {
      key: "consultation",
      title: "Free consultation & gap analysis",
      body: "Free pre-application consultation and gap-analysis workshop to prepare your business.",
      who: "both",
    },
    {
      key: "application",
      title: "Application (CER_FO_002_IPC)",
      body: "The Ingelo application form, submitted online. No need to email it or deliver it to Matsapha.",
      who: "you",
      sla: `Receipt confirmed within ${CHARTER.receiptDays} working days`,
    },
    {
      key: "assessment",
      title: "Certification assessment",
      body: "ESWASA assesses your product or service, and your process, against the applicable standard.",
      who: "eswasa",
      sla: `Scheduled within ${CHARTER.auditScheduleDays} working days`,
    },
    {
      key: "decision",
      title: "Certification decision",
      body: "Findings are reviewed independently and a decision is made.",
      who: "eswasa",
    },
    {
      key: "mark",
      title: "ESWASA Approved mark",
      body: "You may display the ESWASA Approved mark on your products under the mark rules.",
      who: "eswasa",
    },
    {
      key: "surveillance",
      title: "Maintaining the mark",
      body: "ESWASA monitors that the requirements keep being met.",
      who: "both",
    },
  ],
  combined: [
    {
      key: "application",
      title: "Application, quote & contract",
      body: "One application covers the management system and the product. One quote and one agreement.",
      who: "both",
      sla: `Receipt confirmed within ${CHARTER.receiptDays} working days`,
    },
    {
      key: "stage1",
      title: "Stage 1 audit",
      body: "Documentation review and readiness.",
      who: "eswasa",
      sla: `Scheduled within ${CHARTER.auditScheduleDays} working days`,
    },
    {
      key: "stage2",
      title: "Stage 2 audit + factory assessment",
      body: "Management system implementation and product process assessed in one visit.",
      who: "both",
    },
    {
      key: "testing",
      title: "Sampling & testing",
      body: "Product samples tested at an accredited laboratory.",
      who: "eswasa",
    },
    {
      key: "decision",
      title: "Certification decision (CAC)",
      body: "Independent decision on both the system and the product.",
      who: "eswasa",
    },
    {
      key: "certificate",
      title: "Certificate + permit",
      body: "System certificate and product permit, each valid for 3 years.",
      who: "eswasa",
    },
    {
      key: "surveillance",
      title: "Surveillance",
      body: "Combined surveillance audits and product sampling.",
      who: "both",
    },
  ],
};

/** Map the backend workflow state (or its display label) to a stage key per flow. */
export function stageFromStatus(flow: CertFlow, status: string): string {
  const s = status.toLowerCase();
  const pick = (m: Record<CertFlow, string>) => m[flow];
  if (s.includes("withdraw")) return "withdrawn";
  if (s.includes("surveil") || s.includes("renew")) return "surveillance";
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

/** What to have ready, per flow. Drives the checklist drawer and the document step. */
export type RequiredDoc = { key: string; label: string; required: boolean; hint?: string };

export const REQUIRED_DOCS: Record<CertFlow, RequiredDoc[]> = {
  ms: [
    { key: "registration", label: "Company registration / trading licence", required: true },
    { key: "orgchart", label: "Organisation chart", required: true },
    { key: "manual", label: "Management system manual or documented information", required: true },
    { key: "procedures", label: "Procedures and records required by the standard", required: true },
    { key: "internal_audit", label: "Internal audit report (last 12 months)", required: true },
    { key: "mgmt_review", label: "Management review minutes", required: true },
    { key: "legal_register", label: "Legal & other requirements register", required: false, hint: "ISO 14001 / ISO 45001" },
    { key: "haccp_plan", label: "HACCP plan and prerequisite programmes", required: false, hint: "ISO 22000 / HACCP" },
  ],
  product: [
    { key: "registration", label: "Company registration / trading licence", required: true },
    { key: "spec", label: "Product specification and labels", required: true },
    { key: "process_flow", label: "Process flow diagram", required: true },
    { key: "qc_plan", label: "Quality control plan and inspection records", required: true },
    { key: "test_reports", label: "Existing test reports (accredited laboratory)", required: false },
    { key: "suppliers", label: "Raw material supplier list", required: false },
    { key: "layout", label: "Factory / plant layout", required: false },
  ],
  ingelo: [
    { key: "national_id", label: "National ID of the informant", required: true },
    { key: "photo", label: "Passport-size photo of the informant", required: true },
    { key: "trading_licence", label: "Trading licence (where applicable)", required: false },
    { key: "product_photo", label: "Product / label photos", required: false },
    { key: "documented_system", label: "Any documented system or recipes", required: false },
  ],
  combined: [
    { key: "registration", label: "Company registration / trading licence", required: true },
    { key: "manual", label: "Management system manual or documented information", required: true },
    { key: "internal_audit", label: "Internal audit report (last 12 months)", required: true },
    { key: "mgmt_review", label: "Management review minutes", required: true },
    { key: "spec", label: "Product specification and labels", required: true },
    { key: "qc_plan", label: "Quality control plan and inspection records", required: true },
    { key: "test_reports", label: "Existing test reports (accredited laboratory)", required: false },
  ],
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
