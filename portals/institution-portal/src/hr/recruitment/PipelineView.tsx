import { Link, useParams } from "react-router-dom";
import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrPipeline, HrStage } from "../../api/types";
import { Crumbs, fmtDay, NextStep } from "../../me/parts";

const COLUMNS: HrStage[] = ["Applied", "Shortlist", "Interview", "Offer", "Hired"];

/**
 * H6b One opening's candidates by stage (journey J2). Live GET /hr/recruitment/openings/{opening}/pipeline.
 * Cards open the applicant; every move happens on the applicant page, where the rules are shown.
 */
export function PipelineView() {
  const { opening = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrPipeline>(`/hr/recruitment/openings/${encodeURIComponent(opening)}/pipeline`, {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const d = res.data;
  const declined = d?.applicants.filter((a) => a.stage === "Not taken forward") ?? [];
  const toScreen = d?.applicants.filter((a) => a.stage === "Applied") ?? [];

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Recruitment", "/hr/recruitment"], [d.opening.job_title ?? opening]]} />
            <div className="hr-head">
              <div>
                <h2>{d.opening.job_title ?? opening}</h2>
                <p>
                  {d.opening.department ?? ""}
                  {d.opening.closes_on ? `. Closes ${fmtDay(d.opening.closes_on, true)}` : ""}. {d.applicants.length} applicant
                  {d.applicants.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            <div className="hr-scroll">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(180px, 1fr))", gap: 12 }}>
                {COLUMNS.map((col) => {
                  const cards = d.applicants.filter((a) => a.stage === col);
                  return (
                    <section key={col} aria-label={col} style={{ background: "var(--line-2, #eff3f8)", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
                      <h3 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: 0, display: "flex", justifyContent: "space-between" }}>
                        {col}
                        <span>{cards.length}</span>
                      </h3>
                      {cards.length ? (
                        cards.map((a) => (
                          <Link
                            key={a.id}
                            to={`/hr/recruitment/applicants/${encodeURIComponent(a.id)}`}
                            className="hr-card"
                            style={{ padding: "10px 12px", gap: 2 }}
                          >
                            <b style={{ fontSize: 13 }}>{a.applicant_name}</b>
                            <span className="d">
                              {a.offer_state ?? a.interview_status ?? (a.applied_on ? `Applied ${fmtDay(a.applied_on)}` : a.status)}
                            </span>
                          </Link>
                        ))
                      ) : (
                        <p className="hr-note" style={{ textAlign: "center", margin: "12px 0" }}>
                          None
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
            {declined.length ? <p className="hr-note">{declined.length} not taken forward.</p> : null}

            {toScreen.length ? (
              <NextStep
                title={`Screen ${toScreen.length} new applicant${toScreen.length === 1 ? "" : "s"}`}
                body="Shortlist or decline each one. Only shortlisted candidates are contacted."
                to={`/hr/recruitment/applicants/${encodeURIComponent(toScreen[0].id)}`}
                label={`Open ${toScreen[0].applicant_name}`}
              />
            ) : null}
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
