import {
  checkIngeloEligibility,
  SCHEMES,
  schemeById,
  type ApplicationPayload,
  type IngeloEligibility,
  type Person,
  type ProductLine,
} from "../api/certification";
import { REQUIRED_DOCS, type CertFlow } from "./flows";

/** Apply-wizard state, step plan and validation (no components). */

export type WizardState = ApplicationPayload & {
  eligibility: IngeloEligibility;
  wantsConsultation: "" | "yes" | "no";
  confirmCommit: boolean;
};

export type StepKey =
  | "scheme"
  | "eligibility"
  | "consult"
  | "organisation"
  | "contacts"
  | "scope"
  | "system"
  | "products"
  | "factory"
  | "business"
  | "requirements"
  | "documents"
  | "declare"
  | "review";

export const STEP_LABEL: Record<StepKey, string> = {
  scheme: "Scheme & quote",
  eligibility: "Eligibility",
  consult: "Free consultation",
  organisation: "Organisation",
  contacts: "Contacts",
  scope: "Scope & sites",
  system: "Management system",
  products: "Products",
  factory: "Factory & testing",
  business: "Business & performance",
  requirements: "Certification requirements",
  documents: "Documents",
  declare: "Declarations",
  review: "Review & submit",
};

export function stepsFor(flow: CertFlow): StepKey[] {
  switch (flow) {
    case "ingelo":
      return [
        "eligibility",
        "consult",
        "organisation",
        "business",
        "requirements",
        "contacts",
        "documents",
        "declare",
        "review",
      ];
    case "product":
      return ["scheme", "organisation", "contacts", "products", "factory", "documents", "declare", "review"];
    case "combined":
      return [
        "scheme",
        "organisation",
        "contacts",
        "scope",
        "system",
        "products",
        "factory",
        "documents",
        "declare",
        "review",
      ];
    default:
      return ["scheme", "organisation", "contacts", "scope", "system", "documents", "declare", "review"];
  }
}

const emptyPerson = (): Person => ({ name: "", position: "", email: "", phone: "" });

export function emptyWizard(schemeId: string): WizardState {
  const scheme = schemeById(schemeId) ?? SCHEMES[0];
  return {
    scheme: scheme.id,
    flow: scheme.flow,
    org: {
      name: "",
      registration_no: "",
      trading_licence: "",
      year_registered: "",
      address: "",
      town: "",
      region: "",
      inkhundla: "",
      employees: "",
    },
    contact: emptyPerson(),
    alt_contact: emptyPerson(),
    scope: "",
    sites: [{ name: "Head office", address: "", employees: "", shifts: "1" }],
    standards: scheme.flow === "ingelo" || scheme.flow === "combined" ? [] : [scheme.code],
    existing_certs: "",
    consultant: "",
    quote_ref: "",
    details: {
      products: [{ name: "", brand: "", model: "", standard: "" }],
      lab_fields: [],
      product_use: [],
      distribution: [],
    },
    documents: [],
    declarations: {
      accurate: false,
      mark_rules: false,
      impartiality: false,
      terms: false,
      notify_changes: false,
    },
    signature: { name: "", date: new Date().toISOString().slice(0, 10) },
    eligibility: { citizen: null, local_msme: null, made_here: null, willing_to_scale: null },
    wantsConsultation: "",
    confirmCommit: false,
  };
}

/** Typed accessor for the free-form details map. */
export function det(s: WizardState, k: string): string {
  const v = s.details[k];
  return typeof v === "string" ? v : "";
}
export function detList(s: WizardState, k: string): string[] {
  const v = s.details[k];
  return Array.isArray(v) && (v.length === 0 || typeof v[0] === "string") ? (v as string[]) : [];
}
export function detProducts(s: WizardState): ProductLine[] {
  const v = s.details.products;
  return Array.isArray(v) && v.length && typeof v[0] === "object" ? (v as ProductLine[]) : [];
}

export type StepProps = {
  s: WizardState;
  set: (fn: (s: WizardState) => void) => void;
  errors: Record<string, string>;
};

/* ---------------- validation ---------------- */

const emailOk = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 7;

export function validateStep(step: StepKey, s: WizardState): Record<string, string> {
  const e: Record<string, string> = {};
  const flow = s.flow;
  switch (step) {
    case "scheme":
      if (!s.scheme) e.scheme = "Choose a scheme.";
      if (flow === "combined" && !s.standards.length) e.standards = "Choose at least one management-system standard.";
      break;
    case "eligibility": {
      const r = checkIngeloEligibility(s.eligibility);
      const el = s.eligibility;
      if ([el.citizen, el.local_msme, el.made_here, el.willing_to_scale].some((v) => v === null))
        e.eligibility = "Answer all four questions.";
      else if (!r.eligible) e.eligibility = "Not eligible for Ingelo.";
      break;
    }
    case "consult":
      if (!s.wantsConsultation) e.wantsConsultation = "Choose an option.";
      if (s.wantsConsultation === "yes") {
        if (!s.consultation?.date) e.consult_date = "Pick a preferred date.";
        if (!s.consultation?.mode) e.consult_mode = "Choose how you want to meet.";
      }
      break;
    case "organisation":
      if (!s.org.name.trim()) e.org_name = "Required.";
      if (!s.org.address.trim()) e.org_address = "Required.";
      if (flow === "ingelo") {
        if (!s.org.town.trim()) e.org_town = "Required.";
        if (!s.org.inkhundla.trim()) e.org_inkhundla = "Required.";
        if (!s.org.employees.trim()) e.org_employees = "Required.";
      } else {
        if (!s.org.registration_no.trim()) e.org_reg = "Required.";
        if (!s.org.employees.trim()) e.org_employees = "Required.";
      }
      break;
    case "contacts":
      if (!s.contact.name.trim()) e.c_name = "Required.";
      if (!emailOk(s.contact.email)) e.c_email = "Enter a valid email.";
      if (!phoneOk(s.contact.phone)) e.c_phone = "Enter a valid phone number.";
      if (flow === "ingelo" && !det(s, "national_id").trim()) e.national_id = "Required.";
      if (s.alt_contact.email && !emailOk(s.alt_contact.email)) e.a_email = "Enter a valid email.";
      break;
    case "scope":
      if (!s.scope.trim()) e.scope = "Describe the scope to be certified.";
      if (!s.sites.length || s.sites.some((x) => !x.address.trim())) e.sites = "Every site needs an address.";
      break;
    case "system":
      if (!det(s, "iaf")) e.iaf = "Choose your sector.";
      if (!det(s, "internal_audit_done")) e.internal_audit_done = "Please answer.";
      if (!det(s, "mgmt_review_done")) e.mgmt_review_done = "Please answer.";
      break;
    case "products": {
      const p = detProducts(s);
      if (!p.length || p.some((x) => !x.name.trim() || !x.standard.trim()))
        e.products = "Each product needs a name and the standard it should meet.";
      break;
    }
    case "factory":
      if (!det(s, "factory_address").trim()) e.factory_address = "Required.";
      if (!det(s, "in_house_qc")) e.in_house_qc = "Please answer.";
      if (!det(s, "samples_ready")) e.samples_ready = "Please answer.";
      break;
    case "business":
      if (!det(s, "product_or_service").trim()) e.product_or_service = "Required.";
      if (!det(s, "cottage")) e.cottage = "Please answer.";
      if (!det(s, "potable_water")) e.potable_water = "Please answer.";
      if (!detList(s, "product_use").length) e.product_use = "Choose at least one.";
      if (!detList(s, "distribution").length) e.distribution = "Choose at least one.";
      break;
    case "requirements":
      if (!det(s, "production_started")) e.production_started = "Please answer.";
      if (!det(s, "cert_kind")) e.cert_kind = "Please answer.";
      if (!det(s, "standards_implemented")) e.standards_implemented = "Please answer.";
      if (!det(s, "other_support")) e.other_support = "Please answer.";
      break;
    case "documents": {
      const missing = REQUIRED_DOCS[flow].filter(
        (d) => d.required && !s.documents.some((x) => x.key === d.key),
      );
      if (missing.length) e.documents = `${missing.length} required document(s) still to add. You can also send them later from your tracker.`;
      break;
    }
    case "declare":
      if (!s.declarations.accurate || !s.declarations.mark_rules || !s.declarations.impartiality || !s.declarations.terms || !s.declarations.notify_changes)
        e.declarations = "Tick every declaration to continue.";
      if (!s.signature.name.trim()) e.signature = "Type your full name as signature.";
      break;
    default:
      break;
  }
  return e;
}

/** Documents are advisory: the applicant may submit and upload later. */
export const SOFT_STEPS: StepKey[] = ["documents"];

