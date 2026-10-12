/**
 * Default CRM / service-desk configuration.
 * SLAs follow the provisional baseline in docs/EswasaOne_ESWASA_CONFIRMATION_PACK.md (F8–F11):
 * enquiry 5 working days, complaint 20, reopen within 14 days, Quality Manager owns service complaints.
 * The Service portal copy cites CER_PR_006 (ack 3, resolve 30) — flagged to_confirm until ESWASA signs off.
 * Price list amounts are placeholders: ESWASA publishes no fee schedule. TODO: wire real (ERPNext Price List).
 */
import type { CaseType, CaseTypeConfig, CrmConfig } from "./types";

export const TEAMS = [
  "Customer Service",
  "Quality Manager",
  "Certification",
  "Market Surveillance",
  "Finance",
  "Metrology",
  "Standards Sales",
  "Training",
  "Appeals Panel",
] as const;

export const DEFAULT_CASE_TYPES: Record<CaseType, CaseTypeConfig> = {
  enquiry: {
    label: "Enquiry",
    short: "Enquiry",
    description: "Questions about standards, services, fees or processes.",
    ack_days: 1,
    resolve_days: 5,
    team: "Customer Service",
    to_confirm: true,
    restricted: false,
  },
  service_complaint: {
    label: "Complaint about ESWASA's service",
    short: "Service complaint",
    description: "Delays, conduct, errors or quality of a service ESWASA delivered.",
    ack_days: 3,
    resolve_days: 20,
    team: "Quality Manager",
    to_confirm: true,
    restricted: false,
  },
  product_report: {
    label: "Report about a certified product or company",
    short: "Product report",
    description: "A certified client or product that may not meet its standard.",
    ack_days: 3,
    resolve_days: 30,
    team: "Market Surveillance",
    to_confirm: true,
    restricted: true,
  },
  mark_misuse: {
    label: "Mark misuse or fake certificate",
    short: "Mark misuse",
    description: "Unauthorised use of an ESWASA mark, or a certificate that fails verification.",
    ack_days: 1,
    resolve_days: 20,
    team: "Market Surveillance",
    to_confirm: true,
    restricted: true,
  },
  billing_dispute: {
    label: "Invoice or payment dispute",
    short: "Billing",
    description: "Disputed invoices, missing payments, refunds.",
    ack_days: 2,
    resolve_days: 10,
    team: "Finance",
    to_confirm: true,
    restricted: false,
  },
  appeal: {
    label: "Appeal against a certification decision",
    short: "Appeal",
    description: "Heard by a separate panel, never the original decision-maker (CER_PR_002).",
    ack_days: 3,
    resolve_days: 30,
    team: "Appeals Panel",
    to_confirm: true,
    restricted: true,
  },
  feedback: {
    label: "Feedback or compliment",
    short: "Feedback",
    description: "Compliments, suggestions and ideas.",
    ack_days: 3,
    resolve_days: 10,
    team: "Customer Service",
    to_confirm: false,
    restricted: false,
  },
};

export const DEFAULT_CONFIG: CrmConfig = {
  case_types: DEFAULT_CASE_TYPES,
  reopen_days: 14,
  teams: [...TEAMS],
  routing: [
    {
      id: "r1",
      label: "Fake certificate or QR scan failures → Market Surveillance (urgent)",
      when: { type: "mark_misuse" },
      team: "Market Surveillance",
      priority: "urgent",
      enabled: true,
    },
    {
      id: "r2",
      label: "Food safety keywords → urgent",
      when: { keyword: "contaminat|food poisoning|sick|unsafe|recall" },
      team: "Market Surveillance",
      priority: "urgent",
      enabled: true,
    },
    {
      id: "r3",
      label: "Calibration questions → Metrology",
      when: { type: "enquiry", keyword: "calibrat|scale|weigh|instrument" },
      team: "Metrology",
      enabled: true,
    },
    {
      id: "r4",
      label: "Buying standards → Standards Sales",
      when: { type: "enquiry", keyword: "buy|purchase|copy of|standard document|SZNS" },
      team: "Standards Sales",
      enabled: true,
    },
    {
      id: "r5",
      label: "Training and courses → Training",
      when: { type: "enquiry", keyword: "training|course|lead auditor|enrol" },
      team: "Training",
      enabled: true,
    },
  ],
  templates: [
    {
      id: "t-ack",
      name: "Acknowledgement",
      types: ["enquiry", "service_complaint", "product_report", "mark_misuse", "billing_dispute", "feedback", "appeal"],
      body:
        "Dear {name},\n\nThank you for contacting ESWASA. We have received your {type} (reference {ref}) and it is being handled by our {team} team. We aim to respond by {due}.\n\nKind regards,\nESWASA",
    },
    {
      id: "t-info",
      name: "Request for more information",
      types: ["service_complaint", "product_report", "mark_misuse", "billing_dispute"],
      body:
        "Dear {name},\n\nTo continue with case {ref}, we need a little more information:\n\n- \n\nYou can reply and upload files from your case page. The clock on this case is paused until we hear from you.\n\nKind regards,\nESWASA",
    },
    {
      id: "t-surv",
      name: "Product report — investigation opened",
      types: ["product_report", "mark_misuse"],
      body:
        "Dear {name},\n\nThank you for your report (reference {ref}). We have opened an investigation with our market surveillance team. For impartiality reasons we can't share details about another company, but we will tell you when the investigation is complete.\n\nKind regards,\nESWASA",
    },
    {
      id: "t-std",
      name: "How to buy a standard",
      types: ["enquiry"],
      body:
        "Dear {name},\n\nYou can buy Eswatini national standards from the ESWASA e-store at /standards. Search by number or title, add to cart and pay by card or MoMo. Your licensed copy downloads straight away.\n\nKind regards,\nESWASA",
    },
    {
      id: "t-close",
      name: "Resolution summary",
      types: ["enquiry", "service_complaint", "billing_dispute", "feedback"],
      body:
        "Dear {name},\n\nWe have resolved case {ref}:\n\n{resolution}\n\nIf you're not satisfied, you can reopen the case within {reopen} days from your case page.\n\nKind regards,\nESWASA",
    },
  ],
  price_list: [
    { code: "CERT-APP", service: "certification", label: "Certification application fee", unit: "per application", amount: 2500 },
    { code: "CERT-AUD", service: "certification", label: "Audit (auditor-day)", unit: "per auditor-day", amount: 6500 },
    { code: "CERT-SURV", service: "certification", label: "Surveillance audit (auditor-day)", unit: "per auditor-day", amount: 6000 },
    { code: "CERT-FEE", service: "certification", label: "Certificate / permit fee", unit: "per year", amount: 6000 },
    { code: "TEST-MICRO", service: "testing", label: "Microbiology test panel", unit: "per sample", amount: 1450 },
    { code: "TEST-CHEM", service: "testing", label: "Chemical analysis", unit: "per sample", amount: 1900 },
    { code: "CAL-MASS", service: "calibration", label: "Mass / balance calibration", unit: "per instrument", amount: 850 },
    { code: "CAL-TEMP", service: "calibration", label: "Temperature calibration", unit: "per instrument", amount: 720 },
    { code: "CAL-ONSITE", service: "calibration", label: "On-site call-out", unit: "per visit", amount: 1500 },
    { code: "TRN-ISO9001", service: "training", label: "ISO 9001 internal auditor course", unit: "per delegate", amount: 4200 },
    { code: "TRN-HACCP", service: "training", label: "HACCP awareness course", unit: "per delegate", amount: 2600 },
    { code: "TRN-INHOUSE", service: "training", label: "In-house training day", unit: "per day", amount: 14000 },
    { code: "STD-COPY", service: "standards", label: "National standard (licensed copy)", unit: "per copy", amount: 650 },
    { code: "STD-SUB", service: "standards", label: "Standards subscription", unit: "per year", amount: 9500 },
    { code: "INSP-EXP", service: "inspection", label: "Export inspection", unit: "per consignment", amount: 1800 },
  ],
  discount_approval_pct: 10,
  tiers: [
    { id: "key", label: "Key account", rule: "Annual spend over E 150k or 3+ certificates" },
    { id: "growth", label: "Growth", rule: "Active applications or spend E 30k–150k" },
    { id: "standard", label: "Standard", rule: "Any active certificate, job or order in 24 months" },
    { id: "prospect", label: "Prospect", rule: "No completed service yet" },
  ],
  survey: [
    "How satisfied are you with how your case was handled?",
    "Was the outcome clear?",
    "How easy was it to reach us?",
  ],
};

export const SERVICE_LABEL: Record<string, string> = {
  certification: "Certification",
  testing: "Testing",
  calibration: "Calibration",
  training: "Training",
  standards: "Standards sales",
  inspection: "Inspection",
};
