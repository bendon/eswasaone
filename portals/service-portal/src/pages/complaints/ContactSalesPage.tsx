import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmNotConnected,
  CrmNotConnectedError,
  SERVICE_LABEL,
  submitInboundEnquiry,
  type ServiceLine,
} from "@eswasaone/shared-ui/crm";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { useAuth } from "../../auth/AuthProvider";

const SERVICES: { id: ServiceLine; blurb: string }[] = [
  { id: "certification", blurb: "ISO management systems, product marks, Ingelo" },
  { id: "testing", blurb: "Microbiology, chemistry, product testing" },
  { id: "calibration", blurb: "Scales, thermometers, gauges — in the lab or on site" },
  { id: "training", blurb: "Public courses or in-house training" },
  { id: "standards", blurb: "Copies of standards or a subscription" },
  { id: "inspection", blurb: "Export and import inspection" },
];

const SECTORS = [
  "Food & beverage",
  "Agriculture",
  "Manufacturing",
  "Timber & construction",
  "Chemicals",
  "Cosmetics",
  "Textiles",
  "Health",
  "Energy",
  "Electrical",
  "Tourism",
  "Handicrafts",
  "Other",
];

/** "Request a quote / talk to us" — becomes an inbound-enquiry signal in the staff CRM. */
export function ContactSalesPage() {
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [organisation, setOrganisation] = useState("");
  const [contact, setContact] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [sector, setSector] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await submitInboundEnquiry({ organisation, contact, email, phone: phone || undefined, sector: sector || undefined, services, message });
      setDone(true);
    } catch (e2) {
      if (e2 instanceof CrmNotConnectedError) setNotConnected(true);
      else setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  const crumbs = [{ label: "Home", to: "/" }, { label: "Request a quote" }];

  if (done) {
    return (
      <div className="page crm-pub" style={{ maxWidth: 720 }}>
        <Breadcrumbs items={crumbs} />
        <div className="crm-card crm-done">
          <div className="crm-done__ic">
            <Icon name="i-check" />
          </div>
          <h2>Thanks — we'll be in touch</h2>
          <p className="crm-muted">
            Someone from ESWASA will contact {contact.split(" ")[0] || "you"} at {email} within 2 working days with questions or a quote.
          </p>
          <div className="crm-row" style={{ justifyContent: "center", marginTop: 14 }}>
            <Link className="crm-btn" to="/goals">
              Browse guides while you wait
            </Link>
            <Link className="crm-btn crm-btn--pri" to="/">
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page crm-pub" style={{ maxWidth: 860 }}>
      <Breadcrumbs items={crumbs} />
      <h1 className="page-h">Request a quote or talk to us</h1>
      <p className="page-lead">Tell us what you need. One request can cover several services.</p>
      {notConnected ? (
        <CrmNotConnected what="Quote requests" audience="public" />
      ) : null}
      {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
      <form className="crm-card crm-form" onSubmit={submit}>
        <div className="crm-field">
          What do you need?
          <div className="crm-services">
            {SERVICES.map((s) => {
              const on = services.includes(s.id);
              return (
                <label key={s.id} className={`crm-service${on ? " on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={(e) => setServices((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))} />
                  <span>
                    <b>{SERVICE_LABEL[s.id]}</b>
                    <span className="crm-small">{s.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="crm-form crm-form--2">
          <label className="crm-field">
            Organisation
            <input className="crm-input" value={organisation} onChange={(e) => setOrganisation(e.target.value)} required autoComplete="organization" />
          </label>
          <label className="crm-field">
            Sector
            <select className="crm-select" value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Choose…</option>
              {SECTORS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="crm-field">
            Your name
            <input className="crm-input" value={contact} onChange={(e) => setContact(e.target.value)} required autoComplete="name" />
          </label>
          <label className="crm-field">
            Email
            <input className="crm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="crm-field">
            Phone (optional)
            <input className="crm-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+268" autoComplete="tel" />
          </label>
        </div>
        <label className="crm-field">
          Tell us a bit more
          <span className="hint">Products, number of sites or instruments, deadlines, export markets.</span>
          <textarea className="crm-textarea" value={message} onChange={(e) => setMessage(e.target.value)} required />
        </label>
        <button type="submit" className="crm-btn crm-btn--pri crm-btn--lg" style={{ alignSelf: "flex-start" }} disabled={busy || !services.length}>
          {busy ? "Sending…" : "Send request"}
        </button>
        <span className="crm-small">
          Looking for certification specifically? The <Link to="/certification/quote">certification quote form</Link> asks the scheme questions up front.
        </span>
      </form>
    </div>
  );
}
