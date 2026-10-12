import { useApiResource } from "../../hooks/useApiResource";
import { ResourceGate } from "../../components/PageStates";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { components } from "@contracts";
import { fmtDay } from "../../me/parts";

type HrTrainingEvidence = components["schemas"]["HrTrainingEvidence"];
export type HrTrainingItem = components["schemas"]["HrTrainingItem"];

/**
 * Training that can back an authorisation (plan 07 step 6): HRMS Training Results for events tagged to the competence,
 * plus LMS completions (untagged until LMS courses carry a competence, H7). Live GET /hr/competence/training.
 */
export function TrainingEvidence({ employee, skill, onUse }: { employee: string; skill?: string; onUse?: (item: HrTrainingItem) => void }) {
  const { user, sessionKey } = useInstitution();
  const q = new URLSearchParams({ employee, ...(skill ? { skill } : {}) }).toString();
  const res = useApiResource<HrTrainingEvidence>(`/hr/competence/training?${q}`, { enabled: Boolean(user && employee), refreshKey: sessionKey });
  const items = res.data?.items ?? [];
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Training on record</h3>
          <p>{skill ? `Training tagged to ${skill}` : "Training results"}{res.data?.lms_installed ? ", plus LMS completions (not tagged to a competence yet)." : "."}</p>
        </div>
      </div>
      <div className="hr-box__b">
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)} skeleton="panel">
          {items.length ? (
            <div className="hr-out">
              {items.map((t, i) => (
                <div className="hr-out__i" key={`${t.reference ?? t.title}-${i}`}>
                  <div>
                    <b style={{ fontSize: 13 }}>{t.title ?? t.training_event ?? t.reference ?? t.source}</b>
                    <span className="s">
                      {t.source}
                      {t.date ? `, ${fmtDay(t.date, true)}` : ""}
                      {t.result ? `, ${t.result}` : ""}
                      {t.hours ? `, ${t.hours} h` : ""}
                      {t.tagged ? "" : " (not tagged to a competence)"}
                    </span>
                  </div>
                  {onUse ? (
                    <button type="button" className="btn ghost sm r" onClick={() => onUse(t)}>
                      Use as evidence
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="hr-note" style={{ margin: 0 }}>
              No training recorded{skill ? " for this competence" : ""}.
            </p>
          )}
        </ResourceGate>
      </div>
    </div>
  );
}
