import { type FormEvent, useState } from "react";
import { lodgeComplaint } from "../api/misc";
import { Breadcrumbs } from "../components/Breadcrumbs";

export function ComplaintsPage() {
  const [subject, setSubject] = useState("");
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
