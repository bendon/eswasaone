import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrRequisition, HrVacancy } from "../../api/types";
import { Banner, Crumbs, NextStep, Track } from "../../me/parts";

/**
 * H6a / T6 Raise a requisition. Only approved posts with a vacancy are offered; eswasa_hr checks again
 * and routes it to each HR Manager in Approvals (never the person who raised it).
 */
export function RaiseRequisition() {
  const { user, sessionKey } = useInstitution();
  const vac = useApiResource<{ items: HrVacancy[] }>("/hr/recruitment/vacancies", { enabled: Boolean(user), refreshKey: sessionKey });
  const posts = vac.data?.items ?? [];

  const [pick, setPick] = useState<string>("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [pay, setPay] = useState("");
  const [expectedBy, setExpectedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<HrRequisition | null>(null);

  const post = posts.find((p) => `${p.department}|${p.designation}` === pick);
  const ready = post && description.trim().length >= 20 && Number(pay) > 0;

  async function send() {
    if (!post) return;
    setBusy(true);
    setErr(null);
    try {
      setSent(
        await apiFetch<HrRequisition>("/hr/recruitment/requisitions", {
          method: "POST",
          body: JSON.stringify({
            designation: post.designation,
            department: post.department,
            description: description.trim(),
            reason: reason.trim() || null,
            expected_compensation: Number(pay),
            expected_by: expectedBy || null,
            confirm: true,
          }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="hr hr-view hr-view--form">
        <Crumbs items={[["Recruitment", "/hr/recruitment"], ["Requisition sent"]]} />
        <div className="hr-head">
          <div>
            <h2>Requisition sent</h2>
            <p>
              {sent.designation}, {sent.department} · <span className="mono">{sent.id}</span>
            </p>
          </div>
        </div>
        <div className="hr-box">
          <div className="hr-box__b">
            <Track
              steps={[
                { title: "Raised", detail: "By you", state: "done" },
                { title: "An HR Manager approves", detail: "In Approvals. Not the person who raised it.", state: "now" },
                { title: "Advertised", detail: "HR publishes it on the careers page" },
              ]}
            />
          </div>
        </div>
        <NextStep title="HR Managers decide" body="You'll see the status change in Recruitment." to="/hr/recruitment" label="Back to Recruitment" />
      </div>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={vac.loading} error={vac.error} onRetry={vac.reload} hasData={Boolean(vac.data)} skeleton="panel">
        <div className="hr hr-view hr-view--form">
          <Crumbs items={[["Recruitment", "/hr/recruitment"], ["Raise a requisition"]]} />
          <div className="hr-head">
            <div>
              <h2>Raise a requisition</h2>
              <p>Ask to fill an approved post. HR Managers approve it in Approvals before it's advertised.</p>
            </div>
          </div>

          {!posts.length ? (
            <>
              <EmptyState title="No approved post has a vacancy" detail="Every approved post is filled or already in recruitment." />
              <NextStep title="Need another post?" body="Ask for an establishment change in Structure. The Executive Director approves it." to="/hr/structure" label="Open Structure" />
            </>
          ) : (
            <>
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Which post</h3>
                    <p>Only approved posts with a vacancy are listed</p>
                  </div>
                </div>
                <div className="hr-box__b">
                  <div className="hr-radios">
                    {posts.map((p) => {
                      const key = `${p.department}|${p.designation}`;
                      return (
                        <label className="hr-radio" key={key}>
                          <input type="radio" name="post" checked={pick === key} onChange={() => setPick(key)} />
                          <span>
                            <b>{p.designation}</b>
                            <small>
                              {p.department}. {p.vacant} vacant of {p.approved}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>About the job</h3>
                    <p>The description becomes the advert on the careers page</p>
                  </div>
                </div>
                <div className="hr-box__b hr-form">
                  <label className="hr-f wide">
                    <span>Job description</span>
                    <textarea className="hr-in" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
                    <small>What the person will do and what they need: qualifications, experience, skills.</small>
                  </label>
                  <label className="hr-f wide">
                    <span>Why now</span>
                    <input className="hr-in" value={reason} onChange={(e) => setReason(e.target.value)} />
                  </label>
                  <label className="hr-f">
                    <span>Budgeted monthly pay</span>
                    <input className="hr-in" type="number" min={0} step={100} value={pay} onChange={(e) => setPay(e.target.value)} />
                    <small>From the post's grade band. Not shown on the advert.</small>
                  </label>
                  <label className="hr-f">
                    <span>Needed by</span>
                    <input className="hr-in" type="date" value={expectedBy} onChange={(e) => setExpectedBy(e.target.value)} />
                  </label>
                </div>
              </div>

              {err ? (
                <Banner kind="bad" title="Not sent">
                  {err}
                </Banner>
              ) : null}
              <div className="hr-actions">
                <Link className="btn ghost" to="/hr/recruitment">
                  Cancel
                </Link>
                <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
                  {busy ? "Sending…" : "Send for approval"}
                </button>
              </div>
            </>
          )}
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
