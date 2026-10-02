import { apiFetch } from "@eswasaone/shared-ui";

export type CertificationApplication = {
  id: string;
  scheme: string;
  applicant: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type Scheme = {
  id: string;
  code: string;
  title: string;
  body: string;
  chip: string;
  accent: string;
  tint: string;
  tone: string;
  duration: string;
  validity: string;
  fee: string;
  feeLabel?: string;
  open: boolean;
  subsidised?: boolean;
  cta: string;
  ctaClass?: "primary" | "gold";
  secondaryLabel: string;
};

export const SCHEMES: Scheme[] = [
  {
    id: "iso9001",
    code: "ISO 9001:2015",
    title: "Quality management systems — Certification",
    body: "Prove your organisation consistently delivers products and services that meet customer and regulatory requirements. Stage 1 documentation review, Stage 2 on-site audit, and a three-year certificate with annual surveillance.",
    chip: "Management system",
    accent: "#313391",
    tint: "#ECEEFC",
    tone: "#313391",
    duration: "6–12 weeks",
    validity: "3 years",
    fee: "SZL 18k – 45k",
    open: true,
    cta: "Start application",
    secondaryLabel: "Checklist",
  },
  {
    id: "iso22000",
    code: "ISO 22000:2018",
    title: "Food safety management systems — Certification",
    body: "End-to-end food safety management from primary production through to retail. Required by most EU food importers and by major retailers in the SACU region. Prerequisite programmes and HACCP plans are audited as part of Stage 2.",
    chip: "Management system",
    accent: "#15803D",
    tint: "#E3F4E9",
    tone: "#15803D",
    duration: "8–14 weeks",
    validity: "3 years",
    fee: "SZL 22k – 55k",
    open: true,
    cta: "Start application",
    secondaryLabel: "Checklist",
  },
  {
    id: "haccp",
    code: "SZNS SANS 10330",
    title: "HACCP — Hazard analysis and critical control points",
    body: "The faster, leaner path to food safety certification. Ideal for processors and caterers beginning their compliance journey — and a natural stepping-stone to full ISO 22000 later.",
    chip: "Food safety",
    accent: "#15803D",
    tint: "#E3F4E9",
    tone: "#15803D",
    duration: "4–8 weeks",
    validity: "2 years",
    fee: "SZL 12k – 28k",
    open: true,
    cta: "Start application",
    secondaryLabel: "Checklist",
  },
  {
    id: "product",
    code: "SZNS Product Mark",
    title: "SZNS Product Mark — Conformity mark for local goods",
    body: "The mark that tells buyers your product meets the Eswatini national standard. Required for many locally manufactured foods, bottled water, and construction materials sold through formal retail.",
    chip: "Product",
    accent: "#B8860B",
    tint: "#FEF6DC",
    tone: "#B8860B",
    duration: "4–8 weeks",
    validity: "3 years",
    fee: "SZL 8k – 25k",
    open: true,
    cta: "Start application",
    secondaryLabel: "Checklist",
  },
  {
    id: "ingelo",
    code: "Ingelo Certification",
    title: "Ingelo Certification Scheme — MSME quality approval",
    body: "A government-backed scheme helping local small businesses meet quality, health and safety standards. Funding covers training, testing, and the certification assessment itself. Open to Eswatini-registered MSMEs with fewer than 50 staff.",
    chip: "MSME · Ingelo",
    accent: "#16A34A",
    tint: "#DCFCE7",
    tone: "#166534",
    duration: "6–10 weeks",
    validity: "2 years",
    fee: "Subsidised",
    feeLabel: "Fee to applicant",
    open: true,
    subsidised: true,
    cta: "Check eligibility",
    ctaClass: "gold",
    secondaryLabel: "Eligibility",
  },
  {
    id: "iso14001",
    code: "ISO 14001:2015",
    title: "Environmental management systems — Certification",
    body: "Demonstrate control over your environmental impact and compliance obligations. Increasingly requested by mining, agro-processing, and construction buyers in the SADC region.",
    chip: "Management system",
    accent: "#0E7C7B",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
    duration: "8–14 weeks",
    validity: "3 years",
    fee: "SZL 20k – 50k",
    open: true,
    cta: "Start application",
    secondaryLabel: "Checklist",
  },
  {
    id: "iso45001",
    code: "ISO 45001:2018",
    title: "Occupational health & safety — Certification",
    body: "The international benchmark for workplace safety. Required for many mining, construction and industrial contracts, and increasingly for public tenders.",
    chip: "Management system",
    accent: "#7C3AED",
    tint: "#F0E9FB",
    tone: "#7C3AED",
    duration: "8–14 weeks",
    validity: "3 years",
    fee: "SZL 20k – 50k",
    open: true,
    cta: "Start application",
    secondaryLabel: "Checklist",
  },
];

export async function listApplications(status?: string): Promise<CertificationApplication[]> {
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await apiFetch<{ items: CertificationApplication[] }>(
      `/certification/applications${qs}`,
    );
    return res.items ?? [];
  } catch {
    return [
      {
        id: "CERT-0042",
        scheme: "Product Certification",
        applicant: "Demo Applicant",
        status: "Submitted",
      },
    ];
  }
}

export async function getApplication(id: string): Promise<CertificationApplication> {
  try {
    return await apiFetch<CertificationApplication>(`/certification/applications/${id}`);
  } catch {
    return {
      id,
      scheme: "Product Certification",
      applicant: "Demo Applicant",
      status: "In review",
    };
  }
}

export async function createApplication(scheme: string): Promise<CertificationApplication> {
  // TODO: wire real — confirm-before-commit
  try {
    return await apiFetch<CertificationApplication>("/certification/applications", {
      method: "POST",
      body: JSON.stringify({ scheme, confirm: true }),
    });
  } catch {
    return {
      id: `CERT-${Date.now().toString(36).toUpperCase()}`,
      scheme,
      applicant: "You",
      status: "Draft",
    };
  }
}

/** Account workspace — issued certificates for the active entity. */
export type Certificate = {
  id: string;
  scheme: string;
  holder: string;
  status: string;
  issued_on?: string;
  expires_on?: string;
  number?: string;
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
