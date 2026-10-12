import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrAuthorisationDetail } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, Track } from "../../me/parts";
import { AuthPill, EVIDENCE_TYPES } from "./shared";
import { TrainingEvidence } from "./Training";
import { errorText, fileUrl, hrUpload } from "../api";

/**
 * H5b One authorisation: status, validity, evidence, who approved or decides. Live GET; while it waits for the head's
 * approval HR can attach evidence files (POST …/evidence, private store). Files open through Core after eswasa_hr allows.
 */
export function AuthorisationDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrAuthorisationDetail>(`/hr/competence/authorisations/${encodeURIComponent(id)}`, {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const d = res.data;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Competence", "/hr/competence"], [`${d.employee_name ?? d.employee}, ${d.skill}`]]} />
            <div className="hr-head">
              <div>
                <h2>
                  {d.employee_name ?? d.employee}: {d.skill}
                </h2>
                <p>
                  {d.kind ?? "Competence"}
                  {d.scheme ? `, ${d.scheme}` : ""}
                </p>
              </div>
              {d.status === "Expiring" || d.status === "Expired" ? (
                <div className="hr-head__r">
                  <Link className="btn pri" to={`/hr/competence/new?employee=${encodeURIComponent(d.employee)}&skill=${encodeURIComponent(d.skill)}`}>
                    Renew
                  </Link>
                </div>
              ) : null}
            </div>

            {d.status === "Expired" ? (
              <Banner kind="bad" title="Expired">
                Certification and Metrology refuse to assign {d.employee_name ?? "this person"} to this work, with the reason
                shown, until it is renewed.
              </Banner>
            ) : null}
            {d.status === "Expiring" ? (
              <Banner kind="warn" title={`Ends ${fmtDay(d.valid_to, true)}`}>
                After that date the audit planner won't offer {d.employee_name ?? "this person"} for this work. Alerts went
                out at 60 days and go again at 30 and 7.
              </Banner>
            ) : null}

            <div className="hr-grid c2">
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Authorisation</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <dl className="hr-kv">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <AuthPill status={d.status} validTo={d.valid_to} />
                      </dd>
                    </div>
                    <div>
                      <dt>Valid</dt>
                      <dd>
                        {fmtDay(d.valid_from, true)} to {d.valid_to ? fmtDay(d.valid_to, true) : "no end date"}
                      </dd>
                    </div>
                    <div>
                      <dt>{d.status === "In training" ? "Decides" : "Approved by"}</dt>
                      <dd>{(d.status === "In training" ? d.decides : d.approver) ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Evidence</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  {d.evidence.length ? (
                    <div className="hr-out">
                      {d.evidence.map((e, i) => (
                        <div className="hr-out__i" key={i}>
                          <div>
                            <b>{e.reference ?? e.evidence_type}</b>
                            <span className="s">
                              {e.evidence_type}
                              {e.notes ? `. ${e.notes}` : ""}
                              {e.link ? `. Linked ${e.link.doctype} ${e.link.name}` : ""}
                            </span>
                          </div>
                          {e.file && e.id ? (
                            <a className="hr-lnk r" href={fileUrl(`/hr/competence/evidence/${encodeURIComponent(e.id)}/file`)} target="_blank" rel="noreferrer">
                              Open file
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hr-note">No evidence recorded.</p>
                  )}
                </div>
              </div>
            </div>

            {d.status === "In training" ? <AddEvidence id={d.id} onAdded={res.reload} /> : null}
            {d.person_type !== "External" ? <TrainingEvidence employee={d.employee} skill={d.skill} /> : null}

            {d.status === "In training" ? (
              <div className="hr-box">
                <div className="hr-box__b">
                  <Track
                    steps={[
                      { title: "Recorded by HR", state: "done" },
                      { title: `${d.decides ?? "Head of department"} approves`, detail: "In Approvals", state: "now" },
                      { title: "In the matrix" },
                    ]}
                  />
                </div>
              </div>
            ) : null}
            <NextStep title="Back to the matrix" to="/hr/competence" label="Competence" />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

const ACCEPT = "application/pdf,image/jpeg,image/png";

/** Attach a file while the authorisation waits for approval; a decided one keeps the evidence its head saw. */
function AddEvidence({ id, onAdded }: { id: string; onAdded: () => void }) {
  const [type, setType] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [k, setK] = useState(0);

  async function add() {
    setErr(null);
    setOk(null);
    if (!type) return setErr("Choose the kind of evidence.");
    if (!file) return setErr("Choose the file.");
    if (file.size > 5 * 1024 * 1024) return setErr(`${file.name} is larger than 5 MB.`);
    setBusy(true);
    try {
      await hrUpload(`/hr/competence/authorisations/${encodeURIComponent(id)}/evidence`, { evidence_type: type, file, reference: reference.trim() || null, notes: notes.trim() || null });
      setOk("Evidence added. The head of department sees it when deciding.");
      setType("");
      setReference("");
      setNotes("");
      setFile(null);
      setK((x) => x + 1);
      onAdded();
    } catch (e) {
      setErr(errorText(e, "Not added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr-box" key={k}>
      <div className="hr-box__h">
        <div>
          <h3>Add evidence</h3>
          <p>Only while it waits for approval. PDF, JPEG or PNG, up to 5 MB, kept private.</p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 10 }}>
        <label className="hr-f">
          <span>Kind</span>
          <select className="hr-in" value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
            <option value="">Choose…</option>
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-f">
          <span>Reference (optional)</span>
          <input className="hr-in" value={reference} onChange={(e) => setReference(e.target.value)} disabled={busy} />
        </label>
        <label className="hr-f">
          <span>Notes (optional)</span>
          <input className="hr-in" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </label>
        <label className="hr-f">
          <span>File</span>
          <input className="hr-in" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
        </label>
        {err ? (
          <Banner kind="bad" title="Not added">
            {err}
          </Banner>
        ) : null}
        {ok ? (
          <p className="page-note" role="status">
            {ok}
          </p>
        ) : null}
        <div>
          <button type="button" className="btn pri" disabled={busy} onClick={() => void add()}>
            {busy ? "Adding…" : "Add evidence"}
          </button>
        </div>
      </div>
    </div>
  );
}
