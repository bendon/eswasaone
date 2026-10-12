import { Link, useParams } from "react-router-dom";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrAuthorisationDetail } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, Track } from "../../me/parts";
import { AuthPill } from "./shared";

/** H5b One authorisation: status, validity, evidence, who approved or decides. Live GET only. */
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
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hr-note">No evidence recorded.</p>
                  )}
                </div>
              </div>
            </div>

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
