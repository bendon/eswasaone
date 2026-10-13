import { useEffect, useState } from "react";
import { getPreferences, updatePreferences, uploadMedia, type UserPreferences } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrEmployeeRecord, HrProfileChanges } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { DocumentsPanel } from "../hr/record/Documents";
import { CompetenceSection, HistorySection, JobSection, LeaveSection, OpenItems } from "../hr/record/RecordParts";
import { DependantRequest, MyFamilyBox } from "./MyFamily";
import { Banner, Crumbs, fmtDay, StatusPill, Tabs } from "./parts";

/**
 * E5 My profile and documents. Live GET /hr/me/record, /hr/me/documents, /hr/me/profile-changes.
 * Corrections go to HR (decided in Approvals); job and pay details aren't changed by request.
 */
type Tab = "record" | "documents" | "corrections" | "security";

export function MyProfile() {
  const { user, sessionKey } = useInstitution();
  const [tab, setTab] = useState<Tab>("record");
  const rec = useApiResource<HrEmployeeRecord>("/hr/me/record", { enabled: Boolean(user), refreshKey: sessionKey });
  const r = rec.data;

  return (
    <div className="hr-view">
      <Crumbs items={[["My HR", "/me"], ["My profile"]]} />
      <div className="hr-head">
        <div>
          <h2>My profile</h2>
          <p>{r ? `${r.employee_name}${r.designation ? `, ${r.designation}` : ""}${r.department ? `, ${r.department}` : ""}` : "Your HR record"}</p>
        </div>
      </div>
      <Tabs
        label="My profile sections"
        value={tab}
        onChange={setTab}
        tabs={[
          ["record", "Record"],
          ["documents", "Documents"],
          ["corrections", "Ask for a correction"],
          ["security", "Security"],
        ]}
      />
      {tab === "record" ? (
        <ResourceGate loading={rec.loading} error={rec.error} onRetry={rec.reload} refreshing={rec.refreshing} hasData={Boolean(r)}>
          {r ? (
            <div className="hr-view">
              <OpenItems r={r} />
              <JobSection r={r} />
              <LeaveSection r={r} />
              <div className="hr-box__h">
                <div>
                  <h3>Authorisations</h3>
                </div>
              </div>
              <CompetenceSection r={r} />
              <div className="hr-box__h">
                <div>
                  <h3>History</h3>
                </div>
              </div>
              <HistorySection r={r} />
              <MyFamilyBox />
            </div>
          ) : null}
        </ResourceGate>
      ) : null}
      {tab === "documents" ? <DocumentsPanel base="/hr/me/documents" self /> : null}
      {tab === "corrections" ? <Corrections /> : null}
      {tab === "security" ? <SecurityTab /> : null}
    </div>
  );
}

function changePill(status: string) {
  if (status === "Approved") return <StatusPill cls="ok" label="Changed" />;
  if (status === "Rejected") return <StatusPill cls="bad" label="Not changed" />;
  return <StatusPill cls="leave" label="With HR" />;
}

/* ------------------------------------------------------------------ */
/* Security tab — OTP (two-factor) toggle                             */
/* ------------------------------------------------------------------ */

function SecurityTab() {
  const { user } = useInstitution();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void getPreferences()
      .then((p) => setPrefs(p))
      .catch((e) => setErr(errorText(e, "Could not load preferences.")))
      .finally(() => setLoading(false));
  }, [user]);

  async function toggleOtp() {
    if (!prefs || busy) return;
    setErr(null);
    setOk(null);
    setBusy(true);
    const next = !prefs.otp_enabled;
    try {
      const updated = await updatePreferences({ otp_enabled: next });
      setPrefs(updated);
      setOk(
        next
          ? "Two-factor authentication is ON. You will need a one-time code at every sign-in."
          : "Two-factor authentication is OFF. You can sign in with just your password.",
      );
    } catch (e) {
      setErr(errorText(e, "Could not update. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="hr-box">
        <div className="hr-box__b">
          <p className="page-note">Loading security settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hr-view">
      <div className="hr-box">
        <div className="hr-box__h">
          <div>
            <h3>Two-factor authentication (OTP)</h3>
            <p>When enabled, you must enter a one-time code sent to your email each time you sign in. Disable for password-only sign-in.</p>
          </div>
        </div>
        <div className="hr-box__b" style={{ gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between" }}>
            <div>
              <strong>Require one-time code at login</strong>
              <p style={{ color: "var(--muted)", margin: "4px 0 0", fontSize: "0.875rem" }}>
                {prefs?.otp_enabled
                  ? "Enabled — a code is emailed at each sign-in."
                  : "Disabled — password-only sign-in."}
              </p>
            </div>
            <label style={{ position: "relative", display: "inline-block", width: 48, height: 26, flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={prefs?.otp_enabled ?? true}
                onChange={() => void toggleOtp()}
                disabled={busy}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  cursor: busy ? "wait" : "pointer",
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: prefs?.otp_enabled ? "var(--brand, #313391)" : "#ccc",
                  transition: "0.3s",
                  borderRadius: 26,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    height: 20, width: 20,
                    left: prefs?.otp_enabled ? 25 : 4,
                    bottom: 3,
                    backgroundColor: "white",
                    transition: "0.3s",
                    borderRadius: "50%",
                  }}
                />
              </span>
            </label>
          </div>
          {err ? (
            <Banner kind="bad" title="Not saved">
              {err}
            </Banner>
          ) : null}
          {ok ? (
            <p className="page-note" role="status">
              {ok}
            </p>
          ) : null}
          {busy ? <p className="page-note" style={{ color: "var(--muted)" }}>Saving…</p> : null}
        </div>
      </div>
    </div>
  );
}

function Corrections() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrProfileChanges>("/hr/me/profile-changes", { enabled: Boolean(user), refreshKey: sessionKey });
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const fields = res.data?.fields ?? [];
  const chosen = fields.find((f) => f.field === field);

  async function send() {
    setErr(null);
    setOk(null);
    if (!field) return setErr("Choose the detail to correct.");
    if (!value.trim()) return setErr("Say what it should be.");
    if (!reason.trim()) return setErr("Say why it needs changing.");
    if (chosen?.evidence_required && !evidence)
      return setErr(field.startsWith("custom_medical_aid") ? "A medical aid change needs evidence, such as your medical aid card." : "A change to your name needs evidence, such as your ID or a marriage certificate.");
    setBusy(true);
    try {
      const link = evidence ? (await uploadMedia(evidence, "hr/evidence", { allowMock: false })).url : undefined;
      await hrSend("/hr/me/profile-changes", { field, requested_value: value.trim(), reason: reason.trim(), evidence: link });
      setOk(`Sent. HR decides it in Approvals and you'll see the answer here.`);
      setField("");
      setValue("");
      setReason("");
      setEvidence(null);
      setFormKey((k) => k + 1);
      res.reload();
    } catch (e) {
      setErr(errorText(e, "Not sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)}>
      <div className="hr-view">
        <div className="hr-box" key={formKey}>
          <div className="hr-box__h">
            <div>
              <h3>Ask HR to correct a detail</h3>
              <p>Personal details, medical aid and the spelling of your name. Job details change through HR; pay and bank details through an HR Manager.</p>
            </div>
          </div>
          <div className="hr-box__b hr-view" style={{ gap: 10 }}>
            <label className="hr-f">
              <span>Detail</span>
              <select className="hr-in" value={field} onChange={(e) => setField(e.target.value)} disabled={busy}>
                <option value="">Choose…</option>
                {fields.map((f) => (
                  <option key={f.field} value={f.field}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="hr-f">
              <span>What it should be</span>
              {field === "custom_medical_aid_main_member" ? (
                <select className="hr-in" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
                  <option value="">Choose…</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              ) : (
                <input className="hr-in" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} />
              )}
            </label>
            <label className="hr-f">
              <span>Why</span>
              <input className="hr-in" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
            </label>
            <label className="hr-f">
              <span>Evidence{chosen?.evidence_required ? " (needed)" : " (optional)"}</span>
              <input className="hr-in" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} disabled={busy} />
            </label>
            {err ? (
              <Banner kind="bad" title="Not sent">
                {err}
              </Banner>
            ) : null}
            {ok ? (
              <p className="page-note" role="status">
                {ok}
              </p>
            ) : null}
            <div>
              <button type="button" className="btn pri" disabled={busy} onClick={() => void send()}>
                {busy ? "Sending…" : "Send to HR"}
              </button>
            </div>
          </div>
        </div>

        <DependantRequest onSent={res.reload} />

        {res.data?.items.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table" aria-label="Correction requests">
              <thead>
                <tr>
                  <th>Detail</th>
                  <th>Asked for</th>
                  <th>Sent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.field_label ?? c.field}</b>
                    </td>
                    <td>{c.requested_value ?? "—"}</td>
                    <td>{c.requested_on ? fmtDay(c.requested_on, true) : "—"}</td>
                    <td>
                      {changePill(c.status)}
                      {c.note ? <small style={{ display: "block", color: "var(--muted)" }}>{c.note}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No correction requests" detail="Requests you send show here with HR's answer." />
        )}
      </div>
    </ResourceGate>
  );
}
