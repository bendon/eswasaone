import { useState } from "react";
import { uploadMedia } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrEmployeeRecord, HrProfileChanges } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { DocumentsPanel } from "../hr/record/Documents";
import { CompetenceSection, HistorySection, JobSection, LeaveSection, OpenItems } from "../hr/record/RecordParts";
import { Banner, Crumbs, fmtDay, StatusPill, Tabs } from "./parts";

/**
 * E5 My profile and documents. Live GET /hr/me/record, /hr/me/documents, /hr/me/profile-changes.
 * Corrections go to HR (decided in Approvals); job and pay details aren't changed by request.
 */
type Tab = "record" | "documents" | "corrections";

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
            </div>
          ) : null}
        </ResourceGate>
      ) : null}
      {tab === "documents" ? <DocumentsPanel base="/hr/me/documents" self /> : null}
      {tab === "corrections" ? <Corrections /> : null}
    </div>
  );
}

function changePill(status: string) {
  if (status === "Approved") return <StatusPill cls="ok" label="Changed" />;
  if (status === "Rejected") return <StatusPill cls="bad" label="Not changed" />;
  return <StatusPill cls="leave" label="With HR" />;
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
    if (chosen?.evidence_required && !evidence) return setErr("A change to your name needs evidence, such as your ID or a marriage certificate.");
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
              <p>Personal details and the spelling of your name. Job details change through HR; pay and bank details through an HR Manager.</p>
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
              <input className="hr-in" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} />
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
