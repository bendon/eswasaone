import { apiFetch } from "@eswasaone/shared-ui";

export type StandardSummary = {
  code: string;
  title: string;
  sector?: string;
  status?: string;
  buy_url?: string;
  year?: number;
  price?: string;
  abstract?: string;
};

const FALLBACK: StandardSummary[] = [
  {
    code: "SZNS 060",
    title: "Honey — Specification",
    sector: "Food",
    status: "Current",
    year: 2021,
    price: "SZL 280",
    abstract:
      "Specifies requirements for moisture content, HMF, sugar profile, and contaminant limits for locally produced and imported honey. Aligned with Codex CXS 12-1981.",
    buy_url: "/estore/SZNS-060",
  },
  {
    code: "SZNS ISO 9001",
    title: "Quality management systems — Requirements",
    sector: "Management",
    status: "Current",
    year: 2015,
    price: "SZL 420",
    abstract:
      "Adopted from ISO 9001:2015. Specifies requirements for a quality management system where an organisation needs to demonstrate consistent products and services.",
    buy_url: "/estore/SZNS-ISO-9001",
  },
  {
    code: "SZNS 042",
    title: "Code of practice for dairy processing",
    sector: "Food",
    status: "Current",
    year: 2019,
    price: "SZL 340",
    abstract:
      "Requirements for the hygienic production, processing, packaging, and storage of milk and milk products. Includes HACCP prerequisites.",
    buy_url: "/estore/SZNS-042",
  },
  {
    code: "SZNS 001",
    title: "General requirements for product labelling",
    sector: "Food",
    status: "Current",
    year: 2018,
    price: "SZL 180",
    abstract:
      "Requirements for the labelling of pre-packaged goods — including mandatory information, allergen declaration, and language requirements for products sold in Eswatini.",
    buy_url: "/estore/SZNS-001",
  },
  {
    code: "SZNS ISO 22000",
    title: "Food safety management systems — Requirements",
    sector: "Management",
    status: "Current",
    year: 2018,
    price: "SZL 460",
    abstract:
      "Adopted from ISO 22000:2018. Requirements for a food safety management system throughout the food chain.",
    buy_url: "/estore/SZNS-ISO-22000",
  },
  {
    code: "SZNS 187",
    title: "Bottled drinking water — Specification",
    sector: "Environment",
    status: "Current",
    year: 2020,
    price: "SZL 240",
    abstract:
      "Physical, chemical, and microbiological requirements for bottled drinking water produced or sold in Eswatini.",
    buy_url: "/estore/SZNS-187",
  },
];

function enrich(item: StandardSummary): StandardSummary {
  const hit = FALLBACK.find(
    (f) => f.code.toLowerCase() === item.code.toLowerCase() || slug(f.code) === slug(item.code),
  );
  return hit ? { ...hit, ...item } : item;
}

export function slug(code: string): string {
  return code.replace(/\s+/g, "-").replace(/\//g, "-");
}

export function matchId(code: string, id: string): boolean {
  return slug(code).toLowerCase() === id.toLowerCase() || code.toLowerCase() === id.toLowerCase();
}

export async function listStandards(q?: string, sector?: string): Promise<StandardSummary[]> {
  let items: StandardSummary[] = [];
  try {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (sector) qs.set("sector", sector);
    const path = `/standards${qs.toString() ? `?${qs}` : ""}`;
    const res = await apiFetch<{ items: StandardSummary[] }>(path);
    items = (res.items ?? []).map(enrich);
  } catch {
    /* fall through to fixtures */
  }
  // Merge fixtures so demo deep-links (SZNS-060) always resolve
  const bySlug = new Map(items.map((i) => [slug(i.code).toLowerCase(), i]));
  for (const f of FALLBACK) {
    const key = slug(f.code).toLowerCase();
    if (!bySlug.has(key)) bySlug.set(key, f);
  }
  items = [...bySlug.values()];
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter(
      (i) =>
        i.code.toLowerCase().includes(ql) ||
        i.title.toLowerCase().includes(ql) ||
        (i.abstract || "").toLowerCase().includes(ql),
    );
  }
  if (sector) {
    items = items.filter((i) => (i.sector || "").toLowerCase() === sector.toLowerCase());
  }
  return items;
}

export async function getStandard(id: string): Promise<StandardSummary | null> {
  const items = await listStandards();
  return items.find((i) => matchId(i.code, id)) ?? null;
}
