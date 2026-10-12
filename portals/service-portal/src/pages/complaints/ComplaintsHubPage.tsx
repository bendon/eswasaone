import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { PUBLIC_CASE_TYPES, publicCrmConfig } from "@eswasaone/shared-ui/crm";
import { Breadcrumbs } from "../../components/Breadcrumbs";

/**
 * Complaints & enquiries hub — choose what you need, track a case, or appeal.
 * Legacy deep links (?topic=certification, ?ref=CERT-…) go straight to the right form.
 */
export function ComplaintsHubPage() {
  const cfg = publicCrmConfig();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [ref, setRef] = useState("");
  const topic = params.get("topic");
  const appRef = params.get("ref");

  // Old links from Certification pages land on the product report form, prefilled.
  if (topic === "certification" || appRef) {
    const q = new URLSearchParams();
    if (appRef) q.set("ref", appRef);
    return <Navigate replace to={`/complaints/new/${appRef ? "service_complaint" : "product_report"}?${q.toString()}`} />;
  }

  function track(e: FormEvent) {
    e.preventDefault();
    navigate(`/complaints/track?ref=${encodeURIComponent(ref.trim().toUpperCase())}`);
  }

  const complaint = cfg.case_types.service_complaint;
  return (
    <div className="page crm-pub">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Complaints & enquiries" }]} />
      <section className="crm-pub__hero">
        <div className="crm-pub__eyebrow">Complaints &amp; enquiries</div>
        <h1>Tell us what's wrong, or ask us anything</h1>
        <p>
          Every case gets a reference number and a tracking page. You can stay anonymous, and nobody needs an account to report a
          product or a fake mark.
        </p>
        <div className="crm-pub__promise">
          <span>Acknowledged within {complaint.ack_days} working days</span>
          <span>Complaints resolved within {complaint.resolve_days} working days</span>
          <span>Reopen within {cfg.reopen_days} days if you're not satisfied</span>
        </div>
      </section>

      <div className="crm-choices">
        {PUBLIC_CASE_TYPES.map((t) => {
          const c = cfg.case_types[t.type];
          return (
            <Link key={t.type} to={`/complaints/new/${t.type}`} className="crm-choice">
              <span className="crm-choice__ic">
                <Icon name={t.icon as IconName} />
              </span>
              <b>{c.label}</b>
              <p>{t.blurb}</p>
              <em>Reply within {c.resolve_days} working days</em>
            </Link>
          );
        })}
        <Link to="/account/applications" className="crm-choice crm-choice--alt">
          <span className="crm-choice__ic">
            <Icon name="i-scroll" />
          </span>
          <b>Appeal a certification decision</b>
          <p>Heard by an independent panel, never the person who made the decision. Lodge it from your application within 90 days.</p>
          <em>Sign in to your account</em>
        </Link>
        <Link to="/contact-sales" className="crm-choice crm-choice--alt">
          <span className="crm-choice__ic">
            <Icon name="i-briefcase" />
          </span>
          <b>Request a quote or talk to us</b>
          <p>Certification, testing, calibration, training or standards — tell us what you need and we'll come back with a price.</p>
          <em>Usually within 2 working days</em>
        </Link>
      </div>

      <div className="crm-grid crm-grid--2" style={{ marginTop: 22 }}>
        <form className="crm-card" onSubmit={track}>
          <div className="crm-card__h">
            <div>
              <h3>Track a case</h3>
              <p>Use the reference from your confirmation (e.g. CS-26-0141).</p>
            </div>
          </div>
          <div className="crm-row" style={{ flexWrap: "nowrap" }}>
            <input className="crm-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Case reference" aria-label="Case reference" />
            <button type="submit" className="crm-btn crm-btn--pri" disabled={!ref.trim()}>
              Track
            </button>
          </div>
          <p className="crm-small" style={{ marginTop: 10 }}>
            Signed in? See all your cases in <Link to="/account/cases">My account → Cases</Link>.
          </p>
        </form>
        <div className="crm-card">
          <div className="crm-card__h">
            <div>
              <h3>Other ways to reach us</h3>
              <p>We log phone, email, WhatsApp and walk-in cases the same way.</p>
            </div>
          </div>
          <div className="crm-stack" style={{ gap: 8, fontSize: 13.5 }}>
            <span className="crm-row">
              <Icon name="i-phone" size={16} /> (+268) 2518 4633
            </span>
            <span className="crm-row">
              <Icon name="i-mail" size={16} /> <a href="mailto:info@eswasa.co.sz">info@eswasa.co.sz</a>
            </span>
            <span className="crm-row">
              <Icon name="i-pin" size={16} /> ESWASA offices, Matsapha
            </span>
          </div>
        </div>
      </div>
      <p className="crm-small" style={{ marginTop: 16 }}>
        Complaints are handled under CER_PR_006 and appeals under CER_PR_002. Complaints about a certified company are investigated
        impartially; for confidentiality we can't share another company's details, but we will tell you when the investigation is complete.
      </p>
    </div>
  );
}

