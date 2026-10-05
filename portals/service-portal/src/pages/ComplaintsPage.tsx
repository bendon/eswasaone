import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { lodgeComplaint } from "../api/misc";
import { Breadcrumbs } from "../components/Breadcrumbs";

export function ComplaintsPage() {
  const [params] = useSearchParams();
  const topic = params.get("topic");
  const caseRef = params.get("ref");
  const [subject, setSubject] = useState(
    caseRef ? `Certification ${caseRef}` : topic === "certification" ? "Certification: concern about a certified client" : "",
  );
  const [detail, setDetail] = useState("");
  const [contact, setContact] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await lodgeComplaint({ subject, detail, contact: contact || undefined });
      setRef(res.id);
      setSubject("");
      setDetail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Complaints" }]} />
      <h1 className="page-h">Complaints &amp; enquiries</h1>
      <p className="page-lead">Anonymous reports are allowed. Add contact details if you want a reply.</p>
      {topic === "certification" || caseRef ? (
        <p className="page-note">
          Certification complaints follow CER_PR_006: acknowledged within 3 working days and resolved within
          30 where possible. To contest a certification decision, lodge an appeal from your{" "}
          <Link to="/account/applications">application tracker</Link> instead (CER_PR_002, within 90 days).
        </p>
      ) : null}
      {ref ? (
        <p className="page-note">Received. Reference {ref}. Typical response 24–48 hours.</p>
      ) : null}
      <form className="form" onSubmit={onSubmit}>
        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
        <label>
          Details
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={5} required />
        </label>
        <label>
          Contact (optional)
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email or phone"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Submit"}
        </button>
      </form>
    </div>
  );
}
