import { useState } from "react";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrEmployeeDocument, HrEmployeeDocuments } from "../../api/types";
import { Banner, fmtDay, StatusPill } from "../../me/parts";
import { errorText, fileUrl, hrSend, hrUpload } from "../api";

/**
 * Documents on a person's record (E5 for yourself, H1b for HR). Live:
 *   GET/POST {base}  (/hr/me/documents or /hr/employees/{id}/documents; multipart upload, private store)
 *   POST /hr/documents/{name}/verify  (HR, never your own upload; four-eyes in eswasa_hr.documents)
 *   GET  /hr/documents/{name}/file    (HR and the person only; audited)
 */

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX = 5 * 1024 * 1024;

function pill(d: HrEmployeeDocument) {
  if (d.status === "Verified") return <StatusPill cls="ok" label="Verified" />;
  if (d.status === "Expired") return <StatusPill cls="bad" label="Expired" />;
  return <StatusPill cls="leave" label="To check" />;
}

export function DocumentsPanel({ base, canVerify = false, self = false }: { base: string; canVerify?: boolean; self?: boolean }) {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrEmployeeDocuments>(base, { enabled: Boolean(user), refreshKey: sessionKey });
  const [type, setType] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const d = res.data;
  const types = d?.types ?? [];

  async function upload() {
    setErr(null);
    setOk(null);
    if (!type) return setErr("Choose what kind of document this is.");
    if (!file) return setErr("Choose the file.");
    if (file.size > MAX) return setErr(`${file.name} is larger than 5 MB.`);
    if (!ACCEPT.split(",").includes(file.type)) return setErr(`${file.name} isn't a PDF, JPEG or PNG.`);
    setBusy("upload");
    try {
      await hrUpload(base, { document_type: type, file, expires_on: expires || null });
      setOk(self ? `${type} uploaded. HR checks it before it counts.` : `${type} uploaded.`);
      setType("");
      setExpires("");
      setFile(null);
      setFormKey((k) => k + 1);
      res.reload();
    } catch (e) {
      setErr(errorText(e, "Not uploaded."));
    } finally {
      setBusy(null);
    }
  }

  async function verify(doc: HrEmployeeDocument) {
    setErr(null);
    setOk(null);
    setBusy(doc.id);
    try {
      await hrSend(`/hr/documents/${encodeURIComponent(doc.id)}/verify`);
      setOk(`${doc.document_type} verified.`);
      res.reload();
    } catch (e) {
      setErr(errorText(e, "Not verified."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)}>
      <div className="hr-view">
        {d && !d.required_set ? (
          <Banner kind="info" title="Required documents: awaiting ESWASA (H14)">
            ESWASA HR hasn't listed which documents each kind of employment needs, so nothing shows as missing yet.
          </Banner>
        ) : d?.missing.length ? (
          <Banner kind="warn" title={`${d.missing.length} required ${d.missing.length === 1 ? "document is" : "documents are"} missing`}>
            {d.missing.join(", ")}
          </Banner>
        ) : null}

        {d?.items.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table" aria-label="Documents">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Expires</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.items.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <b>{doc.document_type}</b>
                      {doc.required ? <small style={{ display: "block", color: "var(--muted)" }}>Required</small> : null}
                    </td>
                    <td>{doc.expires_on ? fmtDay(doc.expires_on, true) : "—"}</td>
                    <td>
                      {doc.uploaded_on ? fmtDay(doc.uploaded_on, true) : "—"}
                      {doc.uploaded_by ? <small style={{ display: "block", color: "var(--muted)" }}>{doc.uploaded_by}</small> : null}
                    </td>
                    <td>
                      {pill(doc)}
                      {doc.verified_by ? <small style={{ display: "block", color: "var(--muted)" }}>by {doc.verified_by}</small> : null}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {doc.file ? (
                        <a className="hr-lnk" href={fileUrl(`/hr/documents/${encodeURIComponent(doc.id)}/file`)} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : null}
                      {canVerify && doc.status === "To check" ? (
                        <>
                          {" "}
                          <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => void verify(doc)}>
                            {busy === doc.id ? "Verifying…" : "Verify"}
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No documents yet" detail={self ? "Upload your ID, contract or qualifications here. HR checks each one." : "Nothing has been uploaded to this record."} />
        )}

        <div className="hr-box" key={formKey}>
          <div className="hr-box__h">
            <div>
              <h3>Upload a document</h3>
              <p>PDF, JPEG or PNG, up to 5 MB. Kept private: only HR and {self ? "you" : "the person"} can open it.</p>
            </div>
          </div>
          <div className="hr-box__b hr-view" style={{ gap: 10 }}>
            <label className="hr-f">
              <span>Kind of document</span>
              <select className="hr-in" value={type} onChange={(e) => setType(e.target.value)} disabled={busy !== null}>
                <option value="">Choose…</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="hr-f">
              <span>Expires on (if it does)</span>
              <input className="hr-in" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} disabled={busy !== null} />
            </label>
            <label className="hr-f">
              <span>File</span>
              <input className="hr-in" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy !== null} />
            </label>
            {err ? (
              <Banner kind="bad" title="Not done">
                {err}
              </Banner>
            ) : null}
            {ok ? (
              <p className="page-note" role="status">
                {ok}
              </p>
            ) : null}
            <div>
              <button type="button" className="btn pri" disabled={busy !== null} onClick={() => void upload()}>
                {busy === "upload" ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ResourceGate>
  );
}
