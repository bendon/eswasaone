import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { requestQuote, schemeById, SCHEMES, type Quote, type QuoteRequest } from "../api/certification";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { clearDraft, loadDraft, saveDraft } from "../certification/demoStore";
import {
  CHARTER,
  fmtDate,
  fmtSize,
  RFQ_MAX_FILES,
  RFQ_MAX_MB,
  RFQ_TYPES,
  type CertFlow,
} from "../certification/flows";
import { FileRow, MultiChoice, TextField, YesNo } from "../certification/ui";

const DRAFT = "quote";

type FormState = Omit<QuoteRequest, "files" | "standards"> & { standards: string[]; standardsOther: string };

function emptyForm(flow: CertFlow | ""): FormState {
  return {
    flow: (flow || "") as CertFlow,
    org: "",
    registration_no: "",
    contact: "",
    position: "",
    email: "",
    phone: "",
    address: "",
    standards: [],
    standardsOther: "",
    scope: "",
    employees: "",
    sites: "",
    based_in_eswatini: "",
    made_in_eswatini: "",
    existing_certs: "",
    timeline: "",
    comments: "",
  };
}

const STANDARD_OPTIONS = SCHEMES.filter((s) => s.flow !== "combined").map((s) => s.code);

export function CertificationQuotePage() {
  const [params] = useSearchParams();
  const preScheme = schemeById(params.get("scheme") || "");
  const preFlow = (params.get("flow") as CertFlow | null) || preScheme?.flow || "";
  const { user, requireAuth } = useAuth();

  const [form, setForm] = useState<FormState>(() => {
    const draft = loadDraft<FormState>(DRAFT);
    const base = draft ?? emptyForm(preFlow);
    if (preFlow && !draft) base.flow = preFlow;
    if (preScheme && !base.standards.includes(preScheme.code) && preScheme.flow !== "combined") {
      base.standards = [...base.standards, preScheme.code];
    }
    return base;
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Quote | null>(null);

  // Prefill contact from the signed-in account, never overwriting typed values.
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      contact: f.contact || user.full_name || "",
      email: f.email || user.email || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!done) saveDraft(DRAFT, form);
  }, [form, done]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isIngelo = form.flow === "ingelo";
  const standardsLabel = useMemo(
    () => [...form.standards, form.standardsOther.trim()].filter(Boolean).join(", "),
    [form.standards, form.standardsOther],
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileErr(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= RFQ_MAX_FILES) {
        setFileErr(`Up to ${RFQ_MAX_FILES} files.`);
        break;
      }
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setFileErr(`${f.name}: PDF files only.`);
        continue;
      }
      if (f.size > RFQ_MAX_MB * 1024 * 1024) {
        setFileErr(`${f.name}: larger than ${RFQ_MAX_MB} MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.flow) e.flow = "Choose the type of certification.";
    if (!form.org.trim()) e.org = "Organisation name is required.";
    if (!form.contact.trim()) e.contact = "Contact person is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Enter a valid email address.";
    if (form.phone.replace(/\D/g, "").length < 7) e.phone = "Enter a phone number we can reach you on.";
    if (!form.scope.trim()) e.scope = "Describe what you want certified.";
    if (!form.based_in_eswatini) e.based_in_eswatini = "Please answer.";
    if (isIngelo && !form.made_in_eswatini) e.made_in_eswatini = "Please answer for Ingelo.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      document.querySelector(".cf-field.is-invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (
      !requireAuth({
        title: "Sign in to send your request",
        reason: "Your quote is linked to your account so you can accept it and turn it into an application.",
        next: "/certification/quote",
      })
    ) {
      return;
    }
    setBusy(true);
    try {
      const { standards: _s, standardsOther: _o, ...rest } = form;
      const q = await requestQuote({
        ...rest,
        standards: standardsLabel,
        files: files.map((f) => ({ name: f.name, size: f.size })),
      });
      clearDraft(DRAFT);
      setDone(q);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  const crumbs = (
    <Breadcrumbs
      items={[
        { label: "Home", to: "/" },
        { label: "Certification", to: "/certification" },
        { label: "Request a quote" },
      ]}
    />
  );

  if (done) {
    return (
      <div className="page">
        {crumbs}
        <div className="cf-wrap cf-wrap--single">
          <section className="cf-card cf-receipt" aria-live="polite">
            <span className="big">
              <Icon name="i-check" />
            </span>
            <h2>Quote request received</h2>
            <div className="ref">{done.id}</div>
            <ul>
              <li>
                <Icon name="i-clock" />
                <span>
                  ESWASA issues quotations within {CHARTER.quoteDays} working days of complete information.
                  Expect yours by <b>{fmtDate(done.due_by)}</b>.
                </span>
              </li>
              <li>
                <Icon name="i-mail" />
                <span>We’ll email {done.contact_email} and show the quote in your account.</span>
              </li>
              <li>
                <Icon name="i-badge" />
                <span>When you accept it, the application form opens pre-filled.</span>
              </li>
            </ul>
            <div className="cf-nav">
              <Link className="cf-btn cf-btn--pri" to="/account/applications">
                <Icon name="i-trend" /> Track in my account
              </Link>
              <Link className="cf-btn cf-btn--ghost" to="/certification">
                Back to certification
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {crumbs}
      <header className="cf-head">
        <div>
          <span className="cf-head__kicker">Certification · Step 1 of your journey</span>
          <h1>Request a certification quote</h1>
          <p>
            Tell us who you are and what you want certified. Cost depends on company size, number of
            sites, scope and, for products, testing needs. You’ll get a quote within{" "}
            {CHARTER.quoteDays} working days.
          </p>
        </div>
        <span className="cf-chip">
          <Icon name="i-clock" /> About 5 minutes · saved as you type
        </span>
      </header>

      <form className="cf-wrap cf-wrap--single" onSubmit={onSubmit} noValidate>
        <section className="cf-card">
          <div className="cf-card__h">
            <div>
              <h2>Certification request</h2>
              <p>Pick the path closest to what you need. ESWASA will confirm the right scheme.</p>
            </div>
          </div>
          <div className="cf-opts" role="radiogroup" aria-label="Type of certification">
            {RFQ_TYPES.map((t) => (
              <label className="cf-opt" key={t.value}>
                <input
                  type="radio"
                  name="flow"
                  checked={form.flow === t.value}
                  onChange={() => set("flow", t.value)}
                />
                <span className="ic">
                  <Icon
                    name={
                      t.value === "ms"
                        ? "i-layers"
                        : t.value === "product"
                          ? "i-badge"
                          : t.value === "ingelo"
                            ? "i-users"
                            : "i-grid"
                    }
                  />
                </span>
                <div>
                  <b>{t.label.split(" (")[0]}</b>
                  <span>{t.label.includes("(") ? t.label.slice(t.label.indexOf("(") + 1, -1) : ""}</span>
                </div>
              </label>
            ))}
          </div>
          {errors.flow ? <p className="cf-field"><span className="err">{errors.flow}</span></p> : null}

          <div className="cf-sec">What to certify</div>
          <div className="cf-grid">
            <MultiChoice
              className="span2"
              label="Applicable standards (if known)"
              values={form.standards}
              onChange={(v) => set("standards", v)}
              options={STANDARD_OPTIONS}
            />
            <TextField
              className="span2"
              label="Other standard"
              value={form.standardsOther}
              onChange={(v) => set("standardsOther", v)}
              placeholder="e.g. SZNS SANS 542:2020 concrete roof tiles"
            />
            <TextField
              className="span2"
              label="Scope of certification"
              required
              multiline
              value={form.scope}
              onChange={(v) => set("scope", v)}
              error={errors.scope}
              placeholder="e.g. Processing and bottling of honey at our Big Bend plant"
            />
            <TextField
              label="Number of employees"
              value={form.employees}
              onChange={(v) => set("employees", v.replace(/[^\d]/g, ""))}
              inputMode="numeric"
            />
            <TextField
              label="Number of sites / locations"
              value={form.sites}
              onChange={(v) => set("sites", v.replace(/[^\d]/g, ""))}
              inputMode="numeric"
            />
            <YesNo
              label="Is your organisation based in Eswatini?"
              required
              value={form.based_in_eswatini}
              onChange={(v) => set("based_in_eswatini", v)}
              error={errors.based_in_eswatini}
            />
            {isIngelo ? (
              <YesNo
                label="For Ingelo: is the product manufactured in Eswatini?"
                required
                value={form.made_in_eswatini}
                onChange={(v) => set("made_in_eswatini", v)}
                error={errors.made_in_eswatini}
              />
            ) : null}
          </div>
          {isIngelo && form.made_in_eswatini === "no" ? (
            <div className="cf-note cf-note--warn" style={{ marginTop: 14 }}>
              <Icon name="i-warn" />
              <span>
                Ingelo is for goods produced in Eswatini. You can still request a quote for Product
                Certification instead.
              </span>
            </div>
          ) : null}
        </section>

        <section className="cf-card">
          <div className="cf-card__h">
            <div>
              <h2>Organisation details</h2>
            </div>
          </div>
          <div className="cf-grid">
            <TextField
              className="span2"
              label="Organisation name"
              required
              value={form.org}
              onChange={(v) => set("org", v)}
              error={errors.org}
              autoComplete="organization"
            />
            <TextField
              label="Company registration number"
              value={form.registration_no}
              onChange={(v) => set("registration_no", v)}
            />
            <TextField
              label="Physical address"
              value={form.address}
              onChange={(v) => set("address", v)}
              autoComplete="street-address"
            />
            <TextField
              label="Contact person"
              required
              value={form.contact}
              onChange={(v) => set("contact", v)}
              error={errors.contact}
              autoComplete="name"
            />
            <TextField label="Position" value={form.position} onChange={(v) => set("position", v)} />
            <TextField
              label="Email address"
              required
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(v) => set("email", v)}
              error={errors.email}
              autoComplete="email"
            />
            <TextField
              label="Phone number"
              required
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              error={errors.phone}
              placeholder="+268 7…"
              autoComplete="tel"
            />
          </div>
        </section>

        <section className="cf-card">
          <div className="cf-card__h">
            <div>
              <h2>Supporting information</h2>
              <p>Optional. It helps us price the work accurately the first time.</p>
            </div>
          </div>
          <div className="cf-grid">
            <TextField
              label="Existing certifications (if any)"
              value={form.existing_certs}
              onChange={(v) => set("existing_certs", v)}
              placeholder="e.g. HACCP since 2022"
            />
            <TextField
              label="Desired certification timeline"
              value={form.timeline}
              onChange={(v) => set("timeline", v)}
              placeholder="e.g. Before the March export season"
            />
            <div className="cf-field span2">
              <span className="lbl">Upload documents (optional)</span>
              <div className="cf-files">
                {files.map((f, i) => (
                  <FileRow
                    key={`${f.name}-${i}`}
                    title={f.name}
                    sub={fmtSize(f.size)}
                    state="ok"
                    action={
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost cf-btn--sm"
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.name}`}
                      >
                        <Icon name="i-x" />
                      </button>
                    }
                  />
                ))}
                {files.length < RFQ_MAX_FILES ? (
                  <label className="cf-upload" style={{ alignSelf: "flex-start" }}>
                    <Icon name="i-dl" /> Add PDF
                    <input
                      type="file"
                      accept="application/pdf"
                      multiple
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <span className="hint">
                PDF only, up to {RFQ_MAX_MB} MB each, maximum {RFQ_MAX_FILES} files.
              </span>
              {fileErr ? <span className="err">{fileErr}</span> : null}
            </div>
            <TextField
              className="span2"
              label="Additional comments"
              multiline
              value={form.comments}
              onChange={(v) => set("comments", v)}
            />
          </div>
        </section>

        <div className="cf-nav">
          <button type="submit" className="cf-btn cf-btn--pri" disabled={busy}>
            <Icon name="i-send" /> {busy ? "Sending…" : "Submit request for quotation"}
          </button>
          <Link className="cf-btn cf-btn--ghost" to="/certification">
            Cancel
          </Link>
          <span className="grow" />
          <span className="cf-nav__saved">Draft saved on this device</span>
        </div>
      </form>
    </div>
  );
}
