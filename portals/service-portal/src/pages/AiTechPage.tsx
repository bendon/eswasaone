import { Link } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";

type AiStandard = {
  code: string;
  title: string;
  status: "Draft" | "Public review" | "Published";
};

type LabTest = {
  label: string;
  turnaround: string;
};

const AI_STANDARDS: AiStandard[] = [
  { code: "SZNS AI 001", title: "AI governance & risk", status: "Draft" },
  { code: "SZNS AI 002", title: "Algorithmic transparency", status: "Draft" },
  { code: "SZNS AI 003", title: "Training data quality", status: "Public review" },
];

const LAB_TESTS: LabTest[] = [
  { label: "AI fairness & bias audit", turnaround: "2 weeks" },
  { label: "Software conformity testing", turnaround: "1–3 weeks" },
  { label: "Cybersecurity & data protection audit", turnaround: "2–4 weeks" },
];

const TRUST_MARKERS = [
  { icon: "i-check-c" as IconName, label: "Aligned with ISO/IEC JTC 1/SC 42" },
  { icon: "i-check-c" as IconName, label: "EU AI Act compatible" },
  { icon: "i-check-c" as IconName, label: "ISO/IEC 17025 accredited lab" },
];

export function AiTechPage() {
  return (
    <>
      {/* Page hero */}
      <section className="hero" aria-labelledby="aiTechTitle">
        <div className="hero__inner">
          <div className="hero__copy">
            <span className="hero__label">AI &amp; EMERGING TECHNOLOGY</span>
            <h1 id="aiTechTitle">
              Eswatini sets its own standards for artificial intelligence.
            </h1>
            <p className="hero__sub">
              One programme makes the rules — the other checks them. ESWASA develops
              national AI standards and runs an independent lab to test AI systems,
              software and digital infrastructure.
            </p>
            <div className="hero__trust" aria-label="Trust markers">
              {TRUST_MARKERS.map((m) => (
                <span key={m.label}>
                  <Icon name={m.icon} /> {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Standards development section */}
      <div className="sec-head">
        <div>
          <h2>AI &amp; Technology Standards</h2>
          <p>National standards for AI systems, algorithms, data, and digital trust</p>
        </div>
        <div className="r">
          <Link to="/standards" className="link">
            All standards <Icon name="i-cright" />
          </Link>
        </div>
      </div>

      <section className="ai-band" aria-label="AI standards in development">
        <ul className="ai-card__items" style={{ border: 0, padding: 0 }}>
          {AI_STANDARDS.map((s) => (
            <li key={s.code}>
              <em>
                {s.code} — {s.title}
              </em>
              <b>{s.status}</b>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/ai-tech/standards" className="btn apply">
            Explore standards <Icon name="i-cright" />
          </Link>
        </div>
      </section>

      {/* Testing lab section */}
      <div className="sec-head">
        <div>
          <h2>AI &amp; Technology Testing Lab</h2>
          <p>Independent conformity assessment for AI models, software and digital systems</p>
        </div>
        <div className="r">
          <Link to="/ai-tech/lab" className="link">
            Lab details <Icon name="i-cright" />
          </Link>
        </div>
      </div>

      <section className="ai-band" aria-label="Testing services">
        <ul className="ai-card__items" style={{ border: 0, padding: 0 }}>
          {LAB_TESTS.map((t) => (
            <li key={t.label}>
              <em>{t.label}</em>
              <b>{t.turnaround}</b>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/ai-tech/lab" className="btn apply">
            Book a test <Icon name="i-cright" />
          </Link>
        </div>
      </section>
    </>
  );
}