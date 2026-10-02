import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import {
  LEARNING_PATHS,
  listCourses,
  UPCOMING,
  type Course,
} from "../api/training";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import type { LayoutOutletContext } from "../layout/ServiceLayout";
import { safeText } from "../lib/safe";
import { useCartToast } from "../ui/CartToast";

const HERO_STATS = [
  { value: "2,840", label: "Learners enrolled" },
  { value: "24", label: "Courses offered" },
  { value: "5 cities", label: "Across Eswatini" },
  { value: "100%", label: "Digital certificate" },
] as const;

const HINTS = ["HACCP", "ISO 9001 Internal Auditor", "Food labelling", "Lead Auditor"] as const;

const TRACKS = [
  { value: "", label: "All tracks" },
  { value: "food", label: "Food safety & HACCP" },
  { value: "qms", label: "Quality management" },
  { value: "env", label: "Environment & OHS" },
  { value: "lab", label: "Laboratory & calibration" },
  { value: "export", label: "Export readiness" },
] as const;

type FilterGroup = {
  id: string;
  label: string;
  open: boolean;
  options: { id: string; label: string; count: string; default?: boolean }[];
};

const FILTERS: FilterGroup[] = [
  {
    id: "track",
    label: "Track",
    open: true,
    options: [
      { id: "food", label: "Food safety & HACCP", count: "7", default: true },
      { id: "qms", label: "Quality management", count: "5" },
      { id: "env", label: "Environment & OHS", count: "4" },
      { id: "lab", label: "Laboratory & calibration", count: "3" },
      { id: "export", label: "Export readiness", count: "3" },
      { id: "msme", label: "MSME & Ingelo", count: "2" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    open: true,
    options: [
      { id: "mbabane", label: "In-person (Mbabane)", count: "18", default: true },
      { id: "manzini", label: "In-person (Manzini)", count: "9" },
      { id: "online", label: "Online, live", count: "6" },
      { id: "self", label: "Self-paced online", count: "4" },
      { id: "onsite", label: "In-house / on-site", count: "All" },
    ],
  },
  {
    id: "duration",
    label: "Duration",
    open: true,
    options: [
      { id: "half", label: "Half day", count: "5" },
      { id: "1-2", label: "1 – 2 days", count: "9" },
      { id: "3-5", label: "3 – 5 days", count: "8" },
      { id: "multi", label: "Multi-week", count: "2" },
    ],
  },
  {
    id: "level",
    label: "Level",
    open: true,
    options: [
      { id: "aware", label: "Awareness / intro", count: "8" },
      { id: "impl", label: "Implementer", count: "10" },
      { id: "ia", label: "Internal auditor", count: "6" },
      { id: "la", label: "Lead auditor", count: "4" },
    ],
  },
  {
    id: "price",
    label: "Price",
    open: false,
    options: [
      { id: "free", label: "Free / funded", count: "3" },
      { id: "lt2", label: "Under SZL 2,000", count: "7" },
      { id: "2-5", label: "SZL 2,000 – 5,000", count: "10" },
      { id: "gt5", label: "Over SZL 5,000", count: "4" },
    ],
  },
];

const DEFAULT_STYLE = {
  accent: "#313391",
  tint: "#ECEEFC",
  tone: "#313391",
};

export function TrainingPage() {
  const { openDock } = useOutletContext<LayoutOutletContext>();
  const { user, openAuth } = useAuth();
  const { showToast } = useCartToast();
  const navigate = useNavigate();

  const catalogueRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLElement>(null);
  const pathsRef = useRef<HTMLElement>(null);

  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [track, setTrack] = useState("");
  const [items, setItems] = useState<Course[]>([]);
  const [busy, setBusy] = useState(true);
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

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listCourses(q || undefined, track || undefined).then((res) => {
      if (!cancelled) {
        setItems(res);
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [q, track]);

  const sorted = useMemo(() => {
    const list = [...items];
    if (sort === "duration") {
      list.sort((a, b) => durationRank(a.duration) - durationRank(b.duration));
    } else if (sort === "fee") {
      list.sort((a, b) => feeRank(a.fee) - feeRank(b.fee));
    } else if (sort === "date") {
      list.sort((a, b) => (a.nextSession || "").localeCompare(b.nextSession || ""));
    }
    return list;
  }, [items, sort]);

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
    for (const g of FILTERS) {
      for (const o of g.options) next[`${g.id}:${o.id}`] = false;
    }
    setChecked(next);
    setTrack("");
    showToast("Filters cleared");
  }

  function toggleSave(id: string) {
    setSaved((prev) => {
      const on = !prev[id];
      showToast(on ? "Saved to your learning list" : "Removed from your learning list");
      return { ...prev, [id]: on };
    });
  }

  function myLearning() {
    if (user) {
      navigate("/account/training");
      return;
    }
    openAuth({
      title: "Sign in to continue learning",
      reason: "Continue courses, view certificates, and download transcripts.",
      next: "/account/training",
    });
  }

  function courseCta(c: Course) {
    if (c.waitlist) {
      showToast("Added to waitlist — we'll email you when a seat opens");
      return;
    }
    navigate(`/training/${c.id}`);
  }

  const filterPanel = (
    <aside className={`sidebar${drawerOpen ? " drawer-open" : ""}`} aria-label="Filters">
      <div className="filterbox">
        <div className="filterbox__head">
          <b>Refine courses</b>
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
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Training" }]} />

      <section className="page-hero">
        <div className="page-hero__inner">
          <span className="page-hero__label">ESWASAONE · TRAINING CENTRE</span>
          <h1>Learn the standard. Then pass the audit.</h1>
          <p>
            ESWASA training is built around the standards you&apos;re actually being audited
            against — HACCP, ISO 9001, ISO 22000, ISO 45001 and the SZNS labelling rules. Every
            course ends with a digital certificate that employers and auditors recognise.
          </p>
          <div className="page-hero__actions">
            <button
              type="button"
              className="chip-cta gold"
              onClick={() =>
                catalogueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <Icon name="i-cap" /> Browse courses
            </button>
            <button
              type="button"
              className="chip-cta"
              onClick={() =>
                calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <Icon name="i-clock" /> Next sessions
            </button>
          </div>
        </div>
        <div className="page-hero__stats" aria-label="Training statistics">
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
          <button type="button" className="action" onClick={myLearning}>
            <span
              className="action__ic"
              style={{ "--ic-tint": "#ECEEFC", "--ic-tone": "#313391" } as CSSProperties}
            >
              <Icon name="i-trend" />
            </span>
            <div className="action__body">
              <b>My learning</b>
              <span>Continue courses, view certificates, and download transcripts</span>
            </div>
            <span className="action__go">
              <Icon name="i-cright" />
            </span>
          </button>
          <button
            type="button"
            className="action"
            onClick={() =>
              pathsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <span
              className="action__ic"
              style={{ "--ic-tint": "#F0E9FB", "--ic-tone": "#7C3AED" } as CSSProperties}
            >
              <Icon name="i-layers" />
            </span>
            <div className="action__body">
              <b>Plan a learning path</b>
              <span>Structured courses from awareness to lead auditor</span>
            </div>
            <span className="action__go">
              <Icon name="i-cright" />
            </span>
          </button>
          <button
            type="button"
            className="action"
            onClick={() =>
              catalogueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <span
              className="action__ic"
              style={{ "--ic-tint": "#FEF6DC", "--ic-tone": "#B8860B" } as CSSProperties}
            >
              <Icon name="i-cap" />
            </span>
            <div className="action__body">
              <b>Find a course</b>
              <span>Filter by topic, delivery mode, or how much time you have</span>
            </div>
            <span className="action__go">
              <Icon name="i-cright" />
            </span>
          </button>
        </div>
      </div>

      <div className="searchcard searchcard--flush">
        <form className="searchform" role="search" onSubmit={submitSearch}>
          <label className="searchform__input">
            <Icon name="i-search" />
            <input
              type="search"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder='Search by course, code, or topic — e.g. “HACCP”, “ISO 9001”, “auditor”'
              aria-label="Search courses"
            />
          </label>
          <label className="sr-only" htmlFor="trackSelect">
            Track
          </label>
          <select
            className="searchform__select"
            id="trackSelect"
            value={track}
            onChange={(e) => setTrack(e.target.value)}
          >
            {TRACKS.map((t) => (
              <option key={t.value || "all"} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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

      <div className="catalogue" id="catalogue" ref={catalogueRef}>
        {filterPanel}

        <div>
          <div className="toolbar">
            <span className="toolbar__count">
              {busy ? "Loading…" : `${sorted.length} courses`}{" "}
              <span>· 14 with dates in the next 60 days</span>
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
              <label htmlFor="trainSort">Sort</label>
              <select id="trainSort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="popular">Most popular</option>
                <option value="date">Next starting date</option>
                <option value="duration">Shortest duration</option>
                <option value="fee">Price: low to high</option>
              </select>
            </div>
          </div>

          <ul className="courselist">
            {sorted.map((c) => {
              const style = {
                accent: c.accent || DEFAULT_STYLE.accent,
                tint: c.tint || DEFAULT_STYLE.tint,
                tone: c.tone || DEFAULT_STYLE.tone,
              };
              const badgeClass =
                c.badgeKind === "subsidised"
                  ? " subsidised"
                  : c.badgeKind === "limited"
                    ? " limited"
                    : "";
              const badgeIcon: IconName =
                c.badgeKind === "subsidised"
                  ? "i-star"
                  : c.badgeKind === "limited"
                    ? "i-clock"
                    : "i-check-c";
              return (
                <li
                  key={c.id}
                  className="course"
                  style={
                    {
                      "--accent": style.accent,
                      "--chip-tint": style.tint,
                      "--chip-tone": style.tone,
                    } as CSSProperties
                  }
                >
                  <div className="course__top">
                    <span className="course__chip">{safeText(c.chip || "Course")}</span>
                    {c.code ? <span className="course__code">{safeText(c.code)}</span> : null}
                    <button
                      type="button"
                      className={`course__save${saved[c.id] ? " is-saved" : ""}`}
                      aria-label="Save course"
                      onClick={() => toggleSave(c.id)}
                    >
                      <Icon name="i-heart" />
                    </button>
                  </div>
                  <h2 className="course__title">
                    <Link to={`/training/${c.id}`}>{safeText(c.title)}</Link>
                  </h2>
                  <p className="course__abstract">{safeText(c.summary)}</p>
                  {c.nextSession ? (
                    <div className="course__session">
                      <Icon name="i-clock" />
                      Next session: <b>{c.nextSession}</b>
                      {c.nextPlace ? (
                        <>
                          <span className="dot" /> {c.nextPlace}
                        </>
                      ) : null}
                      {c.seats ? (
                        <>
                          <span className="dot" /> {c.seats}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <dl className="course__facts">
                    <div className="course__fact">
                      <dt>Duration</dt>
                      <dd>{safeText(c.duration)}</dd>
                    </div>
                    <div className="course__fact">
                      <dt>Level</dt>
                      <dd>{safeText(c.level || "—")}</dd>
                    </div>
                    <div className="course__fact">
                      <dt>Delivery</dt>
                      <dd>{safeText(c.delivery || "—")}</dd>
                    </div>
                    <div className="course__fact">
                      <dt>Fee</dt>
                      <dd className="mono">{safeText(c.fee)}</dd>
                    </div>
                  </dl>
                  <div className="course__foot">
                    <span className={`course__badge${badgeClass}`}>
                      <Icon name={badgeIcon} />
                      {safeText(c.badge || "Certificate included")}
                    </span>
                    <div className="course__actions">
                      <button
                        type="button"
                        className="abtn ghost"
                        onClick={() => showToast(`${c.secondaryLabel || "Outline"} coming soon`)}
                      >
                        <Icon name="i-file" /> {c.secondaryLabel || "Outline"}
                      </button>
                      <button
                        type="button"
                        className={`abtn ${c.ctaClass === "gold" ? "gold" : "primary"}`}
                        onClick={() => courseCta(c)}
                      >
                        <Icon name={c.waitlist ? "i-clipboard" : "i-send"} />{" "}
                        {c.cta || "Enrol"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {!busy && !sorted.length ? (
            <p className="page-note">No courses match.</p>
          ) : null}

          {!busy && sorted.length > 0 ? (
            <div className="loadmore">
              <div className="loadmore__bar">
                <i style={{ width: "48%" }} />
              </div>
              <p>
                Showing {sorted.length} of 24 courses offered by ESWASA
              </p>
              <button
                type="button"
                onClick={() => showToast("Loaded more courses — TODO: wire real LMS")}
              >
                Load more courses
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="upcoming" id="calendar" ref={calendarRef} aria-labelledby="upcomingTitle">
        <div className="upcoming__head">
          <h2 id="upcomingTitle">Next sessions</h2>
          <p>The next four training dates across all tracks, in the next 60 days.</p>
        </div>
        <div className="sessions">
          {UPCOMING.map((s) => (
            <Link key={s.date + s.title} className="session" to={s.to}>
              <span className="session__date">
                <Icon name="i-clock" /> {s.date}
              </span>
              <h3>{s.title}</h3>
              <div className="session__meta">
                <span>
                  <Icon name={s.placeIcon} /> {s.place} <b>{s.price}</b>
                </span>
                <span>
                  <Icon name="i-users" /> {s.seats} <b>{s.action}</b>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="paths" id="paths" ref={pathsRef} aria-labelledby="pathsTitle">
        <div className="paths__head">
          <div>
            <h2 id="pathsTitle">Learning paths</h2>
            <p>Structured sequences of courses that lead to a specific role or outcome.</p>
          </div>
          <button
            type="button"
            className="paths__link"
            onClick={() => showToast("Paths catalogue coming soon")}
          >
            All paths <Icon name="i-cright" />
          </button>
        </div>
        <div className="pathgrid">
          {LEARNING_PATHS.map((p) => (
            <Link
              key={p.id}
              className="path"
              to={`/training?path=${encodeURIComponent(p.id)}`}
              style={{ "--chip-tint": p.tint, "--chip-tone": p.tone } as CSSProperties}
            >
              <span className="path__ic">
                <Icon name={p.icon} />
              </span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <div className="path__steps">
                {p.steps.map((step) => (
                  <span className="path__step" key={step}>
                    {step}
                  </span>
                ))}
              </div>
              <div className="path__foot">
                <span className="path__count">{p.meta}</span>
                <span className="path__arrow">
                  <Icon name="i-cright" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="support">
        <div className="support__copy">
          <span>NOT SURE WHICH COURSE?</span>
          <h2>Tell us your role, and we&apos;ll suggest the right path.</h2>
          <p>
            Esi knows the full ESWASA training catalogue. Describe what you do and what
            you&apos;re trying to achieve — she&apos;ll point you to the shortest path, or connect
            you with the training centre to scope an in-house programme.
          </p>
        </div>
        <div className="support__actions">
          <button type="button" className="sbtn gold" onClick={() => openDock()}>
            <Icon name="i-spark" /> Ask Esi
          </button>
          <a className="sbtn ghost" href="mailto:training@eswasa.co.sz">
            <Icon name="i-send" /> Email the training centre
          </a>
        </div>
      </section>
    </div>
  );
}

function durationRank(duration: string): number {
  if (/half/i.test(duration)) return 0.5;
  const m = duration.match(/(\d+)/);
  return m ? Number(m[1]) : 99;
}

function feeRank(fee: string): number {
  if (/fund|free|subsid/i.test(fee)) return 0;
  const m = fee.replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : 99;
}
