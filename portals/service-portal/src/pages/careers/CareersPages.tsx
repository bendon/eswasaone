import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiBase, apiFetch } from "@eswasaone/shared-ui";
import { Breadcrumbs } from "../../components/Breadcrumbs";

/**
 * Careers (journey J2, applicant side): P1 vacancies, P2 vacancy, P3 apply, P4 thank you.
 * Live GET /careers/openings only. No sample vacancies: an empty list is shown as empty.
 * SoT: docs/EswasaOne_HR_SCREENS_AND_JOURNEYS.md §3.4; brief §7.1.
 */

export type CareerOpening = {
  id: string;
  job_title: string;
  department?: string | null;
  designation?: string | null;
  location?: string | null;
  employment_type?: string | null;
  description: string;
  posted_on?: string | null;
  closes_on?: string | null;
  salary?: { lower?: number | null; upper?: number | null; currency?: string | null; per?: string | null } | null;
  /** HR's contact for applicants (HR Settings), sent with every vacancy. */
  contact_email?: string | null;
};
type Receipt = { reference: string; job_title?: string | null; closes_on?: string | null };

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : DAY.format(d);
}

/** Job descriptions come from a rich-text editor; show them as plain paragraphs, never as HTML. */
export function plainParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html.replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, "\n"), "text/html");
  return (doc.body.textContent ?? "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 404 means the vacancy is closed or unpublished; anything else is a failure to load, not a closed vacancy. */
function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { status?: number }).status === 404;
}

export function CareersListPage() {
  const [items, setItems] = useState<CareerOpening[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<{ items: CareerOpening[] }>("/careers/openings")
      .then((r) => setItems(r.items))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Careers" }]} />
      <h1 className="page-h">Work at ESWASA</h1>
      <p className="page-lead">
        Open vacancies at the Eswatini Standards Authority. Apply online with your CV; only shortlisted candidates are
        contacted.
      </p>
      {failed ? (
        <div className="verify-result">
          <b>Vacancies couldn't load</b>
          <p>Try again in a moment.</p>
        </div>
      ) : null}
      {items && !items.length ? (
        <div className="verify-result">
          <b>There are no vacancies right now</b>
          <p>New vacancies are posted here.</p>
        </div>
      ) : null}
      {items?.length ? (
        <ul className="careers-list" style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {items.map((o) => (
            <li key={o.id}>
              <Link to={`/careers/${encodeURIComponent(o.id)}`} className="verify-result" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <b>{o.job_title}</b>
                <p>
                  {[o.department, o.location, o.employment_type].filter(Boolean).join(" · ")}
                  {o.closes_on ? ` · Closes ${fmt(o.closes_on)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {!items && !failed ? <p className="page-note">Loading vacancies…</p> : null}
    </div>
  );
}

export function CareerDetailPage() {
  const { id = "" } = useParams();
  const [job, setJob] = useState<CareerOpening | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    apiFetch<CareerOpening>(`/careers/openings/${encodeURIComponent(id)}`)
      .then(setJob)
      .catch((e) => (isNotFound(e) ? setMissing(true) : setFailed(true)));
  }, [id]);

  const crumbs = [{ label: "Home", to: "/" }, { label: "Careers", to: "/careers" }, { label: job?.job_title ?? "Vacancy" }];

  if (receipt) {
    return (
      <div className="page">
        <Breadcrumbs items={crumbs} />
        <h1 className="page-h">Application received</h1>
        <div className="verify-result ok">
          <b>Thank you. Your reference is {receipt.reference}</b>
          <p>
            We've received your application for {receipt.job_title ?? job?.job_title}. Only shortlisted candidates are
            contacted{receipt.closes_on ? `, usually after the closing date (${fmt(receipt.closes_on)})` : ""}.
          </p>
          <p>Keep your reference if you contact HR about it{job?.contact_email ? `: ${job.contact_email}` : ""}.</p>
        </div>
        <p className="page-note">
          <Link to="/careers">See other vacancies</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs items={crumbs} />
      {failed ? (
        <div className="verify-result">
          <b>This vacancy couldn't load</b>
          <p>Try again in a moment.</p>
        </div>
      ) : null}
      {missing ? (
        <>
          <h1 className="page-h">This vacancy is closed</h1>
          <p className="page-lead">
            It may have passed its closing date. <Link to="/careers">See open vacancies</Link>.
          </p>
        </>
      ) : null}
      {job ? (
        <>
          <h1 className="page-h">{job.job_title}</h1>
          <p className="page-lead">
            {[job.department, job.location, job.employment_type].filter(Boolean).join(" · ")}
            {job.closes_on ? ` · Closes ${fmt(job.closes_on)}` : ""}
          </p>
          {job.salary && (job.salary.lower || job.salary.upper) ? (
            <p className="page-note">
              Pay: {job.salary.currency ? `${job.salary.currency} ` : ""}
              {job.salary.lower ?? "…"} to {job.salary.upper ?? "…"}
              {job.salary.per ? ` a ${job.salary.per.toLowerCase()}` : ""}
            </p>
          ) : null}
          <section aria-labelledby="about-job">
            <h2 id="about-job">About the job</h2>
            {plainParagraphs(job.description).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
          <ApplyForm job={job} onDone={setReceipt} />
        </>
      ) : null}
      {!job && !missing && !failed ? <p className="page-note">Loading…</p> : null}
    </div>
  );
}

function ApplyForm({ job, onDone }: { job: CareerOpening; onDone: (r: Receipt) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cover, setCover] = useState("");
  const [cv, setCv] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = name.trim().length >= 3 && /\S+@\S+\.\S+/.test(email) && cv && consent;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || !cv) return;
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.append("applicant_name", name.trim());
    form.append("email", email.trim());
    if (phone.trim()) form.append("phone", phone.trim());
    if (cover.trim()) form.append("cover_letter", cover.trim());
    form.append("consent", "true");
    form.append("cv", cv);
    try {
      const res = await fetch(`${apiBase()}/careers/openings/${encodeURIComponent(job.id)}/apply`, {
        method: "POST",
        body: form,
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as Receipt & { detail?: string };
      if (!res.ok) throw new Error(body.detail || "Your application wasn't sent. Try again.");
      onDone(body);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Your application wasn't sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="apply-h">
      <h2 id="apply-h">Apply</h2>
      <form className="form" onSubmit={submit} noValidate>
        <label>
          Full name
          <input value={name} autoComplete="name" required onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={email} autoComplete="email" required onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Phone (optional)
          <input type="tel" value={phone} autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          CV (PDF or Word, up to 5 MB)
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            onChange={(e) => setCv(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Why you want this job (optional)
          <textarea rows={5} value={cover} maxLength={4000} onChange={(e) => setCover(e.target.value)} />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree to ESWASA keeping my application and CV to consider me for this vacancy. See the{" "}
            <Link to="/help">privacy policy</Link>.
          </span>
        </label>
        {err ? (
          <div className="verify-result" role="alert">
            <b>Not sent</b>
            <p>{err}</p>
          </div>
        ) : null}
        <button type="submit" className="btn-primary" disabled={!ready || busy}>
          {busy ? "Sending…" : "Send application"}
        </button>
        <p className="page-note">
          Only shortlisted candidates are contacted.
          {job.contact_email ? ` Prefer email? Send your CV to ${job.contact_email} quoting the job title.` : ""}
        </p>
      </form>
    </section>
  );
}
