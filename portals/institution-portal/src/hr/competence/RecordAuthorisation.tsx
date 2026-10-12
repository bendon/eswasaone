import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrAuthorisationDetail, HrCompetenceMatrix, HrEmployeesResponse } from "../../api/types";
import { Banner, Crumbs, NextStep, Track } from "../../me/parts";
import { EVIDENCE_TYPES } from "./shared";
import { TrainingEvidence } from "./Training";
import { errorText } from "../api";

type Ev = { evidence_type: string; reference: string; notes: string };
const BLANK: Ev = { evidence_type: "", reference: "", notes: "" };

/**
 * H5a Record an authorisation (journey J4). HR prepares it; eswasa_hr routes it to the head of the
 * person's department in Approvals. Four-eyes and "who decides" are enforced server-side.
 * ?employee=&skill= pre-fill a renewal from the expiring list.
 */
export function RecordAuthorisation() {
  const { user, sessionKey } = useInstitution();
  const [params] = useSearchParams();
  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user), refreshKey: sessionKey });
  const mx = useApiResource<HrCompetenceMatrix>("/hr/competence/matrix", { enabled: Boolean(user), refreshKey: sessionKey });

  const [employee, setEmployee] = useState(params.get("employee") ?? "");
  const [skill, setSkill] = useState(params.get("skill") ?? "");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [evidence, setEvidence] = useState<Ev[]>([{ ...BLANK }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<HrAuthorisationDetail | null>(null);

  const skillMeta = useMemo(() => mx.data?.skills.find((s) => s.name === skill), [mx.data, skill]);
  const renewal = Boolean(params.get("employee") && params.get("skill"));
  const filled = evidence.filter((e) => e.evidence_type || e.reference.trim() || e.notes.trim());
  const evidenceOk = filled.length > 0 && filled.every((e) => e.evidence_type && (e.reference.trim() || e.notes.trim()));
  const ready = employee && skill && validFrom && evidenceOk;

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch<HrAuthorisationDetail>("/hr/competence/authorisations", {
        method: "POST",
        body: JSON.stringify({
          employee,
          skill,
          valid_from: validFrom,
          valid_to: validTo || null,
          evidence: filled.map((e) => ({ evidence_type: e.evidence_type, reference: e.reference.trim() || null, notes: e.notes.trim() || null })),
          confirm: true,
        }),
      });
      setSent(res);
    } catch (e) {
      setErr(errorText(e, "Not sent. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="hr hr-view">
        <Crumbs items={[["Competence", "/hr/competence"], ["Sent for approval"]]} />
        <div className="hr-head">
          <div>
            <h2>Sent for approval</h2>
            <p>
              {sent.employee_name ?? sent.employee}, {sent.skill}
            </p>
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__b">
            <Track
              steps={[
                { title: "Recorded", detail: "By you, with evidence", state: "done" },
                { title: `${sent.decides ?? "Head of department"} approves`, detail: "In Approvals. The approver can't be the person or you.", state: "now" },
                { title: "In the matrix", detail: "Certification and Metrology can assign the person from the start date" },
              ]}
            />
          </div>
        </div>
        <Banner kind="info" title="Until it is approved">
          The matrix shows it as In training. Any current authorisation for the same work stays valid until its end date.
        </Banner>
        <NextStep title={`${sent.decides ?? "The head of department"} decides`} to={`/hr/competence/authorisations/${encodeURIComponent(sent.id)}`} label="Open the authorisation" />
      </div>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={people.loading || mx.loading} error={people.error || mx.error} onRetry={() => { people.reload(); mx.reload(); }} hasData={Boolean(people.data && mx.data)} skeleton="panel">
        <div className="hr hr-view">
          <Crumbs items={[["Competence", "/hr/competence"], [renewal ? "Renew an authorisation" : "Record an authorisation"]]} />
          <div className="hr-head">
            <div>
              <h2>{renewal ? "Renew an authorisation" : "Record an authorisation"}</h2>
              <p>The head of the person's department approves it in Approvals.</p>
            </div>
          </div>

          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>Person and competence</h3>
              </div>
            </div>
            <div className="hr-box__b hr-form">
              <label className="hr-f">
                <span>Person</span>
                <select className="hr-in" value={employee} onChange={(e) => setEmployee(e.target.value)}>
                  <option value="">Choose…</option>
                  {(people.data?.items ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.employee_name}
                      {p.designation ? `, ${p.designation}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="hr-f">
                <span>Competence</span>
                <select className="hr-in" value={skill} onChange={(e) => setSkill(e.target.value)}>
                  <option value="">Choose…</option>
                  {(mx.data?.skills ?? []).map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {skillMeta ? (
                  <small>
                    {skillMeta.kind}
                    {skillMeta.scheme ? `, ${skillMeta.scheme}` : ""}
                    {skillMeta.validity_months ? `. Valid ${skillMeta.validity_months} months` : ""}
                  </small>
                ) : null}
              </label>
              <label className="hr-f">
                <span>Valid from</span>
                <input className="hr-in" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </label>
              <label className="hr-f">
                <span>Valid to</span>
                <input className="hr-in" type="date" value={validTo} min={validFrom || undefined} onChange={(e) => setValidTo(e.target.value)} />
                <small>Leave empty to use the competence's standard validity</small>
              </label>
            </div>
          </div>

          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>Evidence</h3>
                <p>What shows the person is competent: a course, a witnessed audit, a proficiency test</p>
              </div>
            </div>
            <div className="hr-box__b hr-view" style={{ gap: 10 }}>
              {evidence.map((e, i) => (
                <fieldset key={i} className="hr-form" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, margin: 0 }}>
                  <legend className="hr-note" style={{ padding: "0 4px" }}>
                    Evidence {i + 1}
                  </legend>
                  <label className="hr-f">
                    <span>Kind</span>
                    <select className="hr-in" value={e.evidence_type} onChange={(x) => setEvidence((es) => es.map((r, j) => (j === i ? { ...r, evidence_type: x.target.value } : r)))}>
                      <option value="">Choose…</option>
                      {EVIDENCE_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="hr-f">
                    <span>Reference</span>
                    <input className="hr-in" value={e.reference} placeholder="e.g. course name, field visit number" onChange={(x) => setEvidence((es) => es.map((r, j) => (j === i ? { ...r, reference: x.target.value } : r)))} />
                  </label>
                  <label className="hr-f wide">
                    <span>Notes</span>
                    <input className="hr-in" value={e.notes} onChange={(x) => setEvidence((es) => es.map((r, j) => (j === i ? { ...r, notes: x.target.value } : r)))} />
                  </label>
                </fieldset>
              ))}
              <div>
                <button type="button" className="btn ghost sm" onClick={() => setEvidence((es) => [...es, { ...BLANK }])}>
                  Add evidence
                </button>
              </div>
              <p className="hr-note">Files can be attached on the authorisation once it's sent, while it waits for approval.</p>
            </div>
          </div>

          {employee && skill ? (
            <TrainingEvidence
              employee={employee}
              skill={skill}
              onUse={(t) =>
                setEvidence((es) => {
                  const row = { evidence_type: t.evidence_type || "Training Result", reference: t.reference ?? t.title ?? "", notes: [t.title, t.date, t.result].filter(Boolean).join(", ") };
                  const blank = es.findIndex((e) => !e.evidence_type && !e.reference.trim() && !e.notes.trim());
                  return blank >= 0 ? es.map((e, j) => (j === blank ? row : e)) : [...es, row];
                })
              }
            />
          ) : null}

          {err ? (
            <Banner kind="bad" title="Not sent">
              {err}
            </Banner>
          ) : null}
          <div className="hr-actions">
            <Link className="btn ghost" to="/hr/competence">
              Cancel
            </Link>
            <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Send for approval"}
            </button>
          </div>
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
