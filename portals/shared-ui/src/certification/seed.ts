/**
 * Certification demo seed — one application per map state, the register (active, surveillance due,
 * suspended, expired), the auditor competence matrix and mark-use requests. Fictional; ids line up with
 * the field, metrology and CRM seeds. Applications with customer_email "demo" show in the Service account.
 */
import { isoIn } from "../store/localStore";
import type { AppDoc, CertApplication, CertificateRec, CertSettings, Competence, MarkRequest, Nonconformity, SchemeDef } from "./types";

const DOCS_MS = [
  { key: "registration", label: "Company registration certificate" },
  { key: "manual", label: "Management system manual / policy" },
  { key: "procedures", label: "Documented procedures list" },
  { key: "internal_audit", label: "Last internal audit report" },
  { key: "mgmt_review", label: "Last management review minutes" },
  { key: "orgchart", label: "Organisation chart" },
];
const DOCS_PRODUCT = [
  { key: "registration", label: "Company registration certificate" },
  { key: "spec", label: "Product specification" },
  { key: "process_flow", label: "Process flow chart" },
  { key: "qc_plan", label: "Quality control plan and test records" },
  { key: "label", label: "Product label artwork" },
];
const DOCS_INGELO = [
  { key: "national_id", label: "National ID of the producer" },
  { key: "photo", label: "Passport-size photo" },
  { key: "recipe", label: "Product description / recipe" },
];

export const SEED_SCHEMES: SchemeDef[] = [
  { code: "iso9001", title: "Quality management (ISO 9001)", standard: "ISO 9001:2015", flow: "ms", required_docs: DOCS_MS, cac: false },
  { code: "iso14001", title: "Environmental management (ISO 14001)", standard: "ISO 14001:2015", flow: "ms", required_docs: DOCS_MS, cac: false },
  { code: "iso22000", title: "Food safety management (ISO 22000)", standard: "ISO 22000:2018", flow: "ms", required_docs: [...DOCS_MS, { key: "haccp_plan", label: "HACCP plan" }], cac: false },
  { code: "iso45001", title: "Occupational health & safety (ISO 45001)", standard: "ISO 45001:2018", flow: "ms", required_docs: DOCS_MS, cac: false },
  { code: "product", title: "SZNS product certification mark", standard: "SZNS product mark", flow: "product", required_docs: DOCS_PRODUCT, cac: true },
  { code: "combined", title: "Management system + product mark", standard: "ISO 22000 + SZNS mark", flow: "combined", required_docs: [...DOCS_MS, ...DOCS_PRODUCT.slice(1)], cac: true },
  { code: "ingelo", title: "Ingelo quality mark (MSMEs)", standard: "Ingelo Quality Mark", flow: "ingelo", required_docs: DOCS_INGELO, cac: true },
];

export const DEFAULT_CERT_SETTINGS: CertSettings = {
  day_rate: 6500,
  application_fee: 2500,
  certificate_fee: 4000,
  lab_fee: 7800,
  deposit_pct: 50,
  nc_days: 30,
  appeal_days: 90,
  surveillance_lead_days: 60,
  rotation_cycles: 2,
  quote_valid_days: 30,
  sla_document_review: 3,
  sla_technical_review: 5,
  sla_decision: 3,
  fee_table: [
    { max: 5, days: 1.5 },
    { max: 25, days: 3 },
    { max: 45, days: 4 },
    { max: 85, days: 5 },
    { max: 125, days: 6 },
    { max: 175, days: 7 },
    { max: 275, days: 8 },
    { max: 425, days: 9 },
    { max: 100000, days: 10 },
  ],
  schemes: SEED_SCHEMES,
};

function docs(scheme: string, statuses: Record<string, AppDoc["status"]> = {}, all?: AppDoc["status"]): AppDoc[] {
  const s = SEED_SCHEMES.find((x) => x.code === scheme)!;
  return s.required_docs.map((d) => {
    const status = statuses[d.key] ?? all ?? "missing";
    return { key: d.key, label: d.label, required: true, status, versions: status === "missing" ? [] : [{ name: `${d.key}.pdf`, at: isoIn(-20), by: "Customer" }] };
  });
}

const ev = (at: string, actor: string, action: string, from?: string, to?: string, extra: { reason?: string; note?: string; rule?: string } = {}) => ({ at, actor, action, from, to, ...extra });

function nc(id: string, clause: string, severity: Nonconformity["severity"], statement: string, state: Nonconformity["state"], p: Partial<Nonconformity> = {}): Nonconformity {
  return { id, clause, severity, statement, raised_at: isoIn(-9), raised_by: "Sabelo Mamba", due: isoIn(21), state, rejections: 0, ...p };
}

function app(p: Partial<CertApplication> & Pick<CertApplication, "id" | "state" | "scheme" | "org" | "contact" | "customer_email" | "employees" | "scope">): CertApplication {
  const scheme = SEED_SCHEMES.find((s) => s.code === p.scheme)!;
  return {
    seq: 1,
    history: [],
    flow: scheme.flow,
    standard: scheme.standard,
    sites: [{ name: "Main site", address: "Eswatini", employees: p.employees }],
    channel: "portal",
    created_at: isoIn(-30),
    documents: docs(p.scheme, {}, "acceptable"),
    info_requests: [],
    stages: [],
    findings: [],
    sample_ids: [],
    ...p,
  } as CertApplication;
}

export function seedApplications(): CertApplication[] {
  return [
    app({ id: "CERT-APP-26-0061", state: "Submitted", scheme: "iso22000", org: "Kwaluseni Bakery", client_id: "CL-020", contact: "Nomsa Khumalo", customer_email: "nomsa@kwaluseni.example.sz", employees: 12, scope: "Baking of bread and confectionery", created_at: isoIn(-1), documents: docs("iso22000", { registration: "received", manual: "received", haccp_plan: "received" }), history: [ev(isoIn(-1), "Nomsa Khumalo (customer)", "Submitted application", undefined, "Submitted")] }),
    app({ id: "CERT-APP-26-0060", state: "Document Review", scheme: "iso9001", org: "Matsapha Steel Fabricators", client_id: "CL-008", contact: "Mandla Motsa", customer_email: "quality@matsapha.example.sz", employees: 88, scope: "Fabrication of structural steel", officer: "Bongani Hlophe", created_at: isoIn(-5), documents: docs("iso9001", { registration: "acceptable", manual: "acceptable", procedures: "received", internal_audit: "missing", mgmt_review: "missing", orgchart: "received" }), duties: { Officer: ["Bongani Hlophe"] }, seq: 2, history: [ev(isoIn(-5), "Mandla Motsa (customer)", "Submitted application", undefined, "Submitted"), ev(isoIn(-4), "Bongani Hlophe", "Claim & start review", "Submitted", "Document Review")] }),
    app({
      id: "CERT-APP-26-0057",
      state: "Awaiting Customer",
      scheme: "iso22000",
      org: "Ubombo Honey Co. (Pty) Ltd",
      client_id: "CL-001",
      contact: "Sipho Nkambule",
      customer_email: "demo",
      phone: "+268 7602 1188",
      employees: 38,
      scope: "Processing and bottling of honey",
      officer: "Bongani Hlophe",
      created_at: isoIn(-12),
      documents: docs("iso22000", { registration: "acceptable", manual: "acceptable", procedures: "acceptable", internal_audit: "rejected", mgmt_review: "missing", orgchart: "acceptable", haccp_plan: "acceptable" }).map((d) => (d.key === "internal_audit" ? { ...d, comment: "Report is from 2023 — we need the audit from the last 12 months." } : d)),
      info_requests: [{ id: "IR-1", at: isoIn(-3), by: "Bongani Hlophe", items: [{ key: "internal_audit", label: "Last internal audit report", note: "Must be within the last 12 months" }, { key: "mgmt_review", label: "Last management review minutes" }], message: "Thank you for your application. Before we can quote, please upload the two documents below.", due: isoIn(11) }],
      duties: { Officer: ["Bongani Hlophe"] },
      seq: 3,
      history: [ev(isoIn(-12), "Sipho Nkambule (customer)", "Submitted application", undefined, "Submitted"), ev(isoIn(-10), "Bongani Hlophe", "Claim & start review", "Submitted", "Document Review"), ev(isoIn(-3), "Bongani Hlophe", "Request information", "Document Review", "Awaiting Customer", { reason: "Internal audit report out of date; management review minutes missing." })],
    }),
    app({
      id: "CERT-APP-26-0055",
      state: "Quoted",
      scheme: "product",
      org: "Ubombo Honey Co. (Pty) Ltd",
      client_id: "CL-001",
      contact: "Sipho Nkambule",
      customer_email: "demo",
      employees: 38,
      scope: "Raw and creamed honey, 500 g and 1 kg jars",
      officer: "Bongani Hlophe",
      created_at: isoIn(-20),
      quote: { id: "CQ-26-0055", lines: [{ label: "Application fee", qty: 1, unit_price: 2500 }, { label: "Factory inspection (auditor-days)", qty: 2, unit_price: 6500 }, { label: "Sampling & laboratory testing", qty: 1, unit_price: 7800 }, { label: "Permit fee (year 1)", qty: 1, unit_price: 4000 }], auditor_days: 2, valid_until: isoIn(26), issued_at: isoIn(-4), issued_by: "Bongani Hlophe", deposit_pct: 50 },
      duties: { Officer: ["Bongani Hlophe"] },
      seq: 3,
      history: [ev(isoIn(-20), "Sipho Nkambule (customer)", "Submitted application", undefined, "Submitted"), ev(isoIn(-18), "Bongani Hlophe", "Claim & start review", "Submitted", "Document Review"), ev(isoIn(-4), "Bongani Hlophe", "Accept documents & issue quote", "Document Review", "Quoted")],
    }),
    app({
      id: "CERT-APP-26-0053",
      state: "Audit Planned",
      scheme: "iso9001",
      org: "Ubombo Honey Co. (Pty) Ltd",
      client_id: "CL-001",
      contact: "Sipho Nkambule",
      customer_email: "demo",
      employees: 38,
      scope: "Processing and bottling of honey",
      officer: "Bongani Hlophe",
      created_at: isoIn(-40),
      quote: { id: "CQ-26-0053", lines: [{ label: "Application fee", qty: 1, unit_price: 2500 }, { label: "Stage 1 + Stage 2 audit (auditor-days)", qty: 4, unit_price: 6500 }, { label: "Certificate fee", qty: 1, unit_price: 4000 }], auditor_days: 4, valid_until: isoIn(-5), issued_at: isoIn(-30), issued_by: "Bongani Hlophe", deposit_pct: 50, accepted_at: isoIn(-20), agreement: { name: "Sipho Nkambule", title: "Managing Director", at: isoIn(-20) }, invoice_id: "INV-26-4095" },
      stages: [
        { id: "S1", label: "Stage 1", date: isoIn(6, 8), days: 1, visit_id: "FV-26-0151" },
        { id: "S2", label: "Stage 2", date: isoIn(27, 8), days: 3 },
      ],
      duties: { Officer: ["Bongani Hlophe"] },
      seq: 4,
      history: [ev(isoIn(-20), "Sipho Nkambule (customer)", "Accept quote & pay deposit", "Quoted", "Audit Planned")],
    }),
    app({
      id: "CERT-APP-26-0058",
      state: "Audit in Progress",
      scheme: "iso9001",
      org: "Mhlume Packaging (Pty) Ltd",
      client_id: "CL-003",
      contact: "B. Magagula",
      customer_email: "quality@mhlumepack.example.sz",
      employees: 140,
      scope: "Manufacture of corrugated packaging",
      officer: "Bongani Hlophe",
      created_at: isoIn(-60),
      stages: [
        { id: "S1", label: "Stage 1", date: isoIn(-30), days: 1 },
        { id: "S2", label: "Stage 2", date: isoIn(-5), days: 2, visit_id: "FV-26-0140" },
      ],
      duties: { Officer: ["Bongani Hlophe"], "Audit team": ["Lindiwe Dube", "Sabelo Mamba"] },
      seq: 6,
      history: [ev(isoIn(-6), "Thandeka Simelane", "Start audit", "Audit Planned", "Audit in Progress")],
    }),
    app({
      id: "CERT-APP-26-0051",
      state: "NC Resolution",
      scheme: "iso22000",
      org: "Valley Dairy Cooperative",
      client_id: "CL-002",
      contact: "Thandeka Nkambule",
      customer_email: "demo",
      employees: 210,
      scope: "Processing of pasteurised milk and maas",
      officer: "Bongani Hlophe",
      created_at: isoIn(-70),
      stages: [
        { id: "S1", label: "Stage 1", date: isoIn(-35), days: 1 },
        { id: "S2", label: "Stage 2", date: isoIn(-12), days: 3, visit_id: "FV-26-0136" },
      ],
      findings: [
        nc("NC-1", "ISO 22000 §8.5.4", "major", "CCP monitoring records for pasteuriser temperature were incomplete for 3 days in August.", "Response submitted", { visit_id: "FV-26-0136", response: { root_cause: "Night-shift operator not trained on the new record sheet.", correction: "Records reconstructed from the chart recorder; batch released after review.", corrective_action: "Training for all shifts, supervisor sign-off each shift, monthly QA check.", evidence: ["training-register.pdf", "ccp-log-sept.pdf"], at: isoIn(-2), by: "Thandeka Nkambule" } }),
        nc("NC-2", "ISO 22000 §7.1.5", "minor", "Two thermometers used for receiving checks were past their calibration due date.", "Raised", { visit_id: "FV-26-0136" }),
      ],
      duties: { Officer: ["Bongani Hlophe"], "Audit team": ["Sabelo Mamba", "Nonhlanhla Dlamini"] },
      seq: 7,
      history: [ev(isoIn(-9), "System", "Visit FV-26-0136 closed — 2 findings", "Audit in Progress", "NC Resolution", { rule: "R-C2" })],
    }),
    app({
      id: "CERT-APP-26-0047",
      state: "Audit in Progress",
      scheme: "product",
      org: "Mankayane Roof Tiles",
      client_id: "CL-021",
      contact: "J. Shabalala",
      customer_email: "info@mankayanetiles.example.sz",
      employees: 35,
      scope: "Concrete roof tiles",
      officer: "Bongani Hlophe",
      created_at: isoIn(-50),
      stages: [{ id: "S1", label: "Factory inspection + sampling", date: isoIn(-10), days: 1, visit_id: "FV-26-0147" }],
      sample_ids: ["SMP-26-0412"],
      duties: { Officer: ["Bongani Hlophe"], "Audit team": ["Mfanasibili Vilakati"] },
      seq: 6,
      history: [ev(isoIn(-8), "System", "Visit FV-26-0147 closed — waiting for lab results", undefined, undefined)],
    }),
    app({
      id: "CERT-APP-26-0049",
      state: "Technical Review",
      scheme: "product",
      org: "Sidvokodvo Cement Products",
      client_id: "CL-006",
      contact: "Plant QA",
      customer_email: "qa@sidvokodvocement.example.sz",
      employees: 320,
      scope: "Portland cement CEM I 42.5N, 50 kg bags",
      officer: "Bongani Hlophe",
      created_at: isoIn(-75),
      stages: [{ id: "S1", label: "Factory inspection + sampling", date: isoIn(-24), days: 2, visit_id: "FV-26-0131" }],
      sample_ids: ["SMP-26-0398"],
      duties: { Officer: ["Bongani Hlophe"], "Audit team": ["Bongani Hlophe"] },
      seq: 8,
      history: [ev(isoIn(-3), "Bongani Hlophe", "Send to technical review", "Audit in Progress", "Technical Review")],
    }),
    app({
      id: "CERT-APP-26-0045",
      state: "Decision",
      scheme: "iso22000",
      org: "Royal Valley Sugar Estates",
      client_id: "CL-013",
      contact: "Nomsa Dlamini",
      customer_email: "eng@royalvalley.example.sz",
      employees: 1400,
      scope: "Production of raw and refined sugar",
      officer: "Bongani Hlophe",
      created_at: isoIn(-95),
      stages: [{ id: "S1", label: "Stage 1", date: isoIn(-50), days: 2 }, { id: "S2", label: "Stage 2", date: isoIn(-30), days: 8 }],
      findings: [nc("NC-1", "ISO 22000 §8.8", "minor", "Verification plan did not include the new packing line.", "Verified closed", { verified: { by: "Lindiwe Dube", at: isoIn(-12) } })],
      technical_review: { by: "Nhlanhla Shabangu", at: isoIn(-2), checklist: [], recommendation: "grant", justification: "Audit complete and competent; one minor NC closed with evidence; scope wording agreed." },
      duties: { Officer: ["Bongani Hlophe"], "Audit team": ["Lindiwe Dube", "Sabelo Mamba"], "Technical reviewer": ["Nhlanhla Shabangu"] },
      seq: 9,
      history: [ev(isoIn(-2), "Nhlanhla Shabangu", "Complete technical review", "Technical Review", "Decision", { note: "Recommend grant" })],
    }),
    app({
      id: "CERT-APP-25-0019",
      state: "Certified",
      scheme: "iso22000",
      org: "Ubombo Honey Co. (Pty) Ltd",
      client_id: "CL-001",
      contact: "Sipho Nkambule",
      customer_email: "demo",
      employees: 38,
      scope: "Extraction and packing of honey (HACCP-based FSMS)",
      created_at: isoIn(-420),
      decision: { by: "Thandeka Simelane", at: isoIn(-345), outcome: "grant", body: "Certification Manager", note: "All criteria met." },
      certificate_id: "CRT-25-0311",
      seq: 10,
      history: [ev(isoIn(-345), "Thandeka Simelane", "Grant certification", "Decision", "Certified", { rule: "R-C3" })],
    }),
    app({
      id: "CERT-APP-26-0033",
      state: "Rejected",
      scheme: "ingelo",
      org: "Lilanga Natural Skincare",
      client_id: "CL-004",
      contact: "Lindiwe Hlophe",
      customer_email: "lilanga@example.sz",
      employees: 4,
      scope: "Marula body butter",
      created_at: isoIn(-80),
      decision: { by: "Thandeka Simelane", at: isoIn(-20), outcome: "refuse", body: "Certification Approval Committee", note: "Microbiological limits exceeded on two batches; no evidence of process control.", appeal_until: isoIn(70) },
      duties: { "Decision maker": ["Thandeka Simelane"] },
      seq: 8,
      history: [ev(isoIn(-20), "Thandeka Simelane", "Refuse", "Decision", "Rejected", { reason: "Microbiological limits exceeded on two batches; no evidence of process control.", rule: "R-C4" })],
    }),
  ];
}

export function seedCertificates(): CertificateRec[] {
  const base = (p: Partial<CertificateRec> & Pick<CertificateRec, "id" | "number" | "state" | "org" | "standard" | "scheme" | "scope" | "issued_at" | "expires_at">): CertificateRec => ({
    seq: 1,
    history: [],
    application_id: "",
    customer_email: "",
    sites: ["Main site"],
    cycle: [],
    token: p.id.toLowerCase(),
    scope_history: [],
    ...p,
  });
  return [
    base({ id: "CRT-25-0311", number: "ESWASA-ISO22000-2025-00311", state: "Surveillance Due", application_id: "CERT-APP-25-0019", org: "Ubombo Honey Co. (Pty) Ltd", client_id: "CL-001", customer_email: "demo", scheme: "iso22000", standard: "ISO 22000:2018", scope: "Extraction and packing of honey (HACCP-based FSMS)", sites: ["Ubombo processing plant, Siteki"], issued_at: isoIn(-345), expires_at: isoIn(750), cycle: [{ id: "SV1", label: "Surveillance audit 1", due: isoIn(21), visit_id: "FV-26-0160" }, { id: "SV2", label: "Surveillance audit 2", due: isoIn(385) }, { id: "RC", label: "Recertification audit", due: isoIn(690) }], history: [ev(isoIn(-345), "Thandeka Simelane", "Issued", undefined, "Active"), ev(isoIn(-1), "System", "Surveillance due within 60 days", "Active", "Surveillance Due", { rule: "R-C5" })], seq: 2 }),
    base({ id: "CRT-25-0288", number: "ESWASA-ISO9001-2025-00288", state: "Active", application_id: "CERT-APP-25-0011", org: "Royal Valley Sugar Estates", client_id: "CL-013", customer_email: "eng@royalvalley.example.sz", scheme: "iso9001", standard: "ISO 9001:2015", scope: "Production of raw and refined sugar", issued_at: isoIn(-300), expires_at: isoIn(795), cycle: [{ id: "SV1", label: "Surveillance audit 1", due: isoIn(65) }, { id: "SV2", label: "Surveillance audit 2", due: isoIn(430) }, { id: "RC", label: "Recertification audit", due: isoIn(735) }] }),
    base({ id: "CRT-24-0240", number: "ESWASA-ISO9001-2024-00240", state: "Active", application_id: "CERT-APP-24-0090", org: "Mhlume Packaging (Pty) Ltd", client_id: "CL-003", customer_email: "quality@mhlumepack.example.sz", scheme: "iso14001", standard: "ISO 14001:2015", scope: "Manufacture of corrugated packaging", issued_at: isoIn(-700), expires_at: isoIn(395), cycle: [{ id: "SV1", label: "Surveillance audit 1", due: isoIn(-335), done_at: isoIn(-340) }, { id: "SV2", label: "Surveillance audit 2", due: isoIn(30) }, { id: "RC", label: "Recertification audit", due: isoIn(335) }] }),
    base({ id: "CRT-24-0190", number: "ESWASA-PM-2024-00190", state: "Suspended", application_id: "CERT-APP-24-0060", org: "Swazi Crafts Collective", client_id: "CL-010", customer_email: "musa@swazicrafts.example.sz", scheme: "product", standard: "SZNS product mark", scope: "Woven baskets and mats", issued_at: isoIn(-500), expires_at: isoIn(230), duties: { "Suspended by": ["Thandeka Simelane"] }, history: [ev(isoIn(-14), "Thandeka Simelane", "Suspend", "Active", "Suspended", { reason: "Major NC on raw-material traceability not closed within 90 days.", rule: "R-C6" })], seq: 2 }),
    base({ id: "CRT-23-0102", number: "ESWASA-PM-2023-00102", state: "Expired", application_id: "CERT-APP-23-0020", org: "Nhlangano Grain Millers", client_id: "CL-009", customer_email: "quality@nhlangano.example.sz", scheme: "product", standard: "SZNS product mark", scope: "Maize meal 10 kg and 25 kg", issued_at: isoIn(-1100), expires_at: isoIn(-5) }),
  ];
}

export const SEED_COMPETENCE: Competence[] = [
  { name: "Lindiwe Dube", role: "lead", schemes: ["iso9001", "iso22000", "combined"], areas: ["EA 03 Food", "EA 14 Packaging", "EA 28 Construction"], qualified_until: isoIn(400), declaration_until: isoIn(120), relationships: [], cycles: [{ org: "Mhlume Packaging (Pty) Ltd", count: 1 }, { org: "Royal Valley Sugar Estates", count: 2 }] },
  { name: "Sabelo Mamba", role: "auditor", schemes: ["iso9001", "iso14001", "iso22000"], areas: ["EA 03 Food", "EA 14 Packaging"], qualified_until: isoIn(220), declaration_until: isoIn(40), relationships: [{ org: "Valley Dairy Cooperative", kind: "Former employee", until: isoIn(-200) }], cycles: [] },
  { name: "Nonhlanhla Dlamini", role: "trainee", schemes: ["iso9001"], areas: ["EA 14 Packaging"], qualified_until: isoIn(300), declaration_until: isoIn(300), relationships: [], cycles: [] },
  { name: "Mfanasibili Vilakati", role: "lead", schemes: ["product", "ingelo", "combined"], areas: ["Construction products", "Food products"], qualified_until: isoIn(150), declaration_until: isoIn(60), relationships: [{ org: "Mankayane Roof Tiles", kind: "Relative works there", until: isoIn(-30) }], cycles: [] },
  { name: "Bongani Hlophe", role: "technical_expert", schemes: ["product", "ingelo"], areas: ["Food products"], qualified_until: isoIn(90), declaration_until: isoIn(-10), relationships: [], cycles: [] },
  { name: "Nhlanhla Shabangu", role: "technical_expert", schemes: ["iso9001", "iso22000", "product"], areas: ["EA 03 Food"], qualified_until: isoIn(500), declaration_until: isoIn(200), relationships: [{ org: "Ubombo Honey Co. (Pty) Ltd", kind: "Consultancy (2025)", until: isoIn(400) }], cycles: [] },
];

export function seedMarks(): MarkRequest[] {
  return [
    { id: "MK-26-0014", state: "Submitted", certificate_id: "CRT-25-0311", org: "Ubombo Honey Co. (Pty) Ltd", customer_email: "demo", usage: "packaging", description: "New 250 g squeeze-bottle label with the certification mark next to the logo.", artwork: "ubombo-250g-label.pdf", submitted_at: isoIn(-2), seq: 1, history: [ev(isoIn(-2), "Sipho Nkambule (customer)", "Submitted artwork", undefined, "Submitted")] },
    { id: "MK-26-0011", state: "Returned", certificate_id: "CRT-25-0288", org: "Royal Valley Sugar Estates", customer_email: "eng@royalvalley.example.sz", usage: "advertising", description: "Billboard on the MR3 with the ISO 9001 mark.", artwork: "rvs-billboard.jpg", submitted_at: isoIn(-9), comments: "The mark can't be used on product claims for an MS certificate — use the wording 'ISO 9001 certified company'.", seq: 2, history: [ev(isoIn(-6), "Bongani Hlophe", "Return with comments", "Submitted", "Returned", { reason: "The mark can't be used on product claims for an MS certificate." })] },
  ];
}
