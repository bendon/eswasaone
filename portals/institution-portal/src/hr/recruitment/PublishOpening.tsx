import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrRequisition } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep } from "../../me/parts";

/** Publish an approved requisition to the careers page (journey J2). */
export function PublishOpening() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const reqs = useApiResource<{ items: HrRequisition[] }>("/hr/recruitment", { enabled: Boolean(user), refreshKey: sessionKey });
  const req = reqs.data?.items.find((r) => r.id === id);

  const [title, setTitle] = useState("");
  const [closes, setCloses] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<HrRequisition | null>(null);

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      setDone(
        await apiFetch<HrRequisition>(`/hr/recruitment/requisitions/${encodeURIComponent(id)}/publish`, {
          method: "POST",
          body: JSON.stringify({ closes_on: closes, job_title: title.trim() || null, location: location.trim() || null, confirm: true }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not published. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="hr hr-view hr-view--form">
        <Crumbs items={[["Recruitment", "/hr/recruitment"], ["Published"]]} />
        <div className="hr-head">
          <div>
            <h2>On the careers page</h2>
            <p>
              {done.designation}. Closes {fmtDay(done.opening?.closes_on, true)}.
            </p>
          </div>
        </div>
        <Banner kind="ok" title="People can apply online now">
          Applications land in Recruitment as they arrive. Email applications to hr@eswasa.co.sz still count; add those
          by hand.
        </Banner>
        <NextStep title="Screen applicants as they arrive" body="Shortlist or decline each one. Only shortlisted candidates are contacted." to={done.opening ? `/hr/recruitment/openings/${encodeURIComponent(done.opening.id)}` : "/hr/recruitment"} label="Candidates" />
      </div>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={reqs.loading} error={reqs.error} onRetry={reqs.reload} hasData={Boolean(reqs.data)} skeleton="panel">
        <div className="hr hr-view hr-view--form">
          <Crumbs items={[["Recruitment", "/hr/recruitment"], ["Publish"]]} />
          {!req ? (
            <Banner kind="bad" title="Requisition not found" />
          ) : req.status !== "Open & Approved" || req.opening ? (
            <Banner kind="warn" title={req.opening ? "Already advertised" : "Not approved yet"}>
              {req.opening ? "This requisition already has an advert." : "Only an approved requisition can be advertised."}
            </Banner>
          ) : (
            <>
              <div className="hr-head">
                <div>
                  <h2>Publish {req.designation}</h2>
                  <p>{req.department}. The job description from the requisition becomes the advert.</p>
                </div>
              </div>
              <div className="hr-box">
                <div className="hr-box__b hr-form">
                  <label className="hr-f">
                    <span>Advert title</span>
                    <input className="hr-in" value={title} placeholder={req.designation} onChange={(e) => setTitle(e.target.value)} />
                    <small>Leave empty to use the post name</small>
                  </label>
                  <label className="hr-f">
                    <span>Closing date</span>
                    <input className="hr-in" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
                  </label>
                  <label className="hr-f">
                    <span>Location</span>
                    <input className="hr-in" value={location} placeholder="e.g. Matsapha" onChange={(e) => setLocation(e.target.value)} />
                    <small>A Branch name; leave empty if not set up</small>
                  </label>
                </div>
              </div>
              {err ? (
                <Banner kind="bad" title="Not published">
                  {err}
                </Banner>
              ) : null}
              <div className="hr-actions">
                <Link className="btn ghost" to="/hr/recruitment">
                  Cancel
                </Link>
                <button type="button" className="btn pri" disabled={!closes || busy} onClick={() => void publish()}>
                  {busy ? "Publishing…" : "Publish to careers page"}
                </button>
              </div>
            </>
          )}
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
