import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { Icon, Select, type IconName } from "@eswasaone/shared-ui";
import { listStandards, slug, type StandardSummary } from "../api/standards";
import type { LayoutOutletContext } from "../layout/ServiceLayout";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { HelpBand } from "../components/HelpBand";
import { OutlineCard } from "../components/OutlineCard";
import { StaggeredGrid } from "../components/StaggeredGrid";
import { safeText } from "../lib/safe";
import { useCartToast } from "../ui/CartToast";

const HERO_STATS = [
  { value: "312", label: "Standards published" },
  { value: "12", label: "Sectors covered" },
  { value: "45", label: "Free downloads" },
  { value: "24 hr", label: "Typical delivery" },
] as const;

const HINTS = ["SZNS ISO 9001", "Honey specification", "Bottled drinking water", "Product labelling"] as const;

const SECTORS = [
  { value: "Food", label: "Food & agriculture", count: 124 },
  { value: "Management", label: "Management systems", count: 42 },
  { value: "Construction", label: "Construction", count: 28 },
  { value: "ICT", label: "ICT & electronics", count: 18 },
  { value: "Health", label: "Health & safety", count: 15 },
  { value: "Energy", label: "Energy & environment", count: 12 },
  { value: "Environment", label: "Environment & water", count: 12 },
  { value: "Tourism", label: "Tourism & hospitality", count: 10 },
  { value: "Transport", label: "Transport & logistics", count: 7 },
] as const;

type SectorStyle = { accent: string; tint: string; tone: string };

const SECTOR_STYLE: Record<string, SectorStyle> = {
  Food: { accent: "#15803D", tint: "#E3F4E9", tone: "#15803D" },
  Management: { accent: "#313391", tint: "#ECEEFC", tone: "#313391" },
  Environment: { accent: "#0E7C7B", tint: "#E4F4F1", tone: "#0E7C7B" },
  Energy: { accent: "#0E7C7B", tint: "#E4F4F1", tone: "#0E7C7B" },
  Construction: { accent: "#B45309", tint: "#FDF3E3", tone: "#B45309" },
  ICT: { accent: "#1D4ED8", tint: "#E8EEFB", tone: "#1D4ED8" },
  Health: { accent: "#7C3AED", tint: "#F0E9FB", tone: "#7C3AED" },
};

const DEFAULT_STYLE: SectorStyle = { accent: "#313391", tint: "#ECEEFC", tone: "#313391" };

type Collection = {
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

const COLLECTIONS: Collection[] = [
  {
    to: "/standards?collection=food-export",
    title: "Food export starter pack",
    body: "Eleven standards covering labelling, hygiene, and contaminant limits for exporters of packaged food and agro-processed goods.",
    count: "11 standards",
    countIcon: "i-layers",
    tag: "Bundle",
    cta: "Browse pack",
    hint: "See all 11",
    icon: "i-globe",
    tint: "#E3F4E9",
    tone: "#15803D",
  },
  {
    to: "/standards?collection=sme",
    title: "SME certification toolkit",
    body: "ISO 9001, ISO 22000, and the SZNS Product Mark: everything an MSME needs to prepare for ESWASA certification.",
    count: "6 standards",
    countIcon: "i-layers",
    tag: "Toolkit",
    cta: "Browse toolkit",
    hint: "See all 6",
    icon: "i-badge",
    tint: "#ECEEFC",
    tone: "#313391",
  },
  {
    to: "/standards?collection=free",
    title: "Free to download",
    body: "Forty-five standards and technical references available at no cost, including all terminology and basic labelling guidance.",
    count: "45 standards",
    countIcon: "i-download",
    tag: "Free",
    cta: "Browse free",
    hint: "No cost",
    icon: "i-download",
    tint: "#FEF6DC",
    tone: "#D9A800",
  },
  {
    to: "/standards?collection=construction",
    title: "Construction & materials",
    body: "Cement, aggregates, structural steel, and plumbing standards for contractors and local manufacturers.",
    count: "28 standards",
    countIcon: "i-layers",
    tag: "Sector",
    cta: "Browse sector",
    hint: "See all 28",
    icon: "i-layers",
    tint: "#FDF3E3",
    tone: "#B45309",
  },
  {
    to: "/standards?collection=new",
    title: "New & updated this year",
    body: "Everything published or revised in the last twelve months, with a short summary of what changed and why.",
    count: "17 new",
    countIcon: "i-clock",
    tag: "New",
    cta: "See what changed",
    hint: "17 updates",
    icon: "i-star",
    tint: "#F0E9FB",
    tone: "#7C3AED",
  },
  {
    to: "/account/subscriptions",
    title: "Annual subscription",
    body: "Unlimited access to the full SZNS catalogue for your whole team, with automatic notifications when a standard changes.",
    count: "From SZL 12,500/yr",
    countIcon: "i-dollar",
    tag: "Subscription",
    cta: "View plans",
    hint: "Whole team",
    icon: "i-refresh",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
  },
];

type FilterGroup = {
  id: string;
  label: string;
  open: boolean;
  options: { id: string; label: string; count: number; default?: boolean }[];
};

const INITIAL_FILTERS: FilterGroup[] = [
  {
    id: "sector",
    label: "Sector",
    open: true,
    options: SECTORS.map((s, i) => ({
      id: s.value,
      label: s.label,
      count: s.count,
      default: i === 0,
    })),
  },
  {
    id: "status",
    label: "Status",
    open: true,
    options: [
      { id: "current", label: "Current", count: 287, default: true },
      { id: "draft", label: "Draft for comment", count: 7 },
      { id: "superseded", label: "Superseded", count: 18 },
    ],
  },
  {
    id: "format",
    label: "Format",
    open: true,
    options: [
      { id: "pdf", label: "PDF download", count: 312, default: true },
      { id: "bundle", label: "Print + PDF bundle", count: 48 },
      { id: "bilingual", label: "Bilingual (EN / siSwati)", count: 26 },
    ],
  },
  {
    id: "price",
    label: "Price",
    open: true,
    options: [
      { id: "free", label: "Free", count: 45 },
      { id: "lt200", label: "Under SZL 200", count: 84 },
      { id: "200-400", label: "SZL 200 – 400", count: 128 },
      { id: "gt400", label: "Over SZL 400", count: 55 },
    ],
  },
  {
    id: "ics",
    label: "ICS classification",
    open: false,
    options: [
      { id: "67", label: "67 · Food technology", count: 96 },
      { id: "03", label: "03 · Services & management", count: 44 },
      { id: "91", label: "91 · Construction", count: 28 },
      { id: "35", label: "35 · Information technology", count: 18 },
      { id: "13", label: "13 · Environment", count: 12 },
    ],
  },
];

function statusClass(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("draft")) return "draft";
  if (s.includes("super") || s.includes("withdraw")) return "superseded";
  return "current";
}

function statusLabel(status?: string): string {
  const cls = statusClass(status);
  if (cls === "draft") return "Draft";
  if (cls === "superseded") return "Superseded";
  return "Current";
}

function priceNum(price?: string): number {
  if (!price) return 0;
  const m = price.replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

const PAGE_SIZE = 6;

const isFree = (s: StandardSummary) => (s.price || "").toLowerCase().includes("free") || priceNum(s.price) === 0;

/** What each curated collection (`?collection=`) shows from the catalogue. */
const COLLECTION_FILTER: Record<string, { label: string; match: (s: StandardSummary) => boolean }> = {
  "food-export": { label: "Food export starter pack", match: (s) => s.sector === "Food" },
  sme: { label: "SME certification toolkit", match: (s) => s.sector === "Management" || /ISO|mark/i.test(`${s.code} ${s.title}`) },
  free: { label: "Free to download", match: isFree },
  construction: { label: "Construction & materials", match: (s) => s.sector === "Construction" },
  new: { label: "New & updated this year", match: (s) => (s.year || 0) >= new Date().getFullYear() - 1 },
};

export function StandardsPage() {
  const { openDock } = useOutletContext<LayoutOutletContext>();
  const { addToCart, showToast } = useCartToast();

  const [params, setParams] = useSearchParams();
  const collection = COLLECTION_FILTER[params.get("collection") ?? ""];
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [sector, setSector] = useState("");
  const [items, setItems] = useState<StandardSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [sort, setSort] = useState("relevant");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(INITIAL_FILTERS.map((g) => [g.id, g.open])),
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of INITIAL_FILTERS) {
      for (const o of g.options) {
        init[`${g.id}:${o.id}`] = Boolean(o.default);
      }
    }
    return init;
  });

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listStandards(q || undefined, sector || undefined).then((res) => {
      if (!cancelled) {
        setItems(res);
        setBusy(false);
        setVisible(PAGE_SIZE);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [q, sector]);

  useEffect(() => {
    if (collection) document.getElementById("catalogueList")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [collection]);

  const sorted = useMemo(() => {
    const list = collection ? items.filter(collection.match) : [...items];
    if (sort === "newest") list.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sort === "code") list.sort((a, b) => a.code.localeCompare(b.code));
    else if (sort === "price-asc") list.sort((a, b) => priceNum(a.price) - priceNum(b.price));
    else if (sort === "price-desc") list.sort((a, b) => priceNum(b.price) - priceNum(a.price));
    return list;
  }, [items, sort, collection]);

  const shown = sorted.slice(0, visible);
  const activeFilterCount = Object.values(checked).filter(Boolean).length;

  function submitSearch(e?: FormEvent) {
    e?.preventDefault();
    setQ(draftQ.trim());
  }

  function applyHint(hint: string) {
    setDraftQ(hint);
    setQ(hint);
  }

  function clearFilters() {
    const next: Record<string, boolean> = {};
    for (const g of INITIAL_FILTERS) {
      for (const o of g.options) next[`${g.id}:${o.id}`] = false;
    }
    setChecked(next);
    setSector("");
    showToast("Filters cleared");
  }

  function toggleCheck(groupId: string, optionId: string) {
    const key = `${groupId}:${optionId}`;
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (groupId === "sector") {
        const selected = SECTORS.filter((s) => next[`sector:${s.value}`]).map((s) => s.value);
        setSector(selected.length === 1 ? selected[0] : "");
      }
      return next;
    });
  }

  function toggleSave(code: string) {
    setSaved((prev) => {
      const on = !prev[code];
      showToast(on ? "Saved to your list" : "Removed from your list");
      return { ...prev, [code]: on };
    });
  }

  function loadMore() {
    setVisible((n) => Math.min(n + 12, sorted.length));
    showToast("Loaded more standards");
  }

  const filterPanel = (
    <aside className={`sidebar${drawerOpen ? " drawer-open" : ""}`} aria-label="Filters">
      <div className="filterbox">
        <div className="filterbox__head">
          <b>Refine results</b>
          <button type="button" onClick={clearFilters}>
            Clear all
          </button>
        </div>
        {INITIAL_FILTERS.map((group) => (
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
                    onChange={() => toggleCheck(group.id, opt.id)}
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
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Standards & e-Store" }]} />

      <section className="page-hero">
        <div className="page-hero__inner">
          <span className="page-hero__label">ESWASAONE · SZNS CATALOGUE</span>
          <h1>Standards &amp; e-Store</h1>
          <p>
            Every current SZNS standard in one place. Search, filter by sector, preview the scope,
            and buy the licensed full text, delivered as a secured PDF to your inbox.
          </p>
          <div className="page-hero__actions">
            <Link className="chip-cta" to="/standards/drafts">
              Have your say on drafts
            </Link>
            <Link className="chip-cta" to="/standards/propose">
              Propose a standard
            </Link>
            <button
              type="button"
              className="chip-cta gold"
              onClick={() => {
                setDraftQ("");
                setQ("");
                setSector("");
                showToast("Showing free standards (filter Price → Free)");
              }}
            >
              <Icon name="i-book" /> Browse free standards
            </button>
            <button type="button" className="chip-cta" onClick={() => openDock()}>
              <Icon name="i-clipboard" /> How licensing works
            </button>
          </div>
        </div>
        <div className="page-hero__stats" aria-label="Catalogue statistics">
          {HERO_STATS.map((s) => (
            <div className="hstat" key={s.label}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="searchcard">
        <form className="searchform" role="search" onSubmit={submitSearch}>
          <label className="searchform__input">
            <Icon name="i-search" />
            <input
              type="search"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder='Search by code, title, or keyword, e.g. “honey”, “SZNS 060”, “labelling”'
              aria-label="Search standards"
            />
          </label>
          <label className="sr-only" htmlFor="sectorSelect">
            Sector
          </label>
          <Select className="searchform__sector" id="sectorSelect" value={sector} onChange={(val) => setSector(val)}>
            <option value="">All sectors</option>
            {SECTORS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <button type="submit" className="searchform__submit">
            Search
          </button>
        </form>
        <div className="searchhints">
          <span className="searchhints__lbl">Popular</span>
          {HINTS.map((h) => (
            <button key={h} type="button" className="hintchip" onClick={() => applyHint(h)}>
              <Icon name="i-search" />
              {h}
            </button>
          ))}
        </div>
      </div>

      {drawerOpen ? (
        <button
          type="button"
          className="filter-backdrop"
          aria-label="Close filters"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className="catalogue">
        {filterPanel}

        <div className="std-main">
          <div className="toolbar">
            <span className="toolbar__count" id="catalogueList">
              {busy ? "Loading…" : `${sorted.length} standards`}{" "}
              <span>· {collection ? collection.label : "catalogue"}</span>
            </span>
            {collection ? (
              <button
                type="button"
                className="hintchip"
                onClick={() => {
                  params.delete("collection");
                  setParams(params);
                }}
              >
                {collection.label} <Icon name="i-x" />
              </button>
            ) : null}
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
              <label htmlFor="sortSelect">Sort</label>
              <Select id="sortSelect" value={sort} onChange={(val) => setSort(val)}>
                <option value="relevant">Most relevant</option>
                <option value="newest">Newest first</option>
                <option value="code">Code A–Z</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </Select>
            </div>
          </div>

          <ul className="stdlist">
            {shown.map((s) => {
              const style = SECTOR_STYLE[s.sector || ""] || DEFAULT_STYLE;
              const free = (s.price || "").toLowerCase().includes("free") || priceNum(s.price) === 0;
              return (
                <li
                  key={s.code}
                  className="std"
                    style={
                    {
                      "--accent": style.accent,
                      "--chip-tint": style.tint,
                      "--chip-tone": style.tone,
                    } as CSSProperties
                  }
                >
                  <div className="std__body">
                    <div className="std__top">
                      <span className="std__chip">{safeText(s.sector || "Standard")}</span>
                      <span className="std__code">{safeText(s.code)}</span>
                      <span className={`std__status ${statusClass(s.status)}`}>
                        {statusLabel(s.status)}
                      </span>
                      <button
                        type="button"
                        className={`std__save${saved[s.code] ? " is-saved" : ""}`}
                        aria-label="Save"
                        onClick={() => toggleSave(s.code)}
                      >
                        <Icon name="i-heart" />
                      </button>
                    </div>
                    <h2 className="std__title">
                      <Link to={`/standards/${slug(s.code)}`}>{safeText(s.title)}</Link>
                    </h2>
                    <p className="std__abstract">
                      {safeText(
                        s.abstract ||
                          "Summary available after purchase of the licensed standard.",
                      )}
                    </p>
                    <div className="std__meta">
                      {s.year ? (
                        <span>
                          <Icon name="i-clock" /> Published {s.year}
                        </span>
                      ) : null}
                      <span>
                        <Icon name="i-file" /> PDF
                      </span>
                      <span>
                        <Icon name="i-eye" /> Preview available
                      </span>
                    </div>
                  </div>
                  <div className="std__foot">
                    <span className={`std__price${free ? " free" : ""}`}>
                      {safeText(s.price || "See e-store")}
                      {!free && s.price ? <small>incl. VAT</small> : null}
                    </span>
                    <div className="std__actions">
                      <Link className="abtn ghost" to={`/standards/${slug(s.code)}`}>
                        <Icon name="i-eye" /> Preview
                      </Link>
                      <button
                        type="button"
                        className="abtn buy"
                        onClick={() =>
                          addToCart(`${s.code}: ${s.title}`)
                        }
                      >
                        <Icon name="i-cart" /> Add to cart
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {!busy && !shown.length ? (
            <p className="page-note">No standards match.</p>
          ) : null}

          {!busy && sorted.length > 0 ? (
            <div className="loadmore">
              <div className="loadmore__bar">
                <i style={{ width: `${Math.round((shown.length / sorted.length) * 100)}%` }} />
              </div>
              <p>
                Showing {shown.length} of {sorted.length} standards
              </p>
              {shown.length < sorted.length ? (
                <button type="button" onClick={loadMore}>
                  Load 12 more
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <section className="featured" aria-labelledby="featuredTitle">
        <div className="featured__head">
          <div>
            <h2 id="featuredTitle">Curated collections</h2>
            <p>Bundled by sector and use case. Save when you buy together.</p>
          </div>
        </div>
        <StaggeredGrid
          label="Curated collections"
          className="ggrid--featured"
          items={COLLECTIONS}
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

      <HelpBand
        kicker="Need help?"
        title="Can’t find the standard you need?"
        body="The standards desk can match your product or process to the right SZNS reference, tell you what’s in development, and help with orders and subscriptions."
        desk={{ label: "the standards desk", email: "info@eswasa.co.sz", subject: "Standards enquiry" }}
        shortcut={{
          icon: "i-search",
          label: "Check which standards apply",
          hint: "Answer a few questions about your product",
          to: "/applicability",
        }}
      />
    </div>
  );
}
