import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { components } from "@contracts";
import type { HrCompetenceMatrix, HrEmployeesResponse } from "../../api/types";
import { Banner, Crumbs, fmtDay, Track } from "../../me/parts";
import { errorText, fileUrl, hrSend } from "../api";
import { useHrSettings } from "../useHrSettings";

type Job = components["schemas"]["HrEvidencePackJob"];
type HrExternalPeople = components["schemas"]["HrExternalPeople"];
type Kind = "employee" | "external_person" | "scheme" | "discipline";

/** How each section eswasa_hr builds (GET /hr/settings lists.evidence_sections) reads on screen. */
const SECTION_LABEL: Record<string, string> = {
  authorisations: "Authorisations and their evidence",
  monitoring: "Monitoring (evidence rows, field visits led, audits completed)",
  declarations: "Impartiality declarations",
  training: "Training records",
};

/**
 * H5e Accreditation evidence pack for SADCAS and internal audits (ISO/IEC 17021-1, 17065, 17025). HR Manager or Quality
 * Manager. POST /hr/evidence-pack builds the ZIP in the background; the page polls GET /hr/evidence-pack/{job} and links
 * the download. The sections are the ones eswasa_hr builds. Never includes pay or personal data.
 */
export function EvidencePack() {
  const { user, sessionKey } = useInstitution();
  const [params] = useSearchParams();
  const [jobId, setJobId] = useState<string | null>(() => params.get("job"));
  const [kind, setKind] = useState<Kind>("employee");
  const [value, setValue] = useState("");
  const SECTIONS = useHrSettings()?.lists.evidence_sections ?? [];
  const [picked, setSections] = useState<string[] | null>(null);
  const sections = picked ?? SECTIONS;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  const people = useApiResource<HrEmployeesResponse>("/hr/employees?limit=500", { enabled: Boolean(user) && kind === "employee", refreshKey: sessionKey });
  const ext = useApiResource<HrExternalPeople>("/hr/external-people", { enabled: Boolean(user) && kind === "external_person", refreshKey: sessionKey });
  const mx = useApiResource<HrCompetenceMatrix>("/hr/competence/matrix", { enabled: Boolean(user) && kind === "scheme", refreshKey: sessionKey });
  const schemes = Array.from(new Set((mx.data?.skills ?? []).map((s) => s.scheme).filter(Boolean) as string[])).sort();

  // Poll the job until it's Ready or Failed.
  useEffect(() => {
    if (!jobId) return;
    let live = true;
    let timer: number | undefined;
    const tick = () =>
      apiFetch<Job>(`/hr/evidence-pack/${encodeURIComponent(jobId)}`, { quiet: true })
        .then((j) => {
          if (!live) return;
          setJob(j);
          if (j.status !== "Ready" && j.status !== "Failed") timer = window.setTimeout(tick, 3000);
        })
        .catch((e) => live && setErr(errorText(e, "Couldn't check the pack.")));
    void tick();
    return () => {
      live = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId]);

  async function build() {
    setErr(null);
    if (!value.trim()) return setErr("Choose who or what the pack covers.");
    if (!sections.length) return setErr("Choose at least one section.");
    setBusy(true);
    try {
      const j = await hrSend<Job>("/hr/evidence-pack", { [kind]: value.trim(), sections });
      setJob(j);
      setJobId(j.id);
    } catch (e) {
      setErr(errorText(e, "The pack wasn't started."));
    } finally {
      setBusy(false);
    }
  }

  const picker =
    kind === "employee" ? (
      <select className="hr-in" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
        <option value="">{people.loading ? "Loading…" : "Choose a person…"}</option>
        {(people.data?.items ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.employee_name}
          </option>
        ))}
      </select>
    ) : kind === "external_person" ? (
      <select className="hr-in" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
        <option value="">{ext.data && !ext.data.enabled ? "The external personnel register is off" : "Choose a person…"}</option>
        {(ext.data?.items ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
    ) : kind === "scheme" ? (
      <select className="hr-in" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
        <option value="">{mx.loading ? "Loading…" : schemes.length ? "Choose a scheme…" : "No schemes in the competence catalogue"}</option>
        {schemes.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    ) : (
      <input className="hr-in" value={value} placeholder="Calibration discipline (test method)" onChange={(e) => setValue(e.target.value)} disabled={busy} />
    );

  return (
    <div className="hr-view">
      <Crumbs items={[["Competence", "/hr/competence"], ["Evidence pack"]]} />
      <div className="hr-head">
        <div>
          <h2>Accreditation evidence pack</h2>
          <p>For SADCAS assessments and internal audits under ISO/IEC 17021-1, 17065 and 17025. Each person included is logged.</p>
        </div>
      </div>
      <p className="hr-note">Pay and personal details are never included.</p>

      {job ? (
        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>Pack {job.id}</h3>
              <p>
                {job.scope.kind ? `${job.scope.kind.replace("_", " ")}: ${job.scope.value}` : ""}
                {job.people ? `, ${job.people} ${job.people === 1 ? "person" : "people"}` : ""}
              </p>
            </div>
          </div>
          <div className="hr-box__b hr-view" style={{ gap: 10 }}>
            <Track
              steps={[
                { title: "Requested", state: "done" },
                { title: job.status === "Failed" ? "Failed" : "Building", state: job.ready || job.status === "Failed" ? "done" : "now" },
                { title: "Ready to download", state: job.ready ? "now" : undefined },
              ]}
            />
            {job.status === "Failed" ? (
              <Banner kind="bad" title="The pack couldn't be built">
                {job.error || "Try again. If it keeps failing, tell the system administrator."}
              </Banner>
            ) : null}
            {job.ready ? (
              <div>
                <a className="btn pri" href={fileUrl(`/hr/evidence-pack/${encodeURIComponent(job.id)}/download`)}>
                  Download ZIP
                </a>{" "}
                {job.finished_on ? <span className="hr-note">Built {fmtDay(job.finished_on, true)}</span> : null}
              </div>
            ) : job.status !== "Failed" ? (
              <p className="hr-note" role="status">
                Building in the background. This page checks every few seconds.
              </p>
            ) : null}
            <div>
              <button type="button" className="btn ghost sm" onClick={() => (setJob(null), setJobId(null))}>
                Build another pack
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>What the pack covers</h3>
            </div>
          </div>
          <div className="hr-box__b hr-view" style={{ gap: 10 }}>
            <label className="hr-f">
              <span>By</span>
              <select className="hr-in" value={kind} onChange={(e) => (setKind(e.target.value as Kind), setValue(""))} disabled={busy}>
                <option value="employee">Person</option>
                <option value="external_person">External person</option>
                <option value="scheme">Certification scheme</option>
                <option value="discipline">Calibration discipline</option>
              </select>
            </label>
            <label className="hr-f">
              <span>Which</span>
              <ResourceGate loading={false} error={people.error || ext.error || mx.error} onRetry={() => (people.reload(), ext.reload(), mx.reload())} hasData>
                {picker}
              </ResourceGate>
            </label>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="hr-note">Sections</legend>
              {SECTIONS.map((k) => (
                <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={sections.includes(k)} onChange={(e) => setSections(e.target.checked ? [...sections, k] : sections.filter((x) => x !== k))} disabled={busy} />
                  {SECTION_LABEL[k] ?? k}
                </label>
              ))}
            </fieldset>
            {err ? (
              <Banner kind="bad" title="Not started">
                {err}
              </Banner>
            ) : null}
            <div>
              <button type="button" className="btn pri" disabled={busy} onClick={() => void build()}>
                {busy ? "Starting…" : "Build the pack"}
              </button>
            </div>
          </div>
        </div>
      )}
      {job && err ? (
        <Banner kind="bad" title="Status unknown">
          {err}
        </Banner>
      ) : null}
    </div>
  );
}
