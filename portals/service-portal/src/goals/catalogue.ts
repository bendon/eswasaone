/** Goals catalogue — cached outcome journeys. // TODO: wire real GET /api/goals */

import type { IconName } from "@eswasaone/shared-ui";
import type { GuideResponse } from "../guide/types";
import honeyGuide from "../mocks/fixtures/guide-honey.json";
import isoGuide from "../mocks/fixtures/guide-iso9001.json";
import waterGuide from "../mocks/fixtures/guide-water.json";

export type GoalCategory =
  | "export"
  | "cert"
  | "mark"
  | "food"
  | "compliance"
  | "training"
  | "ai";

export type GoalFixture = "honey" | "iso9001" | "water";

export type GoalCard = {
  slug: string;
  title: string;
  summary: string;
  categories: GoalCategory[];
  /** Space-separated search tokens */
  tags: string;
  typeLabel: string;
  icon: IconName;
  tint: string;
  tone: string;
  steps: number;
  timeline: string;
  fee?: string;
  cta?: string;
  /** Natural-language goal for Ask / API */
  goal: string;
  fixture?: GoalFixture;
  featured?: boolean;
};

export const GOAL_FILTERS: { id: "all" | GoalCategory; label: string }[] = [
  { id: "all", label: "All goals" },
  { id: "export", label: "Export & trade" },
  { id: "cert", label: "Certification" },
  { id: "mark", label: "Product marks" },
  { id: "food", label: "Food & drink" },
  { id: "compliance", label: "Compliance" },
  { id: "training", label: "Training" },
  { id: "ai", label: "AI & technology" },
];

export const GOALS: GoalCard[] = [
  {
    slug: "export-honey-eu",
    title: "Export honey to the EU",
    summary: "Natural honey (HS 0409): composition standards, testing and EU market rules.",
    categories: ["export", "food"],
    tags: "export honey eu bee",
    typeLabel: "Export",
    icon: "i-globe",
    tint: "#ECEEFC",
    tone: "#313391",
    steps: 5,
    timeline: "4–8 weeks",
    fee: "from SZL 3,200",
    goal: "Export honey to the EU",
    fixture: "honey",
    featured: true,
  },
  {
    slug: "export-beef-sacu",
    title: "Export beef to South Africa",
    summary: "Meet SACU market access, residue monitoring and health-certificate requirements.",
    categories: ["export", "food"],
    tags: "export beef sacu south africa meat",
    typeLabel: "Export",
    icon: "i-globe",
    tint: "#ECEEFC",
    tone: "#313391",
    steps: 6,
    timeline: "6–10 weeks",
    goal: "Export beef to South Africa",
  },
  {
    slug: "export-macadamia-eu",
    title: "Export macadamia to the EU",
    summary: "Aflatoxin limits, traceability and packaging for the European market.",
    categories: ["export"],
    tags: "export macadamia nuts eu",
    typeLabel: "Export",
    icon: "i-globe",
    tint: "#ECEEFC",
    tone: "#313391",
    steps: 5,
    timeline: "5–9 weeks",
    goal: "Export macadamia to the EU",
  },
  {
    slug: "export-textiles-eu",
    title: "Export textiles to the EU",
    summary: "Labelling, chemical (REACH) and packaging compliance for apparel exports.",
    categories: ["export"],
    tags: "export textiles apparel eu",
    typeLabel: "Export",
    icon: "i-globe",
    tint: "#ECEEFC",
    tone: "#313391",
    steps: 6,
    timeline: "6–10 weeks",
    goal: "Export textiles to the EU",
  },
  {
    slug: "iso-9001",
    title: "Get ISO 9001 certified",
    summary: "Quality Management System certification: scope, implement, audit, certify.",
    categories: ["cert"],
    tags: "iso 9001 quality management certified",
    typeLabel: "Certify",
    icon: "i-badge",
    tint: "#DCFCE7",
    tone: "#15803D",
    steps: 5,
    timeline: "10–12 weeks",
    goal: "Get ISO 9001 certified",
    fixture: "iso9001",
    featured: true,
  },
  {
    slug: "iso-22000",
    title: "Get ISO 22000 (food safety)",
    summary: "Food safety management certification with HACCP for producers and processors.",
    categories: ["cert", "food"],
    tags: "iso 22000 food safety certified haccp",
    typeLabel: "Certify",
    icon: "i-badge",
    tint: "#DCFCE7",
    tone: "#15803D",
    steps: 6,
    timeline: "10–14 weeks",
    goal: "Get ISO 22000 food safety certified",
  },
  {
    slug: "iso-14001",
    title: "Get ISO 14001 certified",
    summary: "Environmental management system certification for your operations.",
    categories: ["cert"],
    tags: "iso 14001 environmental certified",
    typeLabel: "Certify",
    icon: "i-badge",
    tint: "#DCFCE7",
    tone: "#15803D",
    steps: 5,
    timeline: "10–14 weeks",
    goal: "Get ISO 14001 certified",
  },
  {
    slug: "iso-45001",
    title: "Get ISO 45001 (OHS)",
    summary: "Occupational health & safety management system certification.",
    categories: ["cert"],
    tags: "iso 45001 occupational health safety certified",
    typeLabel: "Certify",
    icon: "i-badge",
    tint: "#DCFCE7",
    tone: "#15803D",
    steps: 5,
    timeline: "10–14 weeks",
    goal: "Get ISO 45001 certified",
  },
  {
    slug: "sell-bottled-water",
    title: "Sell bottled water locally",
    summary: "Packaged drinking water (SZNS 042): standard, testing, product certification mark.",
    categories: ["mark", "food"],
    tags: "sell bottled water local product mark szns 042",
    typeLabel: "Product mark",
    icon: "i-shield-c",
    tint: "#E0F2FE",
    tone: "#075985",
    steps: 4,
    timeline: "4–6 weeks",
    fee: "from SZL 1,800",
    goal: "Sell bottled water locally",
    fixture: "water",
    featured: true,
  },
  {
    slug: "sell-packaged-food",
    title: "Sell packaged food locally",
    summary: "Labelling, safety and product-mark requirements for the local market.",
    categories: ["mark", "food"],
    tags: "sell packaged food local product mark labelling",
    typeLabel: "Product mark",
    icon: "i-shield-c",
    tint: "#E0F2FE",
    tone: "#075985",
    steps: 5,
    timeline: "4–8 weeks",
    goal: "Sell packaged food locally",
  },
  {
    slug: "sell-cosmetics",
    title: "Sell cosmetics locally",
    summary: "Ingredient, labelling and safety requirements for cosmetic products.",
    categories: ["mark"],
    tags: "sell cosmetics local product mark",
    typeLabel: "Product mark",
    icon: "i-shield-c",
    tint: "#E0F2FE",
    tone: "#075985",
    steps: 5,
    timeline: "5–8 weeks",
    goal: "Sell cosmetics locally",
  },
  {
    slug: "certify-building-materials",
    title: "Certify building materials",
    summary: "Testing and certification for cement, blocks and construction products.",
    categories: ["mark"],
    tags: "certify building construction materials cement",
    typeLabel: "Product mark",
    icon: "i-shield-c",
    tint: "#E0F2FE",
    tone: "#075985",
    steps: 5,
    timeline: "6–10 weeks",
    goal: "Certify building materials",
  },
  {
    slug: "find-standard",
    title: "Find the standard for my product",
    summary: "Not sure what applies? Describe your product and get the exact standards list.",
    categories: ["compliance"],
    tags: "which standard applies to my product applicability",
    typeLabel: "Free tool",
    icon: "i-shield-c",
    tint: "#FEF3C7",
    tone: "#92400E",
    steps: 1,
    timeline: "Instant",
    fee: "Free",
    cta: "Open checker",
    goal: "Find the standard for my product",
  },
  {
    slug: "label-product",
    title: "Label my product correctly",
    summary: "Mandatory labelling, units and claims for your product category.",
    categories: ["compliance"],
    tags: "label my product correctly labelling requirements",
    typeLabel: "Compliance",
    icon: "i-file",
    tint: "#FEF3C7",
    tone: "#92400E",
    steps: 3,
    timeline: "1–2 weeks",
    goal: "Label my product correctly",
  },
  {
    slug: "internal-auditor",
    title: "Become an internal auditor",
    summary: "Certified internal-auditor path: course, assessment and digital certificate.",
    categories: ["training"],
    tags: "become certified internal auditor training iso 9001",
    typeLabel: "Training",
    icon: "i-cap",
    tint: "#F0E9FB",
    tone: "#6D28D9",
    steps: 3,
    timeline: "2–4 weeks",
    goal: "Become an internal auditor",
  },
  {
    slug: "food-safety-training",
    title: "Train my team on food safety",
    summary: "HACCP & food-safety training for your production staff.",
    categories: ["training", "food"],
    tags: "train team food safety haccp course",
    typeLabel: "Training",
    icon: "i-cap",
    tint: "#F0E9FB",
    tone: "#6D28D9",
    steps: 2,
    timeline: "1–2 weeks",
    goal: "Train my team on food safety",
  },
  {
    slug: "test-ai-model",
    title: "Test an AI model for conformity",
    summary: "AI fairness, robustness and conformity testing at the ESWASA AI & Technology Lab.",
    categories: ["ai", "compliance"],
    tags: "test ai model conformity fairness audit lab technology",
    typeLabel: "Compliance",
    icon: "i-chip",
    tint: "#F5F0FF",
    tone: "#6D28D9",
    steps: 3,
    timeline: "2–4 weeks",
    fee: "from SZL 18,500",
    goal: "Test an AI model for conformity",
    featured: true,
  },
];

const FIXTURES: Record<GoalFixture, GuideResponse> = {
  honey: honeyGuide as GuideResponse,
  iso9001: isoGuide as GuideResponse,
  water: waterGuide as GuideResponse,
};

export function getGoalBySlug(slug: string): GoalCard | undefined {
  return GOALS.find((g) => g.slug === slug);
}

export function featuredGoals(): GoalCard[] {
  return GOALS.filter((g) => g.featured);
}

/** Match free-text Ask to a catalogue slug when possible. */
export function matchGoalSlug(text: string): string | undefined {
  const q = text.toLowerCase().trim();
  if (!q) return undefined;
  const exact = GOALS.find((g) => g.goal.toLowerCase() === q || g.title.toLowerCase() === q);
  if (exact) return exact.slug;
  const bySlug = GOALS.find((g) => g.slug === q || g.slug.replace(/-/g, " ") === q);
  if (bySlug) return bySlug.slug;
  // Keyword score
  let best: { slug: string; score: number } | undefined;
  for (const g of GOALS) {
    const hay = `${g.title} ${g.tags} ${g.goal}`.toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);
    const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    if (score >= 2 && (!best || score > best.score)) best = { slug: g.slug, score };
  }
  return best?.slug;
}

/** Where Ask / legacy `?goal=` should navigate. */
export function pathForGoalQuery(text: string): string {
  const slug = matchGoalSlug(text);
  if (slug) return `/goals/${slug}`;
  return `/guide?q=${encodeURIComponent(text.trim())}`;
}

export function relatedGoals(slug: string, limit = 4): GoalCard[] {
  const current = getGoalBySlug(slug);
  if (!current) return GOALS.filter((g) => g.slug !== slug).slice(0, limit);
  const scored = GOALS.filter((g) => g.slug !== slug).map((g) => {
    const overlap = g.categories.filter((c) => current.categories.includes(c)).length;
    return { g, overlap };
  });
  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, limit).map((x) => x.g);
}

/** Curated stub when no fixture yet — keeps Popular/library UX consistent. */
export function stubGuideFromCard(card: GoalCard): GuideResponse {
  if (card.slug === "find-standard") {
    return {
      title: card.title,
      summary: card.summary,
      meta: {
        standards: 0,
        est_fee: "Free",
        est_timeline: "Instant",
        steps: 1,
      },
      steps: [
        {
          title: "Describe your product",
          detail:
            "Open the free applicability checker and tell us what you make or sell. We'll list the exact standards that apply.",
          citations: [{ label: "ESWASA Applicability", url: "/applicability", rights: "public" }],
          action: {
            type: "open",
            label: "Open checker",
            target: "/applicability",
            auth_required: false,
          },
        },
      ],
    };
  }

  const typeSteps: Record<string, GuideResponse["steps"]> = {
    Export: [
      {
        title: "Confirm product classification",
        detail: `Identify the HS code and destination market for “${card.title.toLowerCase()}”. This decides which standards and market rules apply.`,
        citations: [{ label: "WTO HS / TBT", url: "#", rights: "open" }],
        action: null,
      },
      {
        title: "Meet the applicable standard",
        detail: "Comply with the national or regional standard for composition, labelling and safety.",
        citations: [{ label: "ESWASA Standards catalogue", url: "/standards", rights: "public" }],
        action: {
          type: "buy",
          label: "Browse standards",
          target: "catalogue",
          auth_required: true,
          reason: "Buying a standard requires an account so we can license the download to you.",
        },
      },
      {
        title: "Get testing & certification",
        detail: "Submit samples for lab testing, then apply for the relevant product or system certificate.",
        citations: [{ label: "ESWASA Certification", url: "/certification", rights: "public" }],
        action: {
          type: "apply",
          label: "Apply for certification",
          // Export goods need the product mark; the wizard keys on scheme ids.
          target: "product",
          auth_required: true,
          reason: "Applying creates a tracked case under your account.",
        },
      },
      {
        title: "Meet market-access rules",
        detail: "Check residue monitoring, packaging and documentation requirements for the destination market.",
        citations: [{ label: "Export desk", url: "/export", rights: "public" }],
        action: {
          type: "open",
          label: "View export guidance",
          target: "/export",
          auth_required: false,
        },
      },
      {
        title: "Prepare export documentation",
        detail: "Assemble health certificates, traceability records and test reports.",
        citations: [{ label: "ESWASA Export desk", url: "/export", rights: "public" }],
        action: {
          type: "apply",
          label: "Request export review",
          target: "export-review",
          auth_required: true,
          reason: "An export review is tracked under your account.",
        },
      },
    ],
    Certify: [
      {
        title: "Define scope",
        detail: "Confirm sites, processes and products covered by the certification.",
        citations: [{ label: "ESWASA Certification", url: "/certification", rights: "public" }],
        action: null,
      },
      {
        title: "Implement the management system",
        detail: "Document procedures, train staff and run the system for a period before audit.",
        citations: [{ label: "Training catalogue", url: "/training", rights: "public" }],
        action: {
          type: "book",
          label: "Browse training",
          target: "training",
          auth_required: true,
          reason: "Enrolment requires an account.",
        },
      },
      {
        title: "Internal audit & management review",
        detail: "Check readiness with an internal audit before the external assessment.",
        citations: [{ label: "Internal auditor path", url: "/goals/internal-auditor", rights: "public" }],
        action: null,
      },
      {
        title: "Apply for certification",
        detail: "Submit your application and schedule the certification audit.",
        citations: [{ label: "Apply", url: "/certification/apply", rights: "public" }],
        action: {
          type: "apply",
          label: "Start application",
          // "iso-9001" → scheme id "iso9001"
          target: card.slug.replace("-", ""),
          auth_required: true,
          reason: "Applying creates a tracked case under your account.",
        },
      },
      {
        title: "Certification decision",
        detail: "Close any nonconformities; receive your certificate once the decision is issued.",
        citations: [{ label: "Track application", url: "/account/applications", rights: "public" }],
        action: null,
      },
    ],
    "Product mark": [
      {
        title: "Identify the product standard",
        detail: "Confirm which SZNS (or regional) standard applies to your product.",
        citations: [{ label: "Standards catalogue", url: "/standards", rights: "public" }],
        action: {
          type: "buy",
          label: "Buy the standard",
          target: "catalogue",
          auth_required: true,
          reason: "Buying a standard requires an account.",
        },
      },
      {
        title: "Meet composition & labelling rules",
        detail: "Align formulation, packaging and labels with the mandatory requirements.",
        citations: [{ label: "Labelling guide", url: "/goals/label-product", rights: "public" }],
        action: null,
      },
      {
        title: "Submit samples for testing",
        detail: "Send samples to an accredited lab for the required tests.",
        citations: [{ label: "ESWASA Metrology", url: "#", rights: "public" }],
        action: null,
      },
      {
        title: "Apply for the product mark",
        detail: "Lodge your product-certification application with ESWASA.",
        citations: [{ label: "Certification", url: "/certification/apply", rights: "public" }],
        action: {
          type: "apply",
          label: "Apply for product mark",
          target: "product",
          auth_required: true,
          reason: "Applying creates a tracked case under your account.",
        },
      },
    ],
    Compliance: [
      {
        title: "Confirm product category",
        detail: "Identify the category so we can list mandatory labelling rules.",
        citations: [{ label: "Applicability", url: "/applicability", rights: "public" }],
        action: null,
      },
      {
        title: "Review mandatory markings",
        detail: "Units, claims, language and prohibited statements for your category.",
        citations: [{ label: "SZNS labelling", url: "/standards", rights: "licensed" }],
        action: {
          type: "buy",
          label: "Buy labelling standard",
          target: "szns-001",
          auth_required: true,
          reason: "Buying a standard requires an account.",
        },
      },
      {
        title: "Update artwork & packaging",
        detail: "Revise labels and packaging, then re-check before market release.",
        citations: [{ label: "Complaints & enquiries", url: "/complaints", rights: "public" }],
        action: null,
      },
    ],
    Training: [
      {
        title: "Pick the right course",
        detail: "Choose a course that matches your role and the standard you work with.",
        citations: [{ label: "Training catalogue", url: "/training", rights: "public" }],
        action: {
          type: "open",
          label: "Browse courses",
          target: "/training",
          auth_required: false,
        },
      },
      {
        title: "Enrol and complete assessment",
        detail: "Sign in to enrol, finish modules and take the assessment.",
        citations: [{ label: "My training", url: "/account/training", rights: "public" }],
        action: {
          type: "book",
          label: "Enrol",
          target: card.slug,
          auth_required: true,
          reason: "Enrolment requires an account.",
        },
      },
      {
        title: "Receive your digital certificate",
        detail: "Download a verifiable digital certificate when you pass.",
        citations: [{ label: "Verify a certificate", url: "/verify", rights: "public" }],
        action: null,
      },
    ],
  };

  const steps = (typeSteps[card.typeLabel] || typeSteps.Compliance).slice(0, Math.max(card.steps, 2));
  return {
    title: card.title,
    summary: card.summary,
    meta: {
      standards: Math.min(steps.length, 4),
      est_fee: card.fee || "See steps",
      est_timeline: card.timeline,
      steps: steps.length,
    },
    steps,
  };
}

export function cachedGuideForCard(card: GoalCard): GuideResponse {
  if (card.fixture) return FIXTURES[card.fixture];
  return stubGuideFromCard(card);
}

export function featuredMetaLine(card: GoalCard): string {
  const parts = [`${card.steps} steps`, card.timeline];
  if (card.fee) parts.push(card.fee);
  return parts.join(" · ");
}
