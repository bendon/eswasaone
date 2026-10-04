import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { HelpBand } from "../components/HelpBand";
import { OutlineCard } from "../components/OutlineCard";
import { StaggeredGrid } from "../components/StaggeredGrid";
import { useCartToast } from "../ui/CartToast";

// TODO: wire real — AI standards + lab catalogue still static; copy pending ESWASA review.

type Stage = "Draft" | "Public review" | "Published";

type AiStandard = {
  code: string;
  title: string;
  body: string;
  status: Stage;
};

type LabTest = {
  id: string;
  title: string;
  body: string;
  tag: string;
  turnaround: string;
  icon: IconName;
  tint: string;
  tone: string;
};

const STAGES: Stage[] = ["Draft", "Public review", "Published"];

const AI_STANDARDS: AiStandard[] = [
  {
    code: "SZNS AI 001",
    title: "AI governance & risk",
    body: "How organisations identify, assess and manage risk across the life of an AI system.",
    status: "Draft",
  },
  {
    code: "SZNS AI 002",
    title: "Algorithmic transparency",
    body: "What must be disclosed about how an automated decision was reached, and to whom.",
    status: "Draft",
  },
  {
    code: "SZNS AI 003",
    title: "Training data quality",
    body: "Requirements for the provenance, representativeness and documentation of training data.",
    status: "Public review",
  },
];

const LAB_TESTS: LabTest[] = [
  {
    id: "fairness",
    title: "AI fairness & bias audit",
    body: "We test your model's outcomes across demographic groups and report where, and by how much, it treats people differently.",
    tag: "AI models",
    turnaround: "2 weeks",
    icon: "i-users",
    tint: "#F0E9FB",
    tone: "#7C3AED",
  },
  {
    id: "software",
    title: "Software conformity testing",
    body: "Functional and conformity testing of software products against the standard or specification you need to meet.",
    tag: "Software",
    turnaround: "1–3 weeks",
    icon: "i-monitor",
    tint: "#E8EEFB",
    tone: "#1D4ED8",
  },
  {
    id: "cyber",
    title: "Cybersecurity & data protection audit",
    body: "An independent review of how your system stores, moves and protects data — with findings ranked by risk.",
    tag: "Digital infrastructure",
    turnaround: "2–4 weeks",
    icon: "i-shield",
    tint: "#E4F4F1",
    tone: "#0E7C7B",
  },
];

const TRUST_MARKERS = [
  "Aligned with ISO/IEC JTC 1/SC 42",
  "EU AI Act compatible",
  "ISO/IEC 17025 accredited lab",
] as const;

/** Illustrative only — the hero shows what a lab report looks like, not a real result. */
const SAMPLE_REPORT = [
  { label: "Fairness", score: 92 },
  { label: "Robustness", score: 86 },
  { label: "Transparency", score: 78 },
  { label: "Data quality", score: 95 },
] as const;

const LAB_STEPS = [
  { icon: "i-clipboard", title: "Scope", body: "Tell us what the system does and which standard or market it has to satisfy." },
  { icon: "i-send", title: "Submit", body: "Share model access, documentation and test data through a secure channel." },
  { icon: "i-flask", title: "Test", body: "Our lab runs the agreed test plan independently — you get progress updates." },
  { icon: "i-award", title: "Report", body: "A signed test report you can hand to regulators, buyers and auditors." },
] as const satisfies readonly { icon: IconName; title: string; body: string }[];

export function AiTechPage() {
  const { showToast } = useCartToast();
  const { pathname } = useLocation();
  const standardsRef = useRef<HTMLElement>(null);
  const labRef = useRef<HTMLElement>(null);

  // /ai-tech/standards and /ai-tech/lab share this page — land on the matching section.
  useEffect(() => {
    const target = pathname.endsWith("/standards")
      ? standardsRef.current
      : pathname.endsWith("/lab")
        ? labRef.current
        : null;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pathname]);

  // Fill the sample-report meters once the hero has painted.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="page aitech">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "AI & Technology" }]} />

      <section className="page-hero page-hero--ai" aria-labelledby="aiTechTitle">
        <div className="page-hero__inner">
          <span className="page-hero__label">AI &amp; EMERGING TECHNOLOGY</span>
          <h1 id="aiTechTitle">
            Eswatini sets its own standards for <em>artificial intelligence.</em>
          </h1>
          <p>
            One programme makes the rules — the other checks them. ESWASA develops national AI
            standards and runs an independent lab to test AI systems, software and digital
            infrastructure.
          </p>
          <div className="page-hero__actions">
            <button type="button" className="chip-cta gold" onClick={() => scrollTo(labRef.current)}>
              <Icon name="i-flask" /> Book a lab test
            </button>
            <button type="button" className="chip-cta" onClick={() => scrollTo(standardsRef.current)}>
              <Icon name="i-scroll" /> Review draft standards
            </button>
          </div>
          <ul className="aitech-trust" aria-label="Trust markers">
            {TRUST_MARKERS.map((m) => (
              <li key={m}>
                <Icon name="i-check-c" /> {m}
              </li>
            ))}
          </ul>
        </div>

        <figure className={`aireport${filled ? " is-filled" : ""}`} aria-label="Sample lab test report">
          <div className="aireport__head">
            <span className="aireport__ic">
              <Icon name="i-chip" />
            </span>
            <div>
              <b>Conformity test report</b>
              <span>Sample · credit-scoring model</span>
            </div>
            <span className="aireport__badge">Sample</span>
          </div>
          <ul className="aireport__rows">
            {SAMPLE_REPORT.map((r) => (
              <li key={r.label} style={{ "--score": `${r.score}%` } as CSSProperties}>
                <span>{r.label}</span>
                <b>{r.score}</b>
                <i aria-hidden="true" />
              </li>
            ))}
          </ul>
          <figcaption className="aireport__foot">
            <Icon name="i-shield-c" />
            <span>
              Tested against <b>SZNS AI 001</b> (draft)
            </span>
          </figcaption>
        </figure>
      </section>

      {/* The two programmes */}
      <section className="aiduo" aria-label="Two programmes">
        <article className="aiduo__card">
          <span className="aiduo__kicker">01 · Makes the rules</span>
          <h2>AI &amp; Technology Standards</h2>
          <p>National standards for AI systems, algorithms, data and digital trust — written with industry, government and the public.</p>
          <button type="button" className="aiduo__link" onClick={() => scrollTo(standardsRef.current)}>
            See what&rsquo;s in development <Icon name="i-cright" />
          </button>
        </article>
        <span className="aiduo__join" aria-hidden="true">
          <Icon name="i-cright" />
        </span>
        <article className="aiduo__card aiduo__card--lab">
          <span className="aiduo__kicker">02 · Checks them</span>
          <h2>AI &amp; Technology Testing Lab</h2>
          <p>Independent conformity assessment for AI models, software and digital systems — against SZNS and international standards.</p>
          <button type="button" className="aiduo__link" onClick={() => scrollTo(labRef.current)}>
            Explore lab services <Icon name="i-cright" />
          </button>
        </article>
      </section>

      {/* Standards pipeline */}
      <section ref={standardsRef} className="aisec" aria-labelledby="aiStdTitle">
        <div className="featured__head">
          <div>
            <h2 id="aiStdTitle">Standards in development</h2>
            <p>Every SZNS AI standard moves through public review before it&rsquo;s published.</p>
          </div>
          <Link to="/standards" className="featured__link">
            All standards <Icon name="i-cright" />
          </Link>
        </div>

        <ol className="aipipe">
          {AI_STANDARDS.map((s) => {
            const at = STAGES.indexOf(s.status);
            const open = s.status === "Public review";
            return (
              <li key={s.code} className={`aipipe__row${open ? " is-open" : ""}`}>
                <div className="aipipe__id">
                  <span className="aipipe__code">{s.code}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
                <ol className="aipipe__track" aria-label={`Stage: ${s.status}`}>
                  {STAGES.map((stage, i) => (
                    <li
                      key={stage}
                      className={i < at ? "done" : i === at ? "now" : undefined}
                      aria-current={i === at ? "step" : undefined}
                    >
                      <span className="aipipe__dot" />
                      {stage}
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className={open ? "aipipe__act aipipe__act--open" : "aipipe__act"}
                  onClick={() =>
                    showToast(open ? "Commenting opens soon" : `We'll email you when ${s.code} opens for review`)
                  }
                >
                  {open ? (
                    <>
                      <Icon name="i-mega" /> Comment now
                    </>
                  ) : (
                    <>
                      <Icon name="i-bell" /> Notify me
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Lab services */}
      <section ref={labRef} className="aisec" aria-labelledby="aiLabTitle">
        <div className="featured__head">
          <div>
            <h2 id="aiLabTitle">Testing lab services</h2>
            <p>Independent results you can hand to a regulator, buyer or auditor.</p>
          </div>
        </div>

        <StaggeredGrid
          label="Testing lab services"
          className="ggrid--featured"
          items={LAB_TESTS}
          itemKey={(t) => t.id}
          renderItem={(t) => (
            <OutlineCard
              to={`/ai-tech/lab?test=${t.id}`}
              icon={t.icon}
              title={t.title}
              body={t.body}
              tint={t.tint}
              tone={t.tone}
              tag={t.tag}
              meta={[{ icon: "i-clock", label: t.turnaround }]}
              cta="Book this test"
              hint="Start scoping"
            />
          )}
        />

        <ol className="aisteps" aria-label="How a lab test works">
          {LAB_STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="aisteps__n">{String(i + 1).padStart(2, "0")}</span>
              <span className="aisteps__ic">
                <Icon name={s.icon} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <HelpBand
        kicker="Building or buying AI?"
        title="Not sure which standard or test applies to your system?"
        body="Tell the lab what your system does and where it will be used. They’ll point you to the relevant SZNS standards and tests, and set up a scoping call."
        desk={{ label: "the AI & Technology Lab", email: "info@eswasa.co.sz", subject: "AI & Technology Lab" }}
        shortcut={{
          icon: "i-book",
          label: "Browse all standards",
          hint: "Search the full SZNS catalogue",
          to: "/standards",
        }}
      />
    </div>
  );
}
