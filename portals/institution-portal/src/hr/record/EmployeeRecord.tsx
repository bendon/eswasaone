import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrEmployeeRecord } from "../../api/types";
import { Banner, Crumbs, Tabs } from "../../me/parts";
import { errorText, fileUrl, hrSend } from "../api";
import { AccessLogSection, SensitivePanel } from "../sensitive/Sensitive";
import { DocumentsPanel } from "./Documents";
import { CompetenceSection, HistorySection, JobSection, LeaveSection, OpenItems } from "./RecordParts";

/**
 * H1b Employee record: everything about one person, scoped by the server (HR sees all, a line manager job fields
 * only, never pay). Live GET /hr/employees/{id}. HR can correct name, work email and status (PATCH; moves go
 * through promotion/transfer), verify documents and print the certificate of service.
 */
type Tab = "summary" | "job" | "leave" | "competence" | "documents" | "history" | "access";

export function EmployeeRecord() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const [tab, setTab] = useState<Tab>("summary");
  const [logKey, setLogKey] = useState(0);
  const res = useApiResource<HrEmployeeRecord>(`/hr/employees/${encodeURIComponent(id)}`, { enabled: Boolean(user && id), refreshKey: sessionKey });
  const r = res.data;
  const hr = r?.viewer === "hr";
  const base = `/hr/directory/${encodeURIComponent(id)}`;

  const tabs: Array<[Tab, string]> = [
    ["summary", "Summary"],
    ["job", "Job and contract"],
    ["leave", "Leave"],
    ["competence", "Competence"],
    ["documents", "Documents"],
    ["history", "History"],
    ...(hr ? ([["access", "Access log"]] as Array<[Tab, string]>) : []),
  ];

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(r)}>
      {r ? (
        <div className="hr-view">
          <Crumbs items={[["Directory", "/hr/directory"], [r.employee_name]]} />
          <div className="hr-head">
            <div>
              <h2>{r.employee_name}</h2>
              <p>
                {[r.designation, r.department, r.status].filter(Boolean).join(" · ") || r.id}
                {r.viewer === "manager" ? ". You see job details only, as their line manager." : ""}
              </p>
            </div>
            {hr ? (
              <div className="hr-head__r">
                <a className="btn ghost" href={fileUrl(`/hr/employees/${encodeURIComponent(r.id)}/certificate-of-service`)} target="_blank" rel="noreferrer">
                  Certificate of service
                </a>
                <Link className="btn ghost" to={`${base}/promote`}>
                  Promote
                </Link>
                <Link className="btn ghost" to={`${base}/transfer`}>
                  Transfer
                </Link>
                <Link className="btn ghost" to={`${base}/contract`}>
                  Contract
                </Link>
                <Link className="btn ghost" to={`${base}/leave`}>
                  Record a leaver
                </Link>
              </div>
            ) : null}
          </div>
          <Tabs label="Record sections" value={tab} onChange={setTab} tabs={tabs} />

          {tab === "summary" ? (
            <div className="hr-view">
              <OpenItems r={r} />
              <JobSection r={r} />
              {hr ? (
                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>Personal and pay</h3>
                      <p>Hidden until you give a reason. Every look is logged and the person can see it.</p>
                    </div>
                  </div>
                  <div className="hr-box__b">
                    <SensitivePanel employee={r.id} onViewed={() => setLogKey((k) => k + 1)} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "job" ? (
            <div className="hr-view">
              <JobSection r={r} />
              {hr ? <EditJob r={r} onSaved={res.reload} /> : null}
              <p className="hr-note">
                Department, post, grade and line manager change through a <Link to={`${base}/promote`}>promotion</Link> or{" "}
                <Link to={`${base}/transfer`}>transfer</Link>. <Link to={base}>Pending and past changes</Link>.
              </p>
            </div>
          ) : null}
          {tab === "leave" ? <LeaveSection r={r} /> : null}
          {tab === "competence" ? <CompetenceSection r={r} /> : null}
          {tab === "documents" ? <DocumentsPanel base={`/hr/employees/${encodeURIComponent(r.id)}/documents`} canVerify={hr} /> : null}
          {tab === "history" ? <HistorySection r={r} /> : null}
          {tab === "access" && hr ? <AccessLogSection employee={r.id} refreshKey={logKey} /> : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}

const STATUSES = ["Active", "Inactive", "Suspended"];

/** Corrections HR may make directly. The server refuses moves on an active record and "Left" (use separation). */
function EditJob({ r, onSaved }: { r: HrEmployeeRecord; onSaved: () => void }) {
  const [name, setName] = useState(r.employee_name);
  const [email, setEmail] = useState(r.email ?? "");
  const [status, setStatus] = useState(r.status ?? "Active");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function save() {
    setErr(null);
    setOk(null);
    const changes: Record<string, string> = {};
    if (name.trim() && name.trim() !== r.employee_name) changes.employee_name = name.trim();
    if (email.trim() !== (r.email ?? "")) changes.email = email.trim();
    if (status !== (r.status ?? "Active")) changes.status = status;
    if (!Object.keys(changes).length) return setErr("Nothing to change.");
    setBusy(true);
    try {
      await hrSend(`/hr/employees/${encodeURIComponent(r.id)}`, changes, "PATCH");
      setOk("Saved.");
      onSaved();
    } catch (e) {
      setErr(errorText(e, "Not saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Correct the record</h3>
          <p>Name spelling, work email and status. Every change is audited.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 10 }}>
        <label className="hr-f">
          <span>Name</span>
          <input className="hr-in" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <label className="hr-f">
          <span>Work email</span>
          <input className="hr-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        </label>
        <label className="hr-f">
          <span>Status</span>
          <select className="hr-in" value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
            {(STATUSES.includes(status) ? STATUSES : [status, ...STATUSES]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
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
        <div>
          <button type="button" className="btn pri" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
