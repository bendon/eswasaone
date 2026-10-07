import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  checkIngeloEligibility,
  schemeById,
  type IngeloEligibility,
  type Person,
  type ProductLine,
  type Quote,
  type Site,
} from "../api/certification";
import {
  CHARTER,
  documentsFor,
  fmtSize,
  FLOW_LABEL,
  fmtDate,
  IAF_CODES,
  INGELO_DISTRIBUTION,
  INGELO_PRODUCT_USE,
  INGELO_VOLUME_PERIOD,
  INGELO_WATER,
  LAB_FIELDS,
  REGIONS,
  REQUIRED_DOCS,
  RFQ_MAX_MB,
} from "./flows";
import { Choice, FileRow, isoToday, MultiChoice, SelectField, TextField, UploadButton, YesNo } from "./ui";
import { det, detList, detProducts, type StepProps } from "./wizard";
import { CERT_EMAIL, demoMode } from "./demoStore";
import { useSchemes } from "./useSchemes";

/* ---------------- steps ---------------- */

export function SchemeStep({
  s,
  set,
  errors,
  quotes,
}: StepProps & { quotes: Quote[] }) {
  const schemes = useSchemes();
  const scheme = schemeById(s.scheme);
  const linkable = quotes.filter(
    (q) => (q.status === "issued" || q.status === "accepted") && !q.application_id,
  );
  const msOptions = schemes.filter((x) => x.flow === "ms").map((x) => x.code);
  return (
    <>
      <div className="cf-grid">
        <SelectField
          className="span2"
          label="Certification scheme"
          required
          value={s.scheme}
          onChange={(v) =>
            set((d) => {
              const next = schemeById(v);
              if (!next) return;
              d.scheme = next.id;
              d.flow = next.flow;
              d.standards = next.flow === "ms" || next.flow === "product" ? [next.code] : [];
            })
          }
          options={schemes.filter((x) => x.flow !== "ingelo").map((x) => ({
            value: x.id,
            label: `${x.code}: ${x.title}`,
          }))}
          error={errors.scheme}
        />
        {s.flow === "combined" ? (
          <MultiChoice
            className="span2"
            label="Management-system standard(s) to combine with the product mark"
            required
            values={s.standards}
            onChange={(v) => set((d) => void (d.standards = v))}
            options={msOptions}
            error={errors.standards}
          />
        ) : null}
        {s.flow === "ms" ? (
          <MultiChoice
            className="span2"
            label="Integrated audit: add other standards (optional)"
            hint="Name any other management-system standards you want certified in the same request. ESWASA confirms how they will be audited."
            values={s.standards.filter((x) => x !== scheme?.code)}
            onChange={(v) => set((d) => void (d.standards = [scheme?.code ?? "", ...v].filter(Boolean)))}
            options={msOptions.filter((x) => x !== scheme?.code)}
          />
        ) : null}
      </div>
      {scheme ? (
        <div className="cf-note" style={{ marginTop: 16 }}>
          <Icon name="i-badge" />
          <span>
            <b>{FLOW_LABEL[scheme.flow]}.</b> {scheme.body} Fee: by quotation.
          </span>
        </div>
      ) : null}

      <div className="cf-sec">Quotation</div>
      {linkable.length ? (
        <div className="cf-opts" role="radiogroup" aria-label="Link a quote">
          {linkable.map((q) => (
            <label className="cf-opt" key={q.id}>
              <input
                type="radio"
                name="quote"
                checked={s.quote_ref === q.id}
                onChange={() => set((d) => void (d.quote_ref = q.id))}
              />
              <span className="ic">
                <Icon name="i-dollar" />
              </span>
              <div>
                <b>
                  {q.id} · SZL {q.total?.toLocaleString() ?? "—"}
                </b>
                <span>
                  {q.standards} · {q.status === "issued" ? `valid until ${fmtDate(q.valid_until)}` : "accepted"}
                </span>
              </div>
            </label>
          ))}
          <label className="cf-opt">
            <input
              type="radio"
              name="quote"
              checked={!s.quote_ref}
              onChange={() => set((d) => void (d.quote_ref = ""))}
            />
            <span className="ic">
              <Icon name="i-file" />
            </span>
            <div>
              <b>Continue without a quote</b>
              <span>ESWASA prices the work after reviewing your application.</span>
            </div>
          </label>
        </div>
      ) : (
        <div className="cf-note">
          <Icon name="i-dollar" />
          <span>
            No quote yet? You can apply now and ESWASA will send a quote after reviewing the application,
            or <Link to={`/certification/quote?scheme=${s.scheme}`}>request a quote first</Link> (issued
            within {CHARTER.quoteDays} working days).
          </span>
        </div>
      )}
      {s.quote_ref && linkable.find((q) => q.id === s.quote_ref)?.status === "issued" ? (
        <div className="cf-note cf-note--warn" style={{ marginTop: 10 }}>
          <Icon name="i-warn" />
          <span>Submitting this application accepts quote {s.quote_ref}.</span>
        </div>
      ) : null}
    </>
  );
}

export function EligibilityStep({ s, set, errors }: StepProps) {
  const el = s.eligibility;
  const res = checkIngeloEligibility(el);
  const q = (k: keyof IngeloEligibility, label: string, hint?: string) => (
    <YesNo
      label={label}
      hint={hint}
      required
      value={el[k] === null ? "" : el[k] ? "yes" : "no"}
      onChange={(v) => set((d) => void (d.eligibility[k] = v === "yes"))}
    />
  );
  return (
    <>
      <div className="cf-grid">
        <div className="span2">{q("citizen", "Is the business owned by Emaswati (Swazi citizens)?")}</div>
        <div className="span2">
          {q("local_msme", "Is it a local micro, small or medium enterprise producing goods or services?")}
        </div>
        <div className="span2">{q("made_here", "Is the product or service produced in Eswatini?")}</div>
        <div className="span2">
          {q(
            "willing_to_scale",
            "Are you willing to scale up production to meet export quota requirements?",
            "Ingelo prepares producers for local, regional and AfCFTA markets.",
          )}
        </div>
      </div>
      {res.eligible ? (
        <div className="cf-note cf-note--ok" style={{ marginTop: 16 }}>
          <Icon name="i-check-c" />
          <span>
            <b>You qualify for Ingelo.</b> Next, book a free pre-application consultation and gap-analysis
            workshop, then complete the application (form CER_FO_002_IPC) online.
          </span>
        </div>
      ) : res.reasons.length ? (
        <div className="cf-note cf-note--err" style={{ marginTop: 16 }}>
          <Icon name="i-alert-c" />
          <span>
            <b>Ingelo isn’t the right fit yet.</b> {res.reasons.join(" ")} You can still{" "}
            <Link to="/certification/quote?flow=product">request a Product Certification quote</Link>, follow
            the <Link to="/certification?path=msme">MSME starter path</Link> or{" "}
            <Link to="/training">train with ESWASA</Link>.
          </span>
        </div>
      ) : null}
      {errors.eligibility && !res.reasons.length ? <p className="cf-field"><span className="err">{errors.eligibility}</span></p> : null}
    </>
  );
}

export function ConsultStep({ s, set, errors }: StepProps) {
  return (
    <>
      <div className="cf-note">
        <Icon name="i-users" />
        <span>
          ESWASA offers <b>free pre-application consultations and gap-analysis workshops</b> for MSMEs.
          An officer checks how close you are to the standard and what to fix first.
        </span>
      </div>
      <div className="cf-grid" style={{ marginTop: 16 }}>
        <Choice
          className="span2"
          label="Would you like a free consultation before ESWASA assesses you?"
          required
          value={s.wantsConsultation}
          onChange={(v) =>
            set((d) => {
              d.wantsConsultation = v as "yes" | "no";
              d.consultation = v === "yes" ? d.consultation ?? { date: "", mode: "", topic: "" } : undefined;
            })
          }
          options={[
            { value: "yes", label: "Yes, book me in" },
            { value: "no", label: "No, I’m ready to apply" },
          ]}
          error={errors.wantsConsultation}
        />
        {s.wantsConsultation === "yes" ? (
          <>
            <TextField
              label="Preferred date"
              type="date"
              min={isoToday()}
              required
              value={s.consultation?.date ?? ""}
              onChange={(v) => set((d) => void (d.consultation = { ...(d.consultation ?? { date: "", mode: "", topic: "" }), date: v }))}
              error={errors.consult_date}
            />
            <SelectField
              label="How should we meet?"
              required
              value={s.consultation?.mode ?? ""}
              onChange={(v) => set((d) => void (d.consultation = { ...(d.consultation ?? { date: "", mode: "", topic: "" }), mode: v }))}
              options={["In person (ESWASA, Matsapha)", "At my premises", "Online (video call)", "Group gap-analysis workshop"]}
              error={errors.consult_mode}
            />
            <TextField
              className="span2"
              label="What would you like help with?"
              multiline
              value={s.consultation?.topic ?? ""}
              onChange={(v) => set((d) => void (d.consultation = { ...(d.consultation ?? { date: "", mode: "", topic: "" }), topic: v }))}
              placeholder="e.g. Labelling, hygiene in a home kitchen, which standard applies to my product"
            />
          </>
        ) : null}
      </div>
    </>
  );
}

export function OrganisationStep({ s, set, errors }: StepProps) {
  const ingelo = s.flow === "ingelo";
  return (
    <div className="cf-grid">
      <TextField
        className="span2"
        label="Name of organisation"
        required
        value={s.org.name}
        onChange={(v) => set((d) => void (d.org.name = v))}
        error={errors.org_name}
        autoComplete="organization"
      />
      {ingelo ? (
        <TextField
          label="Year of first registration"
          value={s.org.year_registered}
          onChange={(v) => set((d) => void (d.org.year_registered = v.replace(/[^\d]/g, "").slice(0, 4)))}
          inputMode="numeric"
        />
      ) : (
        <TextField
          label="Company registration number"
          required
          value={s.org.registration_no}
          onChange={(v) => set((d) => void (d.org.registration_no = v))}
          error={errors.org_reg}
        />
      )}
      <TextField
        label={ingelo ? "Trading licence (where applicable)" : "Trading licence number"}
        value={s.org.trading_licence}
        onChange={(v) => set((d) => void (d.org.trading_licence = v))}
      />
      <TextField
        className="span2"
        label={ingelo ? "Physical address (site location)" : "Physical address"}
        required
        value={s.org.address}
        onChange={(v) => set((d) => void (d.org.address = v))}
        error={errors.org_address}
        autoComplete="street-address"
      />
      <TextField
        label={ingelo ? "Town / Chiefdom" : "Town"}
        required={ingelo}
        value={s.org.town}
        onChange={(v) => set((d) => void (d.org.town = v))}
        error={errors.org_town}
      />
      <SelectField
        label="Region"
        value={s.org.region}
        onChange={(v) => set((d) => void (d.org.region = v))}
        options={REGIONS}
      />
      <TextField
        label="Inkhundla"
        required={ingelo}
        value={s.org.inkhundla}
        onChange={(v) => set((d) => void (d.org.inkhundla = v))}
        error={errors.org_inkhundla}
      />
      <TextField
        label={ingelo ? "No. of personnel" : "Number of employees"}
        required
        value={s.org.employees}
        onChange={(v) => set((d) => void (d.org.employees = v.replace(/[^\d]/g, "")))}
        inputMode="numeric"
        error={errors.org_employees}
      />
      {!ingelo ? (
        <>
          <TextField
            label="Existing certifications (if any)"
            value={s.existing_certs}
            onChange={(v) => set((d) => void (d.existing_certs = v))}
            placeholder="e.g. HACCP (2022), certified by …"
          />
          <TextField
            label="Consultant who assisted you (if any)"
            value={s.consultant}
            onChange={(v) => set((d) => void (d.consultant = v))}
            hint="Also asked on the Ingelo form (3.5)."
          />
        </>
      ) : null}
    </div>
  );
}

function PersonFields({
  p,
  onChange,
  errors,
  prefix,
  required,
}: {
  p: Person;
  onChange: (fn: (p: Person) => void) => void;
  errors: Record<string, string>;
  prefix: "c" | "a";
  required?: boolean;
}) {
  return (
    <>
      <TextField
        label="Full name"
        required={required}
        value={p.name}
        onChange={(v) => onChange((x) => void (x.name = v))}
        error={errors[`${prefix}_name`]}
        autoComplete={prefix === "c" ? "name" : undefined}
      />
      <TextField
        label="Designation / position"
        value={p.position}
        onChange={(v) => onChange((x) => void (x.position = v))}
      />
      <TextField
        label="Telephone / mobile"
        required={required}
        type="tel"
        inputMode="tel"
        value={p.phone}
        onChange={(v) => onChange((x) => void (x.phone = v))}
        error={errors[`${prefix}_phone`]}
        placeholder="+268 7…"
      />
      <TextField
        label="Email address"
        required={required}
        type="email"
        inputMode="email"
        value={p.email}
        onChange={(v) => onChange((x) => void (x.email = v))}
        error={errors[`${prefix}_email`]}
      />
    </>
  );
}

export function ContactsStep({ s, set, errors }: StepProps) {
  const ingelo = s.flow === "ingelo";
  return (
    <>
      <div className="cf-sec">{ingelo ? "Contact person / informant" : "Main contact"}</div>
      <div className="cf-grid">
        <PersonFields
          p={s.contact}
          onChange={(fn) => set((d) => fn(d.contact))}
          errors={errors}
          prefix="c"
          required
        />
        {ingelo ? (
          <TextField
            label="National identity number"
            required
            value={det(s, "national_id")}
            onChange={(v) => set((d) => void (d.details.national_id = v))}
            error={errors.national_id}
            hint="Form CER_FO_002_IPC, item 1.9."
          />
        ) : null}
      </div>
      <div className="cf-sec">Alternative contact (another person)</div>
      <div className="cf-grid">
        <PersonFields
          p={s.alt_contact}
          onChange={(fn) => set((d) => fn(d.alt_contact))}
          errors={errors}
          prefix="a"
        />
      </div>
    </>
  );
}

export function ScopeStep({ s, set, errors }: StepProps) {
  const updateSite = (i: number, fn: (x: Site) => void) =>
    set((d) => {
      fn(d.sites[i]);
    });
  return (
    <>
      <div className="cf-grid">
        <TextField
          className="span2"
          label="Scope of certification"
          required
          multiline
          value={s.scope}
          onChange={(v) => set((d) => void (d.scope = v))}
          error={errors.scope}
          hint="The activities, products/services and locations you want certified."
        />
      </div>
      <div className="cf-sec">Sites</div>
      <div className="cf-rows">
        {s.sites.map((site, i) => (
          <div className="cf-row" key={i}>
            {s.sites.length > 1 ? (
              <button
                type="button"
                className="cf-btn cf-btn--ghost cf-btn--sm cf-row__x"
                onClick={() => set((d) => void d.sites.splice(i, 1))}
                aria-label={`Remove site ${i + 1}`}
              >
                <Icon name="i-x" />
              </button>
            ) : null}
            <div className="cf-grid">
              <TextField label="Site name" value={site.name} onChange={(v) => updateSite(i, (x) => void (x.name = v))} />
              <TextField
                label="Address"
                required
                value={site.address}
                onChange={(v) => updateSite(i, (x) => void (x.address = v))}
              />
              <TextField
                label="Employees at this site"
                value={site.employees}
                onChange={(v) => updateSite(i, (x) => void (x.employees = v.replace(/[^\d]/g, "")))}
                inputMode="numeric"
              />
              <SelectField
                label="Shifts"
                value={site.shifts}
                onChange={(v) => updateSite(i, (x) => void (x.shifts = v))}
                options={["1", "2", "3", "Continuous"]}
              />
            </div>
          </div>
        ))}
      </div>
      {errors.sites ? <p className="cf-field"><span className="err">{errors.sites}</span></p> : null}
      <button
        type="button"
        className="cf-add"
        onClick={() => set((d) => void d.sites.push({ name: "", address: "", employees: "", shifts: "1" }))}
      >
        <Icon name="i-plus" /> Add another site
      </button>
    </>
  );
}

export function SystemStep({ s, set, errors }: StepProps) {
  return (
    <div className="cf-grid">
      <SelectField
        className="span2"
        label="Sector (IAF code)"
        required
        value={det(s, "iaf")}
        onChange={(v) => set((d) => void (d.details.iaf = v))}
        options={IAF_CODES.map((x) => ({ value: x.code, label: x.label }))}
        error={errors.iaf}
        hint="ESWASA’s SADCAS accreditation covers IAF codes 3, 12, 13 and 38 for ISO 9001."
      />
      <TextField
        label="System implemented since"
        type="month"
        max={isoToday(true)}
        value={det(s, "implemented_since")}
        onChange={(v) => set((d) => void (d.details.implemented_since = v))}
      />
      <TextField
        label="Outsourced processes (if any)"
        value={det(s, "outsourced")}
        onChange={(v) => set((d) => void (d.details.outsourced = v))}
        placeholder="e.g. Transport, laboratory testing"
      />
      <YesNo
        label="Have you completed a full internal audit?"
        required
        value={det(s, "internal_audit_done")}
        onChange={(v) => set((d) => void (d.details.internal_audit_done = v))}
        error={errors.internal_audit_done}
      />
      <YesNo
        label="Has top management held a management review?"
        required
        value={det(s, "mgmt_review_done")}
        onChange={(v) => set((d) => void (d.details.mgmt_review_done = v))}
        error={errors.mgmt_review_done}
      />
      <YesNo
        label="Transferring from another certification body?"
        value={det(s, "transfer")}
        onChange={(v) => set((d) => void (d.details.transfer = v))}
      />
      <TextField
        label="Preferred Stage 1 audit window"
        value={det(s, "preferred_window")}
        onChange={(v) => set((d) => void (d.details.preferred_window = v))}
        placeholder="e.g. First half of November"
        hint={`Service Charter: audit scheduling within ${CHARTER.auditScheduleDays} working days.`}
      />

    </div>
  );
}

export function ProductsStep({ s, set, errors }: StepProps) {
  const products = detProducts(s);
  const update = (i: number, fn: (p: ProductLine) => void) =>
    set((d) => {
      const list = detProducts(d).map((p) => ({ ...p }));
      fn(list[i]);
      d.details.products = list;
    });
  return (
    <>
      <p className="cf-head" style={{ margin: 0 }}>
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
          List every product (or product type) that should carry the SZNS mark, and the standard it must meet.
        </span>
      </p>
      <div className="cf-rows" style={{ marginTop: 12 }}>
        {products.map((p, i) => (
          <div className="cf-row" key={i}>
            {products.length > 1 ? (
              <button
                type="button"
                className="cf-btn cf-btn--ghost cf-btn--sm cf-row__x"
                onClick={() => set((d) => void (d.details.products = detProducts(d).filter((_, j) => j !== i)))}
                aria-label={`Remove product ${i + 1}`}
              >
                <Icon name="i-x" />
              </button>
            ) : null}
            <div className="cf-grid">
              <TextField label="Product name" required value={p.name} onChange={(v) => update(i, (x) => void (x.name = v))} />
              <TextField label="Brand / trade name" value={p.brand} onChange={(v) => update(i, (x) => void (x.brand = v))} />
              <TextField
                label="Model / type / pack size"
                value={p.model}
                onChange={(v) => update(i, (x) => void (x.model = v))}
              />
              <TextField
                label="Applicable standard"
                required
                value={p.standard}
                onChange={(v) => update(i, (x) => void (x.standard = v))}
                placeholder="e.g. SZNS SANS 542:2020"
              />
            </div>
          </div>
        ))}
      </div>
      {errors.products ? <p className="cf-field"><span className="err">{errors.products}</span></p> : null}
      <button
        type="button"
        className="cf-add"
        onClick={() =>
          set((d) => void (d.details.products = [...detProducts(d), { name: "", brand: "", model: "", standard: "" }]))
        }
      >
        <Icon name="i-plus" /> Add product
      </button>
      <p className="hint" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12 }}>
        Not sure which standard applies? <Link to="/standards">Search standards</Link> or{" "}
        <Link to="/applicability">check applicability</Link>.
      </p>
    </>
  );
}

export function FactoryStep({ s, set, errors }: StepProps) {
  return (
    <div className="cf-grid">
      <TextField
        className="span2"
        label="Factory / plant address"
        required
        value={det(s, "factory_address")}
        onChange={(v) => set((d) => void (d.details.factory_address = v))}
        error={errors.factory_address}
        hint="ESWASA assesses your process and systems here (initial assessment)."
      />
      <TextField
        label="Production capacity"
        value={det(s, "capacity")}
        onChange={(v) => set((d) => void (d.details.capacity = v))}
        placeholder="e.g. 2,000 units per week"
      />
      <TextField
        label="Number of production lines"
        value={det(s, "lines")}
        onChange={(v) => set((d) => void (d.details.lines = v.replace(/[^\d]/g, "")))}
        inputMode="numeric"
      />
      <YesNo
        label="Do you run in-house quality control / testing?"
        required
        value={det(s, "in_house_qc")}
        onChange={(v) => set((d) => void (d.details.in_house_qc = v))}
        error={errors.in_house_qc}
      />
      <YesNo
        label="Are product samples available for sampling now?"
        required
        value={det(s, "samples_ready")}
        onChange={(v) => set((d) => void (d.details.samples_ready = v))}
        error={errors.samples_ready}
      />
      <MultiChoice
        className="span2"
        label="Testing likely needed (accredited laboratory)"
        values={detList(s, "lab_fields")}
        onChange={(v) => set((d) => void (d.details.lab_fields = v))}
        options={LAB_FIELDS}
        hint="ESWASA facilitates testing in these fields through accredited laboratories."
      />
      <TextField
        className="span2"
        label="Where will the mark appear?"
        value={det(s, "mark_use")}
        onChange={(v) => set((d) => void (d.details.mark_use = v))}
        placeholder="e.g. Product label and outer carton"
        hint="Use of the mark follows CER_RU_028."
      />
    </div>
  );
}

export function BusinessStep({ s, set, errors }: StepProps) {
  const uses = detList(s, "product_use");
  return (
    <div className="cf-grid">
      <YesNo
        label="2.1 Are you operating in a cottage?"
        required
        value={det(s, "cottage")}
        onChange={(v) => set((d) => void (d.details.cottage = v))}
        error={errors.cottage}
      />
      <YesNo
        label="2.2 Is potable water available?"
        required
        value={det(s, "potable_water")}
        onChange={(v) => set((d) => void (d.details.potable_water = v))}
        error={errors.potable_water}
      />
      {det(s, "potable_water") === "yes" ? (
        <Choice
          className="span2"
          label="Water source"
          value={det(s, "water_source")}
          onChange={(v) => set((d) => void (d.details.water_source = v))}
          options={INGELO_WATER.filter((w) => w !== "None")}
        />
      ) : null}
      <TextField
        className="span2"
        label="2.3 State product or service"
        required
        value={det(s, "product_or_service")}
        onChange={(v) => set((d) => void (d.details.product_or_service = v))}
        error={errors.product_or_service}
        placeholder="e.g. Marula body butter, 250 ml"
      />
      <TextField
        label="2.4 Total number of personnel"
        value={det(s, "total_personnel") || s.org.employees}
        onChange={(v) => set((d) => void (d.details.total_personnel = v.replace(/[^\d]/g, "")))}
        inputMode="numeric"
      />
      <TextField
        label="2.9 Annual revenue (SZL)"
        value={det(s, "annual_revenue")}
        onChange={(v) => set((d) => void (d.details.annual_revenue = v))}
        inputMode="numeric"
      />
      <MultiChoice
        className="span2"
        label="2.5 Product use"
        required
        values={uses}
        onChange={(v) => set((d) => void (d.details.product_use = v))}
        options={INGELO_PRODUCT_USE}
        error={errors.product_use}
      />
      {uses.includes("Other") ? (
        <TextField
          className="span2"
          label="Other use, specify"
          value={det(s, "product_use_other")}
          onChange={(v) => set((d) => void (d.details.product_use_other = v))}
        />
      ) : null}
      <MultiChoice
        className="span2"
        label="2.6 Distribution channels"
        required
        values={detList(s, "distribution")}
        onChange={(v) => set((d) => void (d.details.distribution = v))}
        options={INGELO_DISTRIBUTION}
        error={errors.distribution}
      />
      {detList(s, "distribution").some((x) => x !== "Informal") ? (
        <TextField
          className="span2"
          label="2.7 Name(s) of wholesaler(s) or retailer(s)"
          value={det(s, "wholesalers")}
          onChange={(v) => set((d) => void (d.details.wholesalers = v))}
        />
      ) : null}
      <TextField
        label="2.8 Volumes you supply"
        value={det(s, "volumes")}
        onChange={(v) => set((d) => void (d.details.volumes = v))}
        placeholder="e.g. 120 jars"
      />
      <Choice
        label="Per"
        value={det(s, "volume_period")}
        onChange={(v) => set((d) => void (d.details.volume_period = v))}
        options={INGELO_VOLUME_PERIOD}
      />
      <TextField
        className="span2"
        label="2.10 Are you planning to grow your business? Explain."
        multiline
        value={det(s, "growth_plans")}
        onChange={(v) => set((d) => void (d.details.growth_plans = v))}
      />
      <TextField
        className="span2"
        label="2.11 Any challenges?"
        multiline
        value={det(s, "challenges")}
        onChange={(v) => set((d) => void (d.details.challenges = v))}
      />
    </div>
  );
}

export function RequirementsStep({ s, set, errors }: StepProps) {
  return (
    <div className="cf-grid">
      <YesNo
        label="3.1 Have you started production?"
        required
        value={det(s, "production_started")}
        onChange={(v) => set((d) => void (d.details.production_started = v))}
        error={errors.production_started}
      />
      <Choice
        label="3.2 Are you seeking a product or a service certification?"
        required
        value={det(s, "cert_kind")}
        onChange={(v) => set((d) => void (d.details.cert_kind = v))}
        options={["Product", "Service"]}
        error={errors.cert_kind}
      />
      <YesNo
        label="3.3 Have you implemented any standard(s)?"
        required
        value={det(s, "standards_implemented")}
        onChange={(v) => set((d) => void (d.details.standards_implemented = v))}
        error={errors.standards_implemented}
      />
      {det(s, "standards_implemented") === "yes" ? (
        <TextField
          label="Which standard(s)?"
          value={det(s, "standards_which")}
          onChange={(v) => set((d) => void (d.details.standards_which = v))}
        />
      ) : (
        <YesNo
          label="3.4 If not, do you have a documented system?"
          value={det(s, "documented_system")}
          onChange={(v) => set((d) => void (d.details.documented_system = v))}
        />
      )}
      <TextField
        className="span2"
        label="3.5 Were you assisted by a consultant? If yes, provide the full name."
        value={s.consultant}
        onChange={(v) => set((d) => void (d.consultant = v))}
        placeholder="Leave blank if not"
      />
      <YesNo
        className="span2"
        label="3.6 Do you have any other support (financial or otherwise), other than your own or government funds, to make structural adjustments?"
        required
        value={det(s, "other_support")}
        onChange={(v) => set((d) => void (d.details.other_support = v))}
        error={errors.other_support}
      />
      {det(s, "other_support") === "yes" ? (
        <TextField
          className="span2"
          label="Describe the support"
          value={det(s, "other_support_detail")}
          onChange={(v) => set((d) => void (d.details.other_support_detail = v))}
        />
      ) : null}
    </div>
  );
}

export function DocumentsStep({ s, set, errors }: StepProps) {
  const docs = REQUIRED_DOCS[s.flow];
  const [fileErr, setFileErr] = useState<string | null>(null);
  function onFile(key: string, f: File, multiple?: boolean) {
    if (f.size > RFQ_MAX_MB * 1024 * 1024) {
      setFileErr(`${f.name} is larger than ${RFQ_MAX_MB} MB.`);
      return;
    }
    setFileErr(null);
    set((d) => {
      const others = multiple ? d.documents : d.documents.filter((x) => x.key !== key);
      d.documents = [...others, { key, name: f.name, size: f.size }];
    });
  }
  if (!demoMode()) {
    // TODO: wire real (POST /certification/applications/{id}/documents). Until then, be explicit.
    return (
      <>
        <div className="cf-note cf-note--warn">
          <Icon name="i-warn" />
          <span>
            <b>Online document upload isn’t connected to ESWASA yet.</b> After you submit, email your documents
            to <a href={`mailto:${CERT_EMAIL}`}>{CERT_EMAIL}</a> quoting your application reference.
          </span>
        </div>
        <ul className="cf-bul" style={{ marginTop: 12 }}>
          {docs.map((d) => (
            <li key={d.key} className={d.required ? "" : "opt"}>
              <Icon name={d.required ? "i-check" : "i-file"} />
              <span>
                {d.label}
                {d.required ? "" : " (optional)"}
                {d.hint ? `: ${d.hint}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <>
      <div className="cf-note">
        <Icon name="i-warn" />
        <span>Demo mode: files stay on this device and are not sent to ESWASA.</span>
      </div>
      <div className="cf-files" style={{ marginTop: 12 }}>
        {docs.map((doc) => {
          const ups = s.documents.filter((x) => x.key === doc.key);
          return (
            <div key={doc.key} className="cf-files">
              {ups.map((up, i) => (
                <FileRow
                  key={`${up.name}-${i}`}
                  title={doc.label}
                  sub={`${up.name} · ${fmtSize(up.size)}`}
                  state="ok"
                  action={
                    <button
                      type="button"
                      className="cf-btn cf-btn--ghost cf-btn--sm"
                      onClick={() =>
                        set((d) => {
                          const idx = d.documents.findIndex((y) => y.key === doc.key && y.name === up.name);
                          if (idx >= 0) d.documents.splice(idx, 1);
                        })
                      }
                      aria-label={`Remove ${up.name}`}
                    >
                      <Icon name="i-x" />
                    </button>
                  }
                />
              ))}
              {!ups.length || doc.multiple ? (
                <FileRow
                  title={doc.label + (doc.required ? "" : " (optional)")}
                  sub={doc.hint ?? (doc.required ? "Required" : "Optional")}
                  state={ups.length ? "ok" : doc.required ? "req" : "idle"}
                  action={
                    <UploadButton
                      label={ups.length ? "Add another" : "Upload"}
                      accept={doc.key === "photo" ? "image/*,application/pdf" : "application/pdf,image/*"}
                      onFile={(f) => onFile(doc.key, f, doc.multiple)}
                    />
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>PDF or image, up to {RFQ_MAX_MB} MB each.</p>
      {fileErr ? <p className="cf-field"><span className="err">{fileErr}</span></p> : null}
      {errors.documents ? (
        <div className="cf-note cf-note--warn" style={{ marginTop: 10 }}>
          <Icon name="i-warn" />
          <span>{errors.documents}</span>
        </div>
      ) : null}
    </>
  );
}

export function DeclareStep({ s, set, errors }: StepProps) {
  const docs = documentsFor(s.flow);
  const d = s.declarations;
  const row = (k: keyof typeof d, title: string, sub: string) => (
    <label className="cf-check">
      <input type="checkbox" checked={d[k]} onChange={() => set((x) => void (x.declarations[k] = !x.declarations[k]))} />
      <span>
        {title}
        <small>{sub}</small>
      </span>
    </label>
  );
  return (
    <>
      {row("accurate", "The information in this application is true and complete.", "False information may lead to refusal or withdrawal of certification.")}
      {row("mark_rules", "I have read the Rules for the Use of the Certification Mark (CER_RU_028).", "Published with ESWASA's certification documents.")}
      {row("impartiality", "I accept ESWASA’s Impartiality Policy.", "Published with ESWASA's certification policies.")}
      {row("terms", "I accept the certification terms and the Grant of Certification Procedure (CER_PR_014).", "See also suspension, withdrawal and reduced scope (CER_PR_026).")}
      {row("notify_changes", "I will notify ESWASA of significant changes (CER_FO_028).", "Using the client notice of changes form.")}
      {errors.declarations ? <p className="cf-field"><span className="err">{errors.declarations}</span></p> : null}

      <div className="cf-grid" style={{ marginTop: 16 }}>
        <TextField
          label={s.flow === "ingelo" ? "5.5 Signature (type full name of informant)" : "Signature (type your full name)"}
          required
          value={s.signature.name}
          onChange={(v) => set((x) => void (x.signature.name = v))}
          error={errors.signature}
        />
        <TextField
          label="Date"
          type="date"
          max={isoToday()}
          value={s.signature.date}
          onChange={(v) => set((x) => void (x.signature.date = v))}
        />
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13.5 }}>
          Documents that apply to this certification ({docs.length})
        </summary>
        <ul className="cf-bul">
          {docs.map((x) => (
            <li key={x.code}>
              <Icon name="i-file" /> <span><b>{x.code}</b>: {x.title}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
