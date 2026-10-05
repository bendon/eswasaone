import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { apiFetch, AuthError, useDialogs } from "@eswasaone/shared-ui";
import type { HrOrganisation, HrOrganisationCreate, HrOrganisationPatch } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState } from "./PageStates";

/**
 * System Administration → Company — create or edit the Frappe Company singleton.
 */
export function CompanyProfilePanel({
  enabled,
  refreshKey,
}: {
  enabled: boolean;
  refreshKey: string;
}) {
  const dialogs = useDialogs();
  const org = useApiResource<HrOrganisation>("/hr/organisation", {
    enabled,
    refreshKey,
  });
  const [busy, setBusy] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [currency, setCurrency] = useState("SZL");
  const [country, setCountry] = useState("Eswatini");
  const [registration, setRegistration] = useState("");
  const [sector, setSector] = useState("");
  const [address, setAddress] = useState("");
  const [founded, setFounded] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const missing =
    org.error?.toLowerCase().includes("no company") ||
    org.error?.includes("404") ||
    (!org.loading && !org.data && !org.error);

  useEffect(() => {
    if (!org.data) return;
    setLegalName(org.data.legal_name || "");
    setRegistration(org.data.registration_number || "");
    setSector(org.data.sector || "");
    setAddress(org.data.registered_address || "");
    setFounded(org.data.founded_year != null ? String(org.data.founded_year) : "");
  }, [org.data]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const ok = await dialogs.confirm({
      title: "Create company profile",
      message: `Create Company “${legalName.trim()}”? This sets up the organisation masters used by HR and Finance.`,
      confirmLabel: "Create company",
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: HrOrganisationCreate = {
        confirm: true,
        legal_name: legalName.trim(),
        abbr: abbr.trim() || null,
        default_currency: currency.trim() || "SZL",
        country: country.trim() || "Eswatini",
        registration_number: registration.trim() || null,
        sector: sector.trim() || null,
        registered_address: address.trim() || null,
        founded_year: founded.trim() ? Number(founded) : null,
      };
      await apiFetch<HrOrganisation>("/hr/organisation", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMsg("Company created.");
      org.reload();
    } catch (err) {
      const detail =
        err instanceof AuthError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create company";
      await dialogs.alert({ title: "Create failed", message: detail, kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!org.data) return;
    const ok = await dialogs.confirm({
      title: "Update company profile",
      message: "Save changes to the organisation Company record?",
      confirmLabel: "Save",
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: HrOrganisationPatch = {
        confirm: true,
        legal_name: legalName.trim() || undefined,
        registration_number: registration.trim() || null,
        sector: sector.trim() || null,
        registered_address: address.trim() || null,
        founded_year: founded.trim() ? Number(founded) : null,
      };
      await apiFetch<HrOrganisation>("/hr/organisation", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMsg("Company profile saved.");
      org.reload();
    } catch (err) {
      const detail =
        err instanceof AuthError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save company";
      await dialogs.alert({ title: "Save failed", message: detail, kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (org.loading && !org.data && !missing) {
    return <LoadingState label="Loading company profile…" />;
  }

  if (org.error && !missing && !org.data) {
    return <ErrorState message={org.error} onRetry={org.reload} />;
  }

  return (
    <div className="panel">
      {dialogs.host}
      <div className="panel__h" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Company profile</h3>
          <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
            The Frappe Company used by HR structure, payroll, and Finance. Create once, then edit
            details here.
          </p>
        </div>
      </div>

      {missing ? (
        <>
          <EmptyState
            title="No company configured"
            detail="Create the ESWASA Company to unlock organisation structure, employees, and finance masters."
          />
          <form onSubmit={(e) => void handleCreate(e)} style={{ marginTop: 16, maxWidth: 520 }}>
            <CompanyFields
              mode="create"
              legalName={legalName}
              setLegalName={setLegalName}
              abbr={abbr}
              setAbbr={setAbbr}
              currency={currency}
              setCurrency={setCurrency}
              country={country}
              setCountry={setCountry}
              registration={registration}
              setRegistration={setRegistration}
              sector={sector}
              setSector={setSector}
              address={address}
              setAddress={setAddress}
              founded={founded}
              setFounded={setFounded}
            />
            <button type="submit" className="btn gold" disabled={busy || !legalName.trim()}>
              {busy ? "Creating…" : "Create company"}
            </button>
          </form>
        </>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} style={{ maxWidth: 520 }}>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Company id: <code>{org.data?.id}</code>
          </p>
          <CompanyFields
            mode="edit"
            legalName={legalName}
            setLegalName={setLegalName}
            abbr={abbr}
            setAbbr={setAbbr}
            currency={currency}
            setCurrency={setCurrency}
            country={country}
            setCountry={setCountry}
            registration={registration}
            setRegistration={setRegistration}
            sector={sector}
            setSector={setSector}
            address={address}
            setAddress={setAddress}
            founded={founded}
            setFounded={setFounded}
          />
          {msg ? <p style={{ color: "var(--green)", fontSize: 13 }}>{msg}</p> : null}
          <button type="submit" className="btn gold" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
      )}
    </div>
  );
}

function CompanyFields({
  mode,
  legalName,
  setLegalName,
  abbr,
  setAbbr,
  currency,
  setCurrency,
  country,
  setCountry,
  registration,
  setRegistration,
  sector,
  setSector,
  address,
  setAddress,
  founded,
  setFounded,
}: {
  mode: "create" | "edit";
  legalName: string;
  setLegalName: (v: string) => void;
  abbr: string;
  setAbbr: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  registration: string;
  setRegistration: (v: string) => void;
  sector: string;
  setSector: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  founded: string;
  setFounded: (v: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
      <label style={labelStyle}>
        Legal name
        <input
          required
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          style={inputStyle}
          placeholder="Eswatini Standards Authority"
        />
      </label>
      {mode === "create" ? (
        <>
          <label style={labelStyle}>
            Abbreviation
            <input
              value={abbr}
              onChange={(e) => setAbbr(e.target.value)}
              style={inputStyle}
              placeholder="ESW (optional, auto from name)"
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              Currency
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Country
              <input value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle} />
            </label>
          </div>
        </>
      ) : null}
      <label style={labelStyle}>
        Registration / tax id
        <input value={registration} onChange={(e) => setRegistration(e.target.value)} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Sector / domain
        <input value={sector} onChange={(e) => setSector(e.target.value)} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Founded year
        <input
          value={founded}
          onChange={(e) => setFounded(e.target.value)}
          style={inputStyle}
          inputMode="numeric"
          placeholder="YYYY"
        />
      </label>
      <label style={labelStyle}>
        Registered address
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ ...inputStyle, minHeight: 72 }}
        />
      </label>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  font: "inherit",
  boxSizing: "border-box",
};
