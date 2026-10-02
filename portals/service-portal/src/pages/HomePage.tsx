import { useEffect } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  Icon,
  SvcBandArt,
  AiCardArt,
  useUpdates,
  type IconName,
  type UpdateItem,
} from "@eswasaone/shared-ui";
import type { LayoutOutletContext } from "../layout/ServiceLayout";
import {
  featuredMetaLine,
  pathForGoalQuery,
  getGoalBySlug,
} from "../goals/catalogue";

const HERO_STATS = [
  { value: "312", label: "Standards published" },
  { value: "148", label: "Companies certified" },
  { value: "2,840", label: "Learners enrolled" },
  { value: "430", label: "Exporters assisted" },
] as const;

const HERO_TRUST = [
  { icon: "i-check-c" as IconName, label: "ISO correspondent member" },
  { icon: "i-check-c" as IconName, label: "SADCSTAN affiliate" },
  { icon: "i-check-c" as IconName, label: "WTO/TBT enquiry point" },
] as const;

type ServiceItem = { label: string; meta: string };

const SERVICES: {
  title: string;
  body: string;
  to: string;
  pill: string;
  tint: string;
  tone: string;
  ig: string;
  icon: IconName;
  items: ServiceItem[];
}[] = [
  {
    title: "Standards & E-Store",
    body: "Buy the SZNS standards your sector needs — delivered as a secured PDF.",
    to: "/standards",
    pill: "312 standards",
    tint: "#ECEEFC",
    tone: "#313391",
    ig: "linear-gradient(145deg,#4A5F9E 0%,#313391 55%,#24286F 100%)",
    icon: "i-book",
    items: [
      { label: "SZNS 060 — Honey specification", meta: "SZL 280" },
      { label: "SZNS 042 — Bottled drinking water", meta: "SZL 240" },
      { label: "SZNS 001 — Product labelling", meta: "SZL 180" },
    ],
  },
  {
    title: "Certification",
    body: "Get your product or management system certified by ESWASA.",
    to: "/certification",
    pill: "148 certified",
    tint: "#E3F4E9",
    tone: "#15803D",
    ig: "linear-gradient(145deg,#4ADE80 0%,#16A34A 50%,#15803D 100%)",
    icon: "i-badge",
    items: [
      { label: "ISO 9001 — Quality management", meta: "6–12 wk" },
      { label: "ISO 22000 — Food safety", meta: "8–14 wk" },
      { label: "SZNS Product Mark — local goods", meta: "4–8 wk" },
    ],
  },
  {
    title: "Export Guidance",
    body: "Market-access requirements broken down by product and destination.",
    to: "/export",
    pill: "45+ markets",
    tint: "#E8EEFB",
    tone: "#1E3A8A",
    ig: "linear-gradient(145deg,#38BDF8 0%,#2563EB 50%,#1E3A8A 100%)",
    icon: "i-globe",
    items: [
      { label: "Honey → European Union", meta: "5 steps" },
      { label: "Beef → SACU region", meta: "4 steps" },
      { label: "Sugar → United Kingdom", meta: "3 steps" },
    ],
  },
  {
    title: "Training & Courses",
    body: "Standards-based training with a verifiable digital certificate.",
    to: "/training",
    pill: "24 courses",
    tint: "#F0E9FB",
    tone: "#7C3AED",
    ig: "linear-gradient(145deg,#C4B5FD 0%,#8B5CF6 50%,#7C3AED 100%)",
    icon: "i-cap",
    items: [
      { label: "HACCP — Food safety", meta: "3 days" },
      { label: "ISO 9001 — Internal auditor", meta: "5 days" },
      { label: "Good manufacturing practice", meta: "2 days" },
    ],
  },
  {
    title: "Standards Applicability",
    body: "Not sure which standard applies to your product? Run the free checker.",
    to: "/applicability",
    pill: "Free tool",
    tint: "#E0F2FE",
    tone: "#0369A1",
    ig: "linear-gradient(145deg,#7DD3FC 0%,#0EA5E9 50%,#0369A1 100%)",
    icon: "i-shield",
    items: [
      { label: "Product → standard mapping", meta: "2 min" },
      { label: "Free — no account needed", meta: "Instant" },
      { label: "Save results to your profile", meta: "Optional" },
    ],
  },
  {
    title: "Complaints & Enquiries",
    body: "Report substandard products or submit a quality enquiry to our team.",
    to: "/complaints",
    pill: "Tracked reference",
    tint: "#FEF3C7",
    tone: "#B45309",
    ig: "linear-gradient(145deg,#FCD34D 0%,#F59E0B 50%,#B45309 100%)",
    icon: "i-alert-c",
    items: [
      { label: "Report unsafe or substandard food", meta: "24–48 hr" },
      { label: "Report counterfeit goods", meta: "24–48 hr" },
      { label: "General standards enquiry", meta: "2–3 days" },
    ],
  },
];

/** AI band cards — larger feature cards for the AI & Technology section. */
const AI_CARDS: {
  title: string;
  body: string;
  href: string;
  eyebrow: string;
  band: string;
  dot: string;
  btnBg: string;
  art: "standards" | "lab";
  items: ServiceItem[];
  statusLabel: string;
  statusType: "live" | "soon";
  goLabel: string;
}[] = [
  {
    title: "AI & Technology Standards",
    body: "National standards for AI systems, algorithms, data, and digital trust — aligned with ISO/IEC JTC 1/SC 42 and the EU AI Act. Drafted with industry, academia and civil society, and open for public comment.",
    href: "/ai-tech/standards",
    eyebrow: "Standards Development",
    band: "linear-gradient(135deg,#4F46E5 0%,#3730A3 60%,#1E1B4B 100%)",
    dot: "#4F46E5",
    btnBg: "#4F46E5",
    art: "standards",
    items: [
      { label: "SZNS AI 001 — AI governance & risk", meta: "Draft" },
      { label: "SZNS AI 002 — Algorithmic transparency", meta: "Draft" },
      { label: "SZNS AI 003 — Training data quality", meta: "Review" },
    ],
    statusLabel: "Framework published",
    statusType: "live",
    goLabel: "Explore standards",
  },
  {
    title: "AI & Technology Testing Lab",
    body: "Independent testing for AI models, software, and digital systems against national and international standards. Fairness audits, robustness testing, software conformity, and structured assurance reports — accredited to ISO/IEC 17025.",
    href: "/ai-tech/lab",
    eyebrow: "Conformity Assessment",
    band: "linear-gradient(135deg,#8B5CF6 0%,#6D28D9 60%,#3B0764 100%)",
    dot: "#8B5CF6",
    btnBg: "#8B5CF6",
    art: "lab",
    items: [
      { label: "AI fairness & bias audit", meta: "2 weeks" },
      { label: "Software conformity testing", meta: "1–3 weeks" },
      { label: "Cybersecurity & data protection audit", meta: "2–4 weeks" },
    ],
    statusLabel: "Lab accepting clients",
    statusType: "live",
    goLabel: "Book a test",
  },
];

const TRUST_ITEMS: {
  icon: IconName;
  title: string;
  desc: string;
}[] = [
  { icon: "i-globe", title: "ISO correspondent", desc: "Full voting and drafting participation" },
  { icon: "i-shield-c", title: "SADCSTAN member", desc: "Harmonised standards across SADC" },
  { icon: "i-scroll", title: "WTO/TBT enquiry point", desc: "Official notification authority for Eswatini" },
  { icon: "i-check-c", title: "ISO/IEC 17025 labs", desc: "Four accredited testing laboratories" },
  { icon: "i-chip", title: "First AI framework", desc: "One of five African nations with national AI standards" },
];

/** Curated featured goals for the hero (3, in display order). */
const HERO_FEATURED_SLUGS = ["export-honey-eu", "iso-9001", "test-ai-model"];

const HERO_FEATURED_IG: Record<string, string> = {
  "export-honey-eu": "linear-gradient(145deg,#4A52B0 0%,#313391 100%)",
  "iso-9001": "linear-gradient(145deg,#22C55E 0%,#15803D 100%)",
  "test-ai-model": "linear-gradient(145deg,#8B5CF6 0%,#4F46E5 100%)",
};

export function HomePage() {
  const { showHeroAsk, openDock } = useOutletContext<LayoutOutletContext>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: updates, loading: updatesLoading } = useUpdates(6);

  // Legacy `/?goal=` → routable guide page (Home never stacks steps)
  useEffect(() => {
    const g = params.get("goal");
    if (g) {
      navigate(pathForGoalQuery(g), { replace: true });
    }
  }, [params, navigate]);

  const heroGoals = HERO_FEATURED_SLUGS.map((slug) => getGoalBySlug(slug)).filter(
    (g): g is NonNullable<typeof g> => Boolean(g),
  );

  return (
    <>
      {/* 1. Announcement ribbon */}
      <aside className="ribbon" aria-label="New service announcement">
        <span className="ribbon__tag">New</span>
        <span className="ribbon__copy">
          <b>AI &amp; Technology Standards</b> and the{" "}
          <b>AI &amp; Technology Testing Lab</b> are now open. Eswatini is one of
          the first African nations to publish a national AI standards framework.
        </span>
        <Link className="ribbon__cta" to="/ai-tech">
          Read the framework <Icon name="i-cright" />
        </Link>
      </aside>

      {/* 2. Hero */}
      {showHeroAsk ? (
        <section className="hero" aria-labelledby="heroTitle">
          <div className="hero__inner">
            <div className="hero__copy">
              <span className="hero__label">ESWATINI STANDARDS AUTHORITY</span>
              <h1 id="heroTitle">
                The standards body for everything Eswatini makes, exports and now
                codes.
              </h1>
              <p className="hero__sub">
                Buy a standard, certify a product, test an AI model, or clear an
                export. Pick a common goal below, or ask Esi anything — she&apos;ll
                map the steps and the cost.
              </p>
              <div className="hero__trust" aria-label="Trust markers">
                {HERO_TRUST.map((m) => (
                  <span key={m.label}>
                    <Icon name={m.icon} /> {m.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="goals" role="region" aria-label="Popular goals">
              <span className="goals__lbl">Popular goals</span>
              {heroGoals.map((p) => {
                const ig = HERO_FEATURED_IG[p.slug] || "linear-gradient(145deg,#60A5FA 0%,#1D4ED8 100%)";
                return (
                  <Link
                    key={p.slug}
                    className="goal"
                    to={`/goals/${p.slug}`}
                    style={{ ["--ig" as string]: ig }}
                  >
                    <span className="goal__ic" aria-hidden="true">
                      <Icon name={p.icon} />
                    </span>
                    <span className="goal__body">
                      <b>{p.title}</b>
                      <span>{featuredMetaLine(p)}</span>
                    </span>
                    <span className="goal__go" aria-hidden="true">
                      <Icon name="i-cright" />
                    </span>
                  </Link>
                );
              })}
              <Link to="/goals" className="goals__ask">
                Browse all goals
                <Icon name="i-cright" />
              </Link>
              <button type="button" className="goals__ask goals__ask--ghost" onClick={openDock}>
                Or ask Esi anything
                <Icon name="i-cright" />
              </button>
            </div>
          </div>

          <div className="hero__stats">
            {HERO_STATS.map((s) => (
              <div key={s.label} className="hstat">
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. AI & Technology feature band */}
      <section className="ai-band" aria-labelledby="aiBandTitle">
        <div className="ai-band__head">
          <div>
            <h2 id="aiBandTitle">
              AI &amp; Emerging technology
              <span className="new">New</span>
            </h2>
            <p>
              Eswatini now sets its own standards for artificial intelligence, and
              runs an independent lab to test AI systems, software and digital
              infrastructure. One makes the rules — the other checks them.
            </p>
          </div>
          <div className="r">
            <Link to="/ai-tech">
              Full programme <Icon name="i-cright" />
            </Link>
          </div>
        </div>

        <div className="ai-grid">
          {AI_CARDS.map((card) => (
            <Link
              key={card.title}
              className="ai-card"
              to={card.href}
              style={{
                ["--band" as string]: card.band,
                ["--dot" as string]: card.dot,
                ["--btn-bg" as string]: card.btnBg,
              }}
            >
              <div className="ai-card__band">
                <span className="ai-card__eyebrow">{card.eyebrow}</span>
                <AiCardArt motif={card.art} />
              </div>
              <div className="ai-card__body">
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <ul className="ai-card__items">
                  {card.items.map((it) => (
                    <li key={it.label}>
                      <em>{it.label}</em>
                      <b>{it.meta}</b>
                    </li>
                  ))}
                </ul>
                <div className="ai-card__foot">
                  <span className={`ai-card__status ai-card__status--${card.statusType}`}>
                    {card.statusLabel}
                  </span>
                  <span className="ai-card__go">
                    {card.goLabel} <Icon name="i-cright" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Core services */}
      <div className="sec-head">
        <div>
          <h2>Core services</h2>
          <p>Everything the Authority offers, one click away</p>
        </div>
        <div className="r">
          <Link to="/standards" className="link">
            All services <Icon name="i-cright" />
          </Link>
        </div>
      </div>

      <section className="services" aria-label="Core services">
        {SERVICES.map((svc) => (
          <Link
            key={svc.title}
            className="svc"
            to={svc.to}
            style={{
              ["--tint" as string]: svc.tint,
              ["--tone" as string]: svc.tone,
              ["--ig" as string]: svc.ig,
            }}
          >
            <span className="svc__band" aria-hidden="true">
              <span className="svc__ic">
                <Icon name={svc.icon} />
              </span>
              <SvcBandArt motif={svc.icon} />
            </span>
            <div className="svc__body">
              <h3>{svc.title}</h3>
              <p>{svc.body}</p>
              <ul className="svc__items">
                {svc.items.map((it) => (
                  <li key={it.label}>
                    <em>{it.label}</em>
                    <b>{it.meta}</b>
                  </li>
                ))}
              </ul>
              <div className="svc__foot">
                <span className="svc__meta">{svc.pill}</span>
                <span className="svc__go">
                  <Icon name="i-cright" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* 5. Trust strip */}
      <section className="trust" aria-labelledby="trustTitle">
        <div className="trust__head">
          <div>
            <h2 id="trustTitle">Why work with ESWASA</h2>
            <p>
              Eswatini&apos;s national standards body — recognised regionally and
              internationally
            </p>
          </div>
        </div>
        <div className="trust__grid">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="trust__item">
              <span className="trust__item__ic">
                <Icon name={item.icon} />
              </span>
              <b>{item.title}</b>
              <span>{item.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Latest updates — API-backed */}
      <section className="updates" aria-labelledby="updatesTitle">
        <div className="updates__head">
          <div>
            <h2 id="updatesTitle">Latest updates</h2>
            <p>New standards, public reviews and programme announcements</p>
          </div>
          <Link to="/standards">
            All updates <Icon name="i-cright" />
          </Link>
        </div>

        <div className="updates__grid">
          {updatesLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="upd" style={{ opacity: 0.5 }}>
                  <div className="upd__top">
                    <span className="upd__tag upd__tag--new">Loading</span>
                  </div>
                  <h3>Loading updates…</h3>
                  <p>&nbsp;</p>
                </div>
              ))}
            </>
          ) : updates && updates.length > 0 ? (
            updates.slice(0, 3).map((u) => <UpdateCard key={u.id} item={u} />)
          ) : (
            <div className="upd">
              <p>No updates available right now. Check back soon.</p>
            </div>
          )}
        </div>
      </section>

      {/* 7. Support CTA */}
      <section className="support">
        <div className="support__copy">
          <span>NOT SURE WHERE TO START?</span>
          <h2>Tell us what you&apos;re working on — we&apos;ll map the path.</h2>
          <p>
            Esi knows the full ESWASA catalogue — every standard, scheme and course.
            Describe your product, export destination, or AI system and she&apos;ll
            point you to the right service, or connect you with the desk that can
            help.
          </p>
        </div>
        <div className="support__actions">
          <button type="button" className="btn gold" onClick={openDock}>
            <Icon name="i-spark" /> Ask Esi
          </button>
          <a className="btn ghost" href="mailto:info@eswasa.co.sz">
            <Icon name="i-send" /> Email ESWASA
          </a>
        </div>
      </section>
    </>
  );
}

/** Single update card — rendered from API data. */
function UpdateCard({ item }: { item: UpdateItem }) {
  const tagClass = `upd__tag upd__tag--${item.tag}`;
  const footIcon = item.foot_icon as IconName;
  return (
    <Link className="upd" to={item.href}>
      <div className="upd__top">
        <span className={tagClass}>{item.tag}</span>
        <time className="upd__date">{formatDate(item.date)}</time>
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <div className="upd__foot">
        <span>
          <Icon name={footIcon} /> {item.foot_label}
        </span>
        <span className="upd__arrow">
          <Icon name="i-cright" />
        </span>
      </div>
    </Link>
  );
}

/** Format an ISO date string as "22 Sep 2026". */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}