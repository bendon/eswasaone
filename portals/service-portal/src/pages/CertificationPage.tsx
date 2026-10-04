import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { SCHEMES, type Scheme } from "../api/certification";
import { verifyToken, type VerificationResult } from "../api/misc";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { OutlineCard } from "../components/OutlineCard";
import { StaggeredGrid } from "../components/StaggeredGrid";
import type { LayoutOutletContext } from "../layout/ServiceLayout";
import { safeText } from "../lib/safe";
import { useCartToast } from "../ui/CartToast";

const HERO_STATS = [
  { value: "148", label: "Companies certified" },
  { value: "7", label: "Active schemes" },
  { value: "4–14 wk", label: "Typical timeline" },
  { value: "3 yrs", label: "Certificate validity" },
] as const;

const PROCESS_STEPS = [
  {
    n: "01",
    title: "Apply online",
    body: "Submit your organisation details, scope, and site information. You'll get a tracked reference number instantly.",
    dur: "15 min",
  },
  {
    n: "02",
    title: "Gap assessment",
    body: "We review your current systems against the standard and give you a written gap report with prioritised actions.",
    dur: "1–2 weeks",
  },
  {
    n: "03",
    title: "Stage 1 audit",
    body: "Documentation and readiness review at your site. We confirm your management system is ready for full evaluation.",
    dur: "1–2 days",
  },
  {
    n: "04",
    title: "Stage 2 audit",
    body: "Full on-site evaluation of your implemented system — processes, records, interviews, and observation of work in practice.",
    dur: "2–5 days",
  },
  {
    n: "05",
    title: "Certification decision",
    body: "The Certification Approval Committee reviews the audit report, and — if compliant — issues a 3-year certificate.",
    dur: "2–4 weeks",
  },
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
    to: "/certification?path=exporter",
    title: "First-time exporter pack",
    body: "ISO 9001 plus the relevant product standards and export-desk support — the shortest credible path to your first international shipment.",
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
    to: "/certification?path=food",
    title: "Food processor readiness",
    body: "HACCP first, then ISO 22000 — with our internal-auditor training bundled so your team can maintain the system after certification.",
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
    to: "/certification?path=msme",
    title: "MSME starter path",
    body: "For small businesses new to standards. Starts with the Ingelo scheme — subsidised training, testing and assessment — then SZNS Product Mark.",
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
    to: "/certification?path=integrated",
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
    to: "/certification?path=recertify",
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
    to: "/certification?path=upgrade",
    title: "Upgrade from HACCP",
    body: "Already HACCP certified? Bridge to ISO 22000 with a reduced-scope audit — your existing HACCP plan counts toward the new system.",
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

type FilterGroup = {
  id: string;
  label: string;
  open: boolean;
  options: { id: string; label: string; count: number; default?: boolean }[];
};

const FILTERS: FilterGroup[] = [
  {
    id: "type",
    label: "Scheme type",
    open: true,
    options: [
      { id: "ms", label: "Management systems", count: 4, default: true },
      { id: "product", label: "Product certification", count: 2 },
      { id: "sector", label: "Sector-specific", count: 2 },
      { id: "msme", label: "MSME / Ingelo", count: 1 },
    ],
  },
  {
    id: "sector",
    label: "Sector",
    open: true,
    options: [
      { id: "food", label: "Food & agriculture", count: 4, default: true },
      { id: "all", label: "All industries", count: 3 },
      { id: "construction", label: "Construction", count: 1 },
      { id: "manufacturing", label: "Manufacturing", count: 2 },
    ],
  },
  {
    id: "duration",
    label: "Duration",
    open: true,
    options: [
      { id: "lt6", label: "Under 6 weeks", count: 2 },
      { id: "6-10", label: "6 – 10 weeks", count: 4 },
      { id: "10-14", label: "10 – 14 weeks", count: 2 },
    ],
  },
  {
    id: "fee",
    label: "Fee range",
    open: true,
    options: [
      { id: "free", label: "Subsidised / free", count: 1 },
      { id: "lt20", label: "Under SZL 20,000", count: 2 },
      { id: "20-50", label: "SZL 20,000 – 50,000", count: 4 },
      { id: "gt50", label: "Over SZL 50,000", count: 1 },
    ],
  },
  {
    id: "avail",
    label: "Availability",
    open: false,
    options: [
      { id: "open", label: "Open for applications", count: 7, default: true },
      { id: "wait", label: "Waitlist", count: 0 },
      { id: "soon", label: "Coming soon", count: 1 },
    ],
  },
];

export function CertificationPage() {
  const { openDock } = useOutletContext<LayoutOutletContext>();
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
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of FILTERS) {
      for (const o of g.options) init[`${g.id}:${o.id}`] = Boolean(o.default);
    }
    return init;
  });
  const [verifyValue, setVerifyValue] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);

  const schemes = useMemo(() => {
    const list = [...SCHEMES];
    if (sort === "code") list.sort((a, b) => a.code.localeCompare(b.code));
    else if (sort === "fastest") {
      list.sort((a, b) => durationRank(a.duration) - durationRank(b.duration));
    } else if (sort === "fee") {
      list.sort((a, b) => feeRank(a) - feeRank(b));
    }
    return list;
  }, [sort]);

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
      navigate("/account");
      return;
    }
    openAuth({
      title: "Sign in to track",
      reason: "See live stage, pending documents, and audit dates for your application.",
      next: "/account",
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
                  <em>{opt.count}</em>
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
              <span>Pick a scheme and apply — no account required to begin</span>
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
            Certificate data is drawn live from the ESWASA register.
          </p>
          {verifyResult ? (
            <div className={`verify-widget__result${verifyResult.valid ? " ok" : ""}`}>
              {verifyResult.valid
                ? `Valid — ${safeText(verifyResult.subject || verifyResult.token)}`
                : `Not found — ${safeText(verifyResult.token)}`}
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
                      onClick={() => showToast(`${s.secondaryLabel} coming soon`)}
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

          <div className="loadmore">
            <div className="loadmore__bar">
              <i style={{ width: "62%" }} />
            </div>
            <p>
              Showing {schemes.length} of 11 certification schemes offered by ESWASA
            </p>
            <button
              type="button"
              onClick={() => showToast("Loaded more schemes — TODO: wire real catalogue")}
            >
              Load more schemes
            </button>
          </div>
        </div>
      </div>

      <section className="process" aria-labelledby="processTitle">
        <div className="process__head">
          <h2 id="processTitle">How certification works</h2>
          <p>
            Every management-system certification at ESWASA follows the same five-stage path.
            Most applicants complete it in six to fourteen weeks, depending on the size of the
            organisation and the readiness of existing systems.
          </p>
        </div>
        <div className="process__steps">
          {PROCESS_STEPS.map((step) => (
            <div className="pstep" key={step.n}>
              <span className="pstep__n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="pstep__dur">
                <Icon name="i-clock" /> {step.dur}
              </span>
            </div>
          ))}
        </div>
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

      <section className="support">
        <div className="support__copy">
          <span>NOT SURE WHERE TO START?</span>
          <h2>Tell us what you&apos;re making, and we&apos;ll tell you what to certify.</h2>
          <p>
            Esi knows the full ESWASA scheme catalogue. Describe your product or process and
            she&apos;ll match you to the right certification, or connect you with the
            certification desk for a scoping call.
          </p>
        </div>
        <div className="support__actions">
          <button type="button" className="sbtn gold" onClick={() => openDock()}>
            <Icon name="i-spark" /> Ask Esi
          </button>
          <a className="sbtn ghost" href="mailto:info@eswasa.co.sz">
            <Icon name="i-send" /> Email the certification desk
          </a>
        </div>
      </section>
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
