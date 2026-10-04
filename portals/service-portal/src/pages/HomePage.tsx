import { useEffect } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  Icon,
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
  icon: IconName;
  /** Photo for the card header (public/img, see CREDITS.md). */
  img: string;
  items: ServiceItem[];
}[] = [
  {
    title: "Standards & E-Store",
    body: "Buy the SZNS standards your sector needs — delivered as a secured PDF.",
    to: "/standards",
    pill: "312 standards",
    icon: "i-book",
    img: "/img/standards.webp",
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
    icon: "i-badge",
    img: "/img/certified.webp",
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
    icon: "i-globe",
    img: "/img/industry.webp",
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
    icon: "i-cap",
    img: "/img/training.webp",
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
    icon: "i-shield",
    img: "/img/crafts.webp",
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
    icon: "i-alert-c",
    img: "/img/mbabane-street.webp",
    items: [
      { label: "Report unsafe or substandard food", meta: "24–48 hr" },
      { label: "Report counterfeit goods", meta: "24–48 hr" },
      { label: "General standards enquiry", meta: "2–3 days" },
    ],
  },
];

/** Light/dark checkerboard for the 3-column services grid. */
const SERVICE_VARIANT = ["tint", "dark", "tint", "dark", "tint", "dark"] as const;

/** AI band cards — larger feature cards for the AI & Technology section. */
const AI_CARDS: {
  title: string;
  body: string;
  href: string;
  eyebrow: string;
  icon: IconName;
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
    icon: "i-scroll",
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
    icon: "i-flask",
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

/** Eswatini photos for the featured-goal cards (public/img, see CREDITS.md). */
const HERO_FEATURED_IMG: Record<string, string> = {
  "export-honey-eu": "/img/farmland.webp",
  "iso-9001": "/img/mbabane.webp",
  "test-ai-model": "/img/rstp-wide.webp",
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
      {/* 1. Photo hero */}
      {showHeroAsk ? (
        <section className="eg-hero bleed" aria-labelledby="heroTitle">
          <div className="eg-hero__in">
            <span className="eg-hero__label">ESWATINI STANDARDS AUTHORITY</span>
            <h1 id="heroTitle">
              The standards body for everything Eswatini makes, exports and now
              codes.
            </h1>
            <p className="eg-hero__sub">
              Buy a standard, certify a product, test an AI model, or clear an
              export. Pick a common goal below, or ask Esi anything — she&apos;ll
              map the steps and the cost.
            </p>
            <div className="eg-hero__actions">
              <Link to="/goals" className="eg-btn eg-btn--gold">
                Browse all goals
              </Link>
              <button type="button" className="eg-btn eg-btn--ghost" onClick={openDock}>
                Or ask Esi anything
              </button>
            </div>
            <div className="eg-hero__trust" aria-label="Trust markers">
              {HERO_TRUST.map((m) => (
                <span key={m.label}>
                  <Icon name={m.icon} /> {m.label}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 2. Service tiles overlapping the hero + announcement band */}
      <section className="eg-quick bleed" aria-label="Core services">
        <div className="eg-quick__in">
          <nav className="eg-tiles" aria-label="Services">
            {SERVICES.map((svc) => (
              <Link key={svc.title} className="eg-tile" to={svc.to}>
                <span className="eg-tile__ic" aria-hidden="true">
                  <Icon name={svc.icon} size={48} />
                </span>
                <b>{svc.title}</b>
              </Link>
            ))}
          </nav>
          <aside className="eg-band" aria-label="New service announcement">
            <span className="eg-band__tag">New</span>
            <p>
              <b>AI &amp; Technology Standards</b> and the{" "}
              <b>AI &amp; Technology Testing Lab</b> are now open. Eswatini is one of
              the first African nations to publish a national AI standards framework.
            </p>
            <Link className="eg-band__cta" to="/ai-tech">
              Read the framework
            </Link>
          </aside>
        </div>
      </section>

      {/* 3. Counters */}
      <section className="eg-stats bleed" aria-label="ESWASA in numbers">
        <div className="eg-sec__in eg-stats__grid">
          {HERO_STATS.map((s) => (
            <div key={s.label} className="eg-stat">
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Popular goals — photo cards */}
      <section className="eg-sec eg-sec--alt bleed" aria-labelledby="goalsTitle">
        <div className="eg-sec__in">
          <div className="eg-head">
            <h2 id="goalsTitle">
              Let&apos;s explore popular goals,
              <br /> guides &amp; services.
            </h2>
            <Link to="/goals" className="eg-btn eg-btn--navy">
              Browse all goals
            </Link>
          </div>
          <div className="eg-photos">
            {heroGoals.map((p) => (
              <Link key={p.slug} className="eg-photo" to={`/goals/${p.slug}`}>
                <span className="eg-photo__img">
                  <img
                    src={HERO_FEATURED_IMG[p.slug] || "/img/mbabane.webp"}
                    alt=""
                    loading="lazy"
                  />
                </span>
                <span className="eg-photo__label">
                  <b>{p.title}</b>
                  <span>{featuredMetaLine(p)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 5. AI & Technology — split feature + cards */}
      <section className="eg-sec bleed" aria-labelledby="aiBandTitle">
        <div className="eg-sec__in">
          <div className="eg-split">
            <div className="eg-split__copy">
              <span className="eg-eyebrow">New</span>
              <h2 id="aiBandTitle">AI &amp; Emerging technology</h2>
              <p>
                Eswatini now sets its own standards for artificial intelligence, and
                runs an independent lab to test AI systems, software and digital
                infrastructure. One makes the rules — the other checks them.
              </p>
              <Link to="/ai-tech" className="eg-btn eg-btn--navy">
                Full programme <Icon name="i-cright" />
              </Link>
            </div>
            <div className="eg-split__img">
              <img
                src="/img/rstp.webp"
                alt="Royal Science and Technology Park, Eswatini"
                loading="lazy"
              />
            </div>
          </div>

          <div className="ai-grid">
            {AI_CARDS.map((card, i) => (
              <Link
                key={card.title}
                className={`ncard ncard--${i % 2 === 0 ? "light" : "dark"} ai-ncard`}
                to={card.href}
              >
                <span className="ncard__ic" aria-hidden="true">
                  <Icon name={card.icon} size={44} />
                </span>
                <span className="ncard__eyebrow">{card.eyebrow}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <ul className="ncard__items">
                  {card.items.map((it) => (
                    <li key={it.label}>
                      <em>{it.label}</em>
                      <b>{it.meta}</b>
                    </li>
                  ))}
                </ul>
                <span className={`ncard__status ncard__status--${card.statusType}`}>
                  {card.statusLabel}
                </span>
                <NotchButton label={card.goLabel} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Core services — photo cards */}
      <section className="eg-sec eg-sec--alt bleed" aria-labelledby="svcTitle">
        <div className="eg-sec__in">
          <div className="eg-head">
            <div>
              <h2 id="svcTitle">Core services</h2>
              <p>Everything the Authority offers, one click away</p>
            </div>
            <Link to="/standards" className="eg-btn eg-btn--navy">
              All services
            </Link>
          </div>
          <div className="services">
            {SERVICES.map((svc, i) => (
              <Link
                key={svc.title}
                className={`svc ncard ncard--${SERVICE_VARIANT[i]}`}
                to={svc.to}
              >
                <span className="svc__photo" aria-hidden="true">
                  <img src={svc.img} alt="" />
                  <span className="svc__ic">
                    <Icon name={svc.icon} />
                  </span>
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
                  <span className="svc__meta">{svc.pill}</span>
                </div>
                <NotchButton label="Explore more" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Trust strip */}
      <section className="eg-sec bleed" aria-labelledby="trustTitle">
        <div className="eg-sec__in">
          <div className="eg-head eg-head--center">
            <div>
              <h2 id="trustTitle">Why work with ESWASA</h2>
              <p>
                Eswatini&apos;s national standards body — recognised regionally and
                internationally
              </p>
            </div>
          </div>
          <div className="eg-trust">
            {TRUST_ITEMS.map((item) => (
              <div key={item.title} className="eg-trust__item">
                <span className="eg-trust__ic">
                  <Icon name={item.icon} />
                </span>
                <b>{item.title}</b>
                <span>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Latest updates — API-backed */}
      <section className="eg-sec eg-sec--alt bleed" aria-labelledby="updatesTitle">
        <div className="eg-sec__in">
          <div className="eg-head">
            <div>
              <h2 id="updatesTitle">Latest updates</h2>
              <p>New standards, public reviews and programme announcements</p>
            </div>
            <Link to="/standards" className="eg-btn eg-btn--navy">
              All updates
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
        </div>
      </section>

      {/* 9. Support CTA — photo band */}
      <section className="eg-cta bleed">
        <div className="eg-sec__in eg-cta__in">
          <div className="eg-cta__copy">
            <span>NOT SURE WHERE TO START?</span>
            <h2>Tell us what you&apos;re working on — we&apos;ll map the path.</h2>
            <p>
              Esi knows the full ESWASA catalogue — every standard, scheme and course.
              Describe your product, export destination, or AI system and she&apos;ll
              point you to the right service, or connect you with the desk that can
              help.
            </p>
          </div>
          <div className="eg-cta__actions">
            <button type="button" className="eg-btn eg-btn--gold" onClick={openDock}>
              <Icon name="i-spark" /> Ask Esi
            </button>
            <a className="eg-btn eg-btn--ghost" href="mailto:info@eswasa.co.sz">
              <Icon name="i-send" /> Email ESWASA
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Bottom-left notch CTA: a pill that sits in a cut-out of the card, the
 * cut-out filled with the section background (see .notch in egov.css).
 */
function NotchButton({ label }: { label: string }) {
  return (
    <span className="notch">
      <span className="notch__btn">
        {label}
        <span className="notch__chev" aria-hidden="true">
          <Icon name="i-cright" size={14} />
          <Icon name="i-cright" size={14} />
        </span>
      </span>
    </span>
  );
}

/** Single update card — rendered from API data. */
function UpdateCard({ item }: { item: UpdateItem }) {
  const tagClass = `upd__tag upd__tag--${item.tag}`;
  const footIcon = item.foot_icon as IconName;
  return (
    <Link className="upd ncard ncard--tint" to={item.href}>
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
      </div>
      <NotchButton label="Read more" />
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