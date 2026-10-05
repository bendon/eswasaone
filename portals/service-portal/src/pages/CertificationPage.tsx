import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { SCHEMES, type Scheme } from "../api/certification";
import {
  CERT_DOCUMENTS,
  CHARTER,
  FLOW_LABEL,
  FLOW_STAGES,
  REQUIRED_DOCS,
  type CertFlow,
} from "../certification/flows";
import { SideDrawer } from "../certification/ui";
import { verifyToken, type VerificationResult } from "../api/misc";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { HelpBand } from "../components/HelpBand";
import { OutlineCard } from "../components/OutlineCard";
import { StaggeredGrid } from "../components/StaggeredGrid";
import { safeText } from "../lib/safe";
import { useCartToast } from "../ui/CartToast";

const HERO_STATS = [
  { value: "148", label: "Companies certified" },
  { value: String(SCHEMES.length), label: "Active schemes" },
  { value: "4–14 wk", label: "Typical timeline" },
  { value: "3 yrs", label: "Certificate validity" },
] as const;


type PathCard = {
  to: string;
  title: string;
  body: string;
  count: string;
  countIcon: IconName;
  tag: string;
  cta: string;
  hint: string;
  icon: IconName;
  tint: string;
  tone: string;
};

const PATHS: PathCard[] = [
  {
    to: "/goals/iso-9001",
    title: "First-time exporter pack",
    body: "ISO 9001 plus the relevant product standards and export-desk support: the shortest credible path to your first international shipment.",
    count: "4 steps",
    countIcon: "i-layers",
    tag: "Export",
    cta: "Start path",
    hint: "Ship sooner",
    icon: "i-globe",
    tint: "#ECEEFC",
    tone: "#313391",
  },
  {
    to: "/goals/iso-22000",
    title: "Food processor readiness",
    body: "HACCP first, then ISO 22000, with our internal-auditor training bundled so your team can maintain the system after certification.",
    count: "3 stages",
    countIcon: "i-layers",
    tag: "Food safety",
    cta: "Start path",
    hint: "HACCP first",
    icon: "i-clipboard",
    tint: "#E3F4E9",
    tone: "#15803D",
  },
  {
    to: "/certification/apply?scheme=ingelo",
    title: "MSME starter path",
    body: "For small businesses new to standards. Starts with the Ingelo scheme (subsidised training, testing and assessment), then SZNS Product Mark.",
    count: "Subsidised",
    countIcon: "i-badge",
    tag: "MSME",
    cta: "Start path",
    hint: "Ingelo scheme",
    icon: "i-users",
    tint: "#DCFCE7",
    tone: "#166534",
  },
  {
    to: "/certification/apply?scheme=iso9001",
    title: "Integrated management system",
    body: "ISO 9001, ISO 14001 and ISO 45001 audited together. One integrated audit schedule, three certificates, lower total cost.",
    count: "3 schemes",
    countIcon: "i-layers",
    tag: "Integrated",
    cta: "See the bundle",
    hint: "One audit",
    icon: "i-layers",
    tint: "#F0E9FB",
    tone: "#7C3AED",
  },
  {
    to: "/account/applications",
    title: "Recertification",
    body: "Already certified and coming up to the end of your three-year cycle? Book your recertification audit and keep the certificate continuous.",
    count: "6–10 weeks",
    countIcon: "i-clock",
    tag: "Renewal",
    cta: "Book audit",
    hint: "Stay certified",
    icon: "i-trend",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
  },
  {
    to: "/certification/quote?scheme=iso22000",
    title: "Upgrade from HACCP",
    body: "Already HACCP certified? Bridge to ISO 22000 with a reduced-scope audit. Your existing HACCP plan counts toward the new system.",
    count: "Reduced scope",
    countIcon: "i-trend",
    tag: "Upgrade",
    cta: "Bridge to ISO 22000",
    hint: "Reuse HACCP",
    icon: "i-star",
    tint: "#FEF6DC",
    tone: "#B8860B",
  },
];

type FilterOption = { id: string; label: string; test: (s: Scheme) => boolean };
type FilterGroup = { id: string; label: string; open: boolean; options: FilterOption[] };

function minWeeks(s: Scheme): number {
  const m = s.duration.match(/(\d+)/);
  return m ? Number(m[1]) : 99;
}

function minFee(s: Scheme): number {
  if (s.subsidised) return 0;
  const m = s.fee.match(/(\d+)k/);
  return m ? Number(m[1]) * 1000 : 0;
}

const FILTERS: FilterGroup[] = [
  {
    id: "type",
    label: "Scheme type",
    open: true,
    options: [
      { id: "ms", label: "Management systems", test: (s) => s.flow === "ms" || s.flow === "combined" },
      { id: "product", label: "Product certification", test: (s) => s.flow === "product" || s.flow === "combined" },
      { id: "msme", label: "MSME / Ingelo", test: (s) => s.flow === "ingelo" },
    ],
  },
  {
    id: "sector",
    label: "Sector",
    open: true,
    options: [
      { id: "food", label: "Food & agriculture", test: (s) => s.sectors.includes("food") },
      { id: "all", label: "All industries", test: (s) => s.sectors.includes("all") },
      { id: "construction", label: "Construction", test: (s) => s.sectors.includes("construction") },
      { id: "manufacturing", label: "Manufacturing", test: (s) => s.sectors.includes("manufacturing") },
    ],
  },
  {
    id: "duration",
    label: "Duration",
    open: true,
    options: [
      { id: "lt6", label: "Starts under 6 weeks", test: (s) => minWeeks(s) < 6 },
      { id: "6-10", label: "6 – 10 weeks", test: (s) => minWeeks(s) >= 6 && minWeeks(s) < 10 },
      { id: "10-14", label: "10 weeks or more", test: (s) => minWeeks(s) >= 10 },
    ],
  },
  {
    id: "fee",
    label: "Fee range",
    open: false,
    options: [
      { id: "free", label: "Subsidised / free", test: (s) => !!s.subsidised },
      { id: "lt20", label: "From under SZL 20,000", test: (s) => !s.subsidised && minFee(s) < 20000 },
      { id: "20-50", label: "From SZL 20,000 – 50,000", test: (s) => minFee(s) >= 20000 && minFee(s) < 50000 },
      { id: "gt50", label: "From over SZL 50,000", test: (s) => minFee(s) >= 50000 },
    ],
  },
];

function applyFilters(list: Scheme[], checked: Record<string, boolean>, skipGroup?: string): Scheme[] {
  return list.filter((s) =>
    FILTERS.every((g) => {
      if (g.id === skipGroup) return true;
      const on = g.options.filter((o) => checked[`${g.id}:${o.id}`]);
      return on.length === 0 || on.some((o) => o.test(s));
    }),
  );
}

const PROCESS_TABS: CertFlow[] = ["ms", "product", "ingelo"];

export function CertificationPage() {
  const { user, openAuth } = useAuth();
  const { showToast } = useCartToast();
  const navigate = useNavigate();
  const catalogueRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLElement>(null);
  const verifyInputRef = useRef<HTMLInputElement>(null);

  const [sort, setSort] = useState("popular");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [filterOpen, setFilterOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(FILTERS.map((g) => [g.id, g.open])),
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [processTab, setProcessTab] = useState<CertFlow>("ms");
  const [drawer, setDrawer] = useState<Scheme | null>(null);
  const [verifyValue, setVerifyValue] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);

  const schemes = useMemo(() => {
    const list = applyFilters(SCHEMES, checked);
    if (sort === "code") list.sort((a, b) => a.code.localeCompare(b.code));
    else if (sort === "fastest") {
      list.sort((a, b) => durationRank(a.duration) - durationRank(b.duration));
    } else if (sort === "fee") {
      list.sort((a, b) => feeRank(a) - feeRank(b));
    }
    return list;
  }, [sort, checked]);

  const openCount = schemes.filter((s) => s.open).length;
  const activeFilterCount = Object.values(checked).filter(Boolean).length;

  function scrollToCatalogue() {
    catalogueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToVerify() {
    const el = verifyRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => verifyInputRef.current?.focus({ preventScroll: true }), 280);
  }

  function trackApplication() {
    if (user) {
      navigate("/account/applications");
      return;
    }
    openAuth({
      title: "Sign in to track",
      reason: "See live stage, pending documents, and audit dates for your application.",
      next: "/account/applications",
    });
  }

  function clearFilters() {
    const next: Record<string, boolean> = {};
    for (const g of FILTERS) {
      for (const o of g.options) next[`${g.id}:${o.id}`] = false;
    }
    setChecked(next);
    showToast("Filters cleared");
  }

  function toggleSave(id: string) {
    setSaved((prev) => {
      const on = !prev[id];
      showToast(on ? "Saved to your watchlist" : "Removed from your watchlist");
      return { ...prev, [id]: on };
    });
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    const token = verifyValue.trim();
    if (token.length < 6) return;
    setVerifyBusy(true);
    try {
      setVerifyResult(await verifyToken(token));
    } finally {
      setVerifyBusy(false);
    }
  }

  function startApply(scheme: Scheme) {
    navigate(`/certification/apply?scheme=${encodeURIComponent(scheme.id)}`);
  }

  const filterPanel = (
    <aside className={`sidebar${drawerOpen ? " drawer-open" : ""}`} aria-label="Filters">
      <div className="filterbox">
        <div className="filterbox__head">
          <b>Refine schemes</b>
          <button type="button" onClick={clearFilters}>
            Clear all
          </button>
        </div>
        {FILTERS.map((group) => (
          <div
            key={group.id}
            className="fgroup"
            aria-expanded={filterOpen[group.id] ? "true" : "false"}
          >
            <button
              className="fgroup__head"
              type="button"
              onClick={() =>
                setFilterOpen((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
              }
            >
              {group.label} <Icon name="i-chev" />
            </button>
            <div className="fgroup__list">
              {group.options.map((opt) => (
                <label className="fcheck" key={opt.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(checked[`${group.id}:${opt.id}`])}
                    onChange={() =>
                      setChecked((prev) => ({
                        ...prev,
                        [`${group.id}:${opt.id}`]: !prev[`${group.id}:${opt.id}`],
                      }))
                    }
                  />
                  <span>{opt.label}</span>
                  <em>{applyFilters(SCHEMES, checked, group.id).filter(opt.test).length}</em>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {drawerOpen ? (
        <button type="button" className="filter-apply" onClick={() => setDrawerOpen(false)}>
          Apply filters
        </button>
      ) : null}
    </aside>
  );

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Certification" }]} />

      <section className="page-hero">
        <div className="page-hero__inner">
          <span className="page-hero__label">ESWASAONE · CERTIFICATION</span>
          <h1>Certification that travels with your product.</h1>
          <p>
            Management-system, product, and sector-specific certification issued under ESWASA
            accreditation. Apply in minutes, track your audits, and get a certificate recognised
            by buyers at home and abroad.
          </p>
          <div className="page-hero__actions">
            <button type="button" className="chip-cta gold" onClick={scrollToCatalogue}>
              <Icon name="i-badge" /> Browse schemes
            </button>
            <Link className="chip-cta" to="/certification/quote">
              <Icon name="i-dollar" /> Request a quote
            </Link>
            <button type="button" className="chip-cta" onClick={scrollToVerify}>
              <Icon name="i-eye" /> Verify a certificate
            </button>
          </div>
        </div>
        <div className="page-hero__stats" aria-label="Certification statistics">
          {HERO_STATS.map((s) => (
            <div className="hstat" key={s.label}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="actioncard">
        <div className="actiongrid">
          <button type="button" className="action" onClick={trackApplication}>
            <span className="action__ic" style={{ "--ic-tint": "#ECEEFC", "--ic-tone": "#313391" } as CSSProperties}>
              <Icon name="i-trend" />
            </span>
            <div className="action__body">
              <b>Track your application</b>
              <span>See live stage, pending documents, and audit dates</span>
            </div>
            <span className="action__go">
              <Icon name="i-cright" />
            </span>
          </button>
          <button type="button" className="action" onClick={scrollToVerify}>
            <span className="action__ic" style={{ "--ic-tint": "#DCFCE7", "--ic-tone": "#15803D" } as CSSProperties}>
              <Icon name="i-eye" />
            </span>
            <div className="action__body">
              <b>Verify a certificate</b>
              <span>Check any ESWASA certificate number in seconds</span>
            </div>
            <span className="action__go">
              <Icon name="i-cright" />
            </span>
          </button>
          <button type="button" className="action" onClick={scrollToCatalogue}>
            <span className="action__ic" style={{ "--ic-tint": "#FEF6DC", "--ic-tone": "#B8860B" } as CSSProperties}>
              <Icon name="i-badge" />
            </span>
            <div className="action__body">
              <b>Start a new application</b>
              <span>Pick a scheme and apply. No account required to begin</span>
            </div>
            <span className="action__go">
              <Icon name="i-cright" />
            </span>
          </button>
        </div>
      </div>

      <section
        className="verify-widget"
        id="verify"
        ref={verifyRef}
        aria-labelledby="verifyTitle"
      >
        <div className="verify-widget__copy">
          <span>VERIFY A CERTIFICATE</span>
          <h2 id="verifyTitle">Check any ESWASA certificate.</h2>
          <p>
            Every certificate issued by ESWASA carries a unique number. Enter it below to confirm
            the holder, the scope, and whether the certificate is currently valid.
          </p>
        </div>
        <form className="verify-widget__form" onSubmit={onVerify}>
          <div className="verify-widget__row">
            <label className="sr-only" htmlFor="verifyInput">
              Certificate number
            </label>
            <input
              id="verifyInput"
              ref={verifyInputRef}
              className="verify-widget__input"
              type="text"
              value={verifyValue}
              onChange={(e) => {
                setVerifyValue(e.target.value);
                setVerifyResult(null);
              }}
              placeholder="e.g.  ESWASA-ISO9001-2024-01142"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="verify-widget__submit"
              disabled={verifyBusy || verifyValue.trim().length < 6}
            >
              <Icon name="i-search" /> {verifyBusy ? "Checking…" : "Verify"}
            </button>
          </div>
          <p className="verify-widget__note">
            <Icon name="i-shield" />
            Certificate data is drawn live from the ESWASA register. See also the{" "}
            <Link to="/certification/status">suspended, withdrawn &amp; reduced-scope register</Link>.
          </p>
          {verifyResult ? (
            <div className={`verify-widget__result${verifyResult.valid ? " ok" : ""}`}>
              {verifyResult.valid
                ? `Valid: ${safeText(verifyResult.subject || verifyResult.token)}`
                : `Not found: ${safeText(verifyResult.token)}`}
            </div>
          ) : null}
        </form>
      </section>

      {drawerOpen ? (
        <button
          type="button"
          className="filter-backdrop"
          aria-label="Close filters"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className="catalogue" id="catalogue" ref={catalogueRef}>
        {filterPanel}

        <div>
          <div className="toolbar">
            <span className="toolbar__count">
              {schemes.length} certification schemes <span>· {openCount} open now</span>
            </span>
            <button
              type="button"
              className="toolbar__mobile-filter"
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="i-sliders" /> Filters
              <span className="badge">{activeFilterCount}</span>
            </button>
            <div className="toolbar__spacer" />
            <div className="toolbar__sort">
              <label htmlFor="certSort">Sort</label>
              <select id="certSort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="popular">Most popular</option>
                <option value="fastest">Fastest to certify</option>
                <option value="fee">Lowest fee first</option>
                <option value="code">Code A–Z</option>
              </select>
            </div>
          </div>

          <ul className="certlist">
            {schemes.map((s) => (
              <li
                key={s.id}
                className="cert"
                style={
                  {
                    "--accent": s.accent,
                    "--chip-tint": s.tint,
                    "--chip-tone": s.tone,
                  } as CSSProperties
                }
              >
                <div className="cert__top">
                  <span className="cert__chip">{s.chip}</span>
                  <span className="cert__code">{safeText(s.code)}</span>
                  <button
                    type="button"
                    className={`cert__save${saved[s.id] ? " is-saved" : ""}`}
                    aria-label="Save"
                    onClick={() => toggleSave(s.id)}
                  >
                    <Icon name="i-heart" />
                  </button>
                </div>
                <h2 className="cert__title">
                  <Link to={`/certification/apply?scheme=${encodeURIComponent(s.id)}`}>
                    {safeText(s.title)}
                  </Link>
                </h2>
                <p className="cert__abstract">{safeText(s.body)}</p>
                <dl className="cert__facts">
                  <div className="cert__fact">
                    <dt>Duration</dt>
                    <dd>{s.duration}</dd>
                  </div>
                  <div className="cert__fact">
                    <dt>Certificate validity</dt>
                    <dd>{s.validity}</dd>
                  </div>
                  <div className="cert__fact">
                    <dt>{s.feeLabel || "Fee range"}</dt>
                    <dd className="mono">{s.fee}</dd>
                  </div>
                </dl>
                <div className="cert__foot">
                  <span className={`cert__badge${s.subsidised ? " subsidised" : ""}`}>
                    <Icon name={s.subsidised ? "i-star" : "i-check-c"} />
                    {s.subsidised ? "Funding available" : "Open for applications"}
                  </span>
                  <div className="cert__actions">
                    <button
                      type="button"
                      className="abtn ghost"
                      onClick={() => setDrawer(s)}
                    >
                      <Icon name="i-file" /> {s.secondaryLabel}
                    </button>
                    <button
                      type="button"
                      className={`abtn ${s.ctaClass === "gold" ? "gold" : "primary"}`}
                      onClick={() => startApply(s)}
                    >
                      <Icon name="i-send" /> {s.cta}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {schemes.length === 0 ? (
            <div className="empty">
              <b>No schemes match these filters</b>
              <p>Clear a filter, or ask the certification desk which scheme fits.</p>
              <button type="button" className="abtn ghost" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <p className="page-note">
              Showing {schemes.length} of {SCHEMES.length} certification schemes. Not listed?{" "}
              <Link to="/certification/quote">Request a quote</Link> and ESWASA will confirm the right scheme.
            </p>
          )}
        </div>
      </div>

      <section className="process" aria-labelledby="processTitle">
        <div className="process__head">
          <h2 id="processTitle">How certification works</h2>
          <p>
            ESWASA runs three certification paths. Each follows its own accredited process. Request a
            quote first, or apply straight away and ESWASA will price the work after review.
          </p>
        </div>
        <div className="cf-tabs" role="tablist" aria-label="Certification path">
          {PROCESS_TABS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={processTab === f}
              onClick={() => setProcessTab(f)}
            >
              {FLOW_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="cf-steps" role="tabpanel">
          {FLOW_STAGES[processTab].map((step, i) => (
            <div className="cf-step" key={step.key}>
              <span className="cf-step__n">{String(i + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {step.sla ? (
                <span className="sla">
                  <Icon name="i-clock" /> {step.sla}
                </span>
              ) : null}
              <span className="who">
                {step.who === "you" ? "You" : step.who === "eswasa" ? "ESWASA" : "You + ESWASA"}
              </span>
            </div>
          ))}
        </div>
        <div className="cf-nav">
          {processTab === "ingelo" ? (
            <Link className="cf-btn cf-btn--gold" to="/certification/apply?scheme=ingelo">
              <Icon name="i-check-c" /> Check Ingelo eligibility
            </Link>
          ) : (
            <Link
              className="cf-btn cf-btn--pri"
              to={`/certification/apply?scheme=${processTab === "product" ? "product" : "iso9001"}`}
            >
              <Icon name="i-send" /> Start an application
            </Link>
          )}
          <Link className="cf-btn cf-btn--ghost" to={`/certification/quote?flow=${processTab}`}>
            <Icon name="i-dollar" /> Request a quote
          </Link>
        </div>
      </section>

      <section className="process" aria-labelledby="docsTitle">
        <div className="process__head">
          <h2 id="docsTitle">Rules, policies &amp; procedures</h2>
          <p>
            The documents that govern ESWASA certification: impartiality, appeals (within{" "}
            {CHARTER.appealWindowDays} days), complaints, suspension and withdrawal, and use of the mark.
          </p>
        </div>
        <div className="cf-docs">
          {CERT_DOCUMENTS.map((d) => (
            <div className="cf-doc" key={d.code}>
              <Icon name="i-file" />
              <div>
                <code>{d.code}</code>
                {d.title}
              </div>
            </div>
          ))}
        </div>
        <p className="page-note">
          Status of certified clients: <Link to="/certification/status">public status register</Link>.
          Concerns about a certified client? <Link to="/complaints?topic=certification">Raise a complaint</Link>.
        </p>
      </section>

      <section className="featured" aria-labelledby="featuredTitle">
        <div className="featured__head">
          <div>
            <h2 id="featuredTitle">Common starting points</h2>
            <p>Curated schemes and prep packs for the situations we see most often.</p>
          </div>
          <button
            type="button"
            className="featured__link"
            onClick={() => showToast("Paths catalogue coming soon")}
          >
            All paths <Icon name="i-cright" />
          </button>
        </div>
        <StaggeredGrid
          label="Common starting points"
          className="ggrid--featured"
          items={PATHS}
          itemKey={(c) => c.title}
          renderItem={(c) => (
            <OutlineCard
              to={c.to}
              icon={c.icon}
              title={c.title}
              body={c.body}
              tint={c.tint}
              tone={c.tone}
              tag={c.tag}
              meta={[{ icon: c.countIcon, label: c.count }]}
              cta={c.cta}
              hint={c.hint}
            />
          )}
        />
      </section>

      {drawer ? <SchemeDrawer scheme={drawer} onClose={() => setDrawer(null)} /> : null}

      <HelpBand
        kicker="Not sure where to start?"
        title="Tell us what you’re making and we’ll tell you what to certify."
        body="The certification desk can match your product or process to the right scheme and book a scoping call before you apply."
        desk={{ label: "the certification desk", email: "info@eswasa.co.sz", subject: "Certification enquiry" }}
        shortcut={{
          icon: "i-steps",
          label: "Start from a goal",
          hint: "Step-by-step guides with costs and timelines",
          to: "/goals",
        }}
      />
    </div>
  );
}

function durationRank(duration: string): number {
  const m = duration.match(/(\d+)/);
  return m ? Number(m[1]) : 99;
}

function feeRank(s: Scheme): number {
  if (s.subsidised || /subsid/i.test(s.fee)) return 0;
  const m = s.fee.replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : 99;
}

function SchemeDrawer({ scheme, onClose }: { scheme: Scheme; onClose: () => void }) {
  const ingelo = scheme.flow === "ingelo";
  const docs = REQUIRED_DOCS[scheme.flow];
  return (
    <SideDrawer kicker={scheme.code} title={ingelo ? "Ingelo eligibility" : "Application checklist"} onClose={onClose}>
      {ingelo ? (
        <>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 8 }}>
            Ingelo is a Ministry of Commerce, Industry and Trade initiative run by ESWASA for local producers.
          </p>
          <div className="cf-sec">You qualify if</div>
          <ul className="cf-bul">
            <li><Icon name="i-check" /> The business is owned by Emaswati</li>
            <li><Icon name="i-check" /> It is a local MSME producing goods or services</li>
            <li><Icon name="i-check" /> You are willing to scale up for export quota requirements</li>
          </ul>
          <div className="cf-sec">What you get</div>
          <ul className="cf-bul">
            <li><Icon name="i-check" /> Free pre-application consultation and gap-analysis workshop</li>
            <li><Icon name="i-check" /> Expert guidance through certification</li>
            <li><Icon name="i-check" /> The ESWASA Approved mark on your products</li>
            <li><Icon name="i-check" /> Access to local, regional and AfCFTA markets</li>
          </ul>
        </>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 8 }}>
          {FLOW_LABEL[scheme.flow]} · {scheme.duration} · valid {scheme.validity}. Have these ready. You can
          also upload them after you apply.
        </p>
      )}
      <div className="cf-sec">Documents</div>
      <ul className="cf-bul">
        {docs.map((d) => (
          <li key={d.key} className={d.required ? "" : "opt"}>
            <Icon name={d.required ? "i-check" : "i-file"} />
            <span>
              {d.label}
              {d.required ? "" : " (optional)"}
              {d.hint ? ` · ${d.hint}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="cf-nav">
        <Link className="cf-btn cf-btn--pri" to={`/certification/apply?scheme=${scheme.id}`}>
          <Icon name="i-send" /> {ingelo ? "Check eligibility & apply" : "Start application"}
        </Link>
        {!ingelo ? (
          <Link className="cf-btn cf-btn--ghost" to={`/certification/quote?scheme=${scheme.id}`}>
            Request a quote
          </Link>
        ) : null}
      </div>
    </SideDrawer>
  );
}
