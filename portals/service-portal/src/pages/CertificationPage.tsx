import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { LISTED_SCHEMES, type Scheme } from "../api/certification";
import {
  CERT_DOCUMENTS,
  CHARTER,
  FLOW_LABEL,
  FLOW_STAGES,
  type CertFlow,
} from "../certification/flows";
import { ProcessJourney } from "../certification/ProcessJourney";
import { SideDrawer } from "../certification/ui";
import { verifyToken, type VerificationResult } from "../api/misc";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { HelpBand } from "../components/HelpBand";
import { OutlineCard } from "../components/OutlineCard";
import { StaggeredGrid } from "../components/StaggeredGrid";
import { safeText } from "../lib/safe";
import { useCartToast } from "../ui/CartToast";

/** Facts published by ESWASA (certification pages + Service Charter). */
const HERO_STATS = [
  { value: "3", label: "Certification paths" },
  { value: "5", label: "Management-system standards" },
  { value: `${CHARTER.quoteDays} days`, label: "Quote turnaround (working)" },
  { value: "3 yrs", label: "Product permit validity" },
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
    to: "/certification/quote",
    title: "Not sure what it will cost?",
    body: "Request a quotation. ESWASA says cost depends on company size, operations and, for products, the certification parameters.",
    count: `${CHARTER.quoteDays} working days`,
    countIcon: "i-clock",
    tag: "Quote",
    cta: "Request a quote",
    hint: "Service Charter",
    icon: "i-dollar",
    tint: "#ECEEFC",
    tone: "#313391",
  },
  {
    to: "/certification/apply?scheme=ingelo",
    title: "Local MSME producer?",
    body: "Check whether you qualify for Ingelo and ask for a free pre-application consultation and gap-analysis workshop.",
    count: "Free consultation",
    countIcon: "i-users",
    tag: "Ingelo",
    cta: "Check eligibility",
    hint: "Emaswati-owned MSMEs",
    icon: "i-users",
    tint: "#DCFCE7",
    tone: "#166534",
  },
  {
    to: "/account/applications",
    title: "Already certified?",
    body: "Management-system certification continues with two surveillance audits, then a recertification audit. Track yours in your account.",
    count: "Surveillance",
    countIcon: "i-refresh",
    tag: "Maintain",
    cta: "My applications",
    hint: "Stay certified",
    icon: "i-trend",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
  },
  {
    to: "/applicability",
    title: "Which standard applies?",
    body: "Find the standard for your product or process before you apply, or buy it from the standards store.",
    count: "Standards",
    countIcon: "i-book",
    tag: "Standards",
    cta: "Check applicability",
    hint: "Start here",
    icon: "i-search",
    tint: "#FEF6DC",
    tone: "#B8860B",
  },
];

type FilterOption = { id: string; label: string; test: (s: Scheme) => boolean };
type FilterGroup = { id: string; label: string; open: boolean; options: FilterOption[] };

const FILTERS: FilterGroup[] = [
  {
    id: "type",
    label: "Certification type",
    open: true,
    options: [
      { id: "ms", label: "Management systems", test: (s) => s.flow === "ms" },
      { id: "product", label: "Product certification", test: (s) => s.flow === "product" },
      { id: "msme", label: "Ingelo (MSME)", test: (s) => s.flow === "ingelo" },
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

  const [sort, setSort] = useState("default");
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
  const [verifyFailed, setVerifyFailed] = useState(false);

  const schemes = useMemo(() => {
    const list = applyFilters(LISTED_SCHEMES, checked);
    if (sort === "code") list.sort((a, b) => a.code.localeCompare(b.code));
    return list;
  }, [sort, checked]);

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
    setVerifyFailed(false);
    try {
      setVerifyResult(await verifyToken(token));
    } catch {
      setVerifyResult(null);
      setVerifyFailed(true);
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
                  <em>{applyFilters(LISTED_SCHEMES, checked, group.id).filter(opt.test).length}</em>
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
            Management systems, product certification and the Ingelo scheme for local MSMEs,
            from the Eswatini Standards Authority. Request a quote, apply online and follow each
            stage of your certification.
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
              placeholder="Certificate number"
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
            Results come from the ESWASA register. See also the{" "}
            <Link to="/certification/status">suspended, withdrawn &amp; reduced-scope register</Link>.
          </p>
          {verifyFailed ? (
            <div className="verify-widget__result">
              Couldn’t reach the register, so no result is shown. Please try again.
            </div>
          ) : null}
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
              {schemes.length} certification schemes <span>· as published by ESWASA</span>
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
                <option value="default">ESWASA order</option>
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
                  {s.facts.map((f) => (
                    <div className="cert__fact" key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="cert__foot">
                  <a className="cert__badge" href={s.source} target="_blank" rel="noopener noreferrer">
                    <Icon name="i-open" /> eswasa.co.sz
                  </a>
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
              Showing {schemes.length} of {LISTED_SCHEMES.length} certification schemes. Need more than one
              type, e.g. ISO + Product?{" "}
              <Link to="/certification/quote?flow=combined">Request a combined quote</Link> and name the
              standards and products yourself.
            </p>
          )}
        </div>
      </div>

      <section className="process" aria-labelledby="processTitle">
        <div className="process__head">
          <h2 id="processTitle">How certification works</h2>
          <p>
            ESWASA runs three certification paths, each with its own process as published on
            eswasa.co.sz. Request a quote first, or apply and ESWASA will quote after reviewing.
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
        <div role="tabpanel">
          <ProcessJourney
            key={processTab}
            stages={FLOW_STAGES[processTab]}
            label={`${FLOW_LABEL[processTab]} certification steps`}
          />
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
            <p>Where to begin, depending on where you are.</p>
          </div>
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
          hint: "Step-by-step guides",
          to: "/goals",
        }}
      />
    </div>
  );
}

function SchemeDrawer({ scheme, onClose }: { scheme: Scheme; onClose: () => void }) {
  const ingelo = scheme.flow === "ingelo";
  return (
    <SideDrawer kicker={scheme.code} title={ingelo ? "Ingelo eligibility" : "How it works"} onClose={onClose}>
      {ingelo ? (
        <>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 8 }}>
            Ingelo is a Ministry of Commerce, Industry and Trade initiative for local producers.
          </p>
          <div className="cf-sec">You qualify if</div>
          <ul className="cf-bul">
            <li><Icon name="i-check" /> You are Emaswati</li>
            <li><Icon name="i-check" /> You run a local MSME producing goods or services</li>
            <li><Icon name="i-check" /> You are willing to scale production to meet export quota requirements</li>
          </ul>
          <div className="cf-sec">Benefits listed by ESWASA</div>
          <ul className="cf-bul">
            <li><Icon name="i-check" /> Free pre-application consultations and gap-analysis workshops</li>
            <li><Icon name="i-check" /> Expert technical guidance throughout certification</li>
            <li><Icon name="i-check" /> The ESWASA Approved mark on your products</li>
            <li><Icon name="i-check" /> Access to local, regional and AfCFTA markets</li>
          </ul>
          <div className="cf-sec">Application</div>
          <p style={{ fontSize: 13.5 }}>
            Form CER_FO_002_IPC. On eswasa.co.sz it is downloaded and emailed to certification@eswasa.co.sz or
            handed in at Matsapha. Here you fill it in online.
          </p>
        </>
      ) : (
        <>
          <div className="cf-sec">Stages</div>
          <ol style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 6 }}>
            {FLOW_STAGES[scheme.flow].map((st) => (
              <li key={st.key}>
                <b>{st.title}</b>. {st.body}
              </li>
            ))}
          </ol>
          <div className="cf-sec">Documents</div>
          <p style={{ fontSize: 13.5 }}>
            ESWASA does not publish a document checklist. Attach what you have (up to 5 PDFs) to your quote
            request, and ESWASA will tell you what else it needs.
          </p>
        </>
      )}
      <p style={{ fontSize: 12.5, marginTop: 12 }}>
        Source:{" "}
        <a href={scheme.source} target="_blank" rel="noopener noreferrer">
          {scheme.source.replace("https://", "")}
        </a>
      </p>
      <div className="cf-nav">
        <Link className="cf-btn cf-btn--pri" to={`/certification/apply?scheme=${scheme.id}`}>
          <Icon name="i-send" /> {ingelo ? "Check eligibility & apply" : "Start application"}
        </Link>
        <Link className="cf-btn cf-btn--ghost" to={`/certification/quote?scheme=${scheme.id}`}>
          Request a quote
        </Link>
      </div>
    </SideDrawer>
  );
}
