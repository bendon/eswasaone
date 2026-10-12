import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrAppraisal } from "../api/types";
import { AddGoal, Criteria, Goals, StepPill } from "../hr/performance/parts";
import { Banner, Crumbs, fmtDay, NextStep } from "../me/parts";

/** T5 Manager review: set objectives, then rate each item and comment once the self-assessment is in. */
export function TeamReview() {
  const { employee = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ appraisal: HrAppraisal | null }>(`/hr/team/${encodeURIComponent(employee)}/review`, { enabled: Boolean(user), refreshKey: sessionKey });
  const [a, setA] = useState<HrAppraisal | null>(null);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setA(res.data?.appraisal ?? null), [res.data]);
  const member = `/team/${encodeURIComponent(employee)}`;
  const missing = a ? a.criteria.filter((c) => !stars[c.criteria]).length : 0;

  async function submit() {
    if (!a) return;
    setBusy(true);
    setErr(null);
    try {
      setA(
        await apiFetch<HrAppraisal>(`/hr/team/${encodeURIComponent(employee)}/review`, {
          method: "POST",
          body: JSON.stringify({ ratings: a.criteria.map((c) => ({ criteria: c.criteria, stars: stars[c.criteria] })), feedback: comment.trim(), confirm: true }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(res.data)} skeleton="panel">
      <div className="hr-view">
        <Crumbs items={[["My team", "/team"], [a?.employee_name ?? employee, member], ["Appraisal"]]} />
        {!a ? (
          <EmptyState title="No appraisal open" detail="This person isn't in an appraisal cycle right now." />
        ) : (
          <>
            <div className="hr-head">
              <div>
                <h2>
                  {a.cycle_name}: {a.employee_name}
                </h2>
                <p>Due by {fmtDay(a.end_date, true)}.</p>
              </div>
              <div className="hr-head__r">
                <StepPill step={a.step} />
              </div>
            </div>
            {a.step === "self" ? (
              <Banner kind="info" title={`Waiting for ${a.employee_name}'s self-assessment`}>
                You can set objectives now. You rate after they submit.
              </Banner>
            ) : null}
            {a.step !== "self" && !a.can_review && !a.manager_done ? (
              <Banner kind="lock" title={`${a.manager_name ?? "Their direct line manager"} reviews this`}>
                You can see it because they're in your team.
              </Banner>
            ) : null}
            <Goals a={a} />
            {a.can_add_goals ? <AddGoal a={a} onAdded={setA} /> : null}
            <Criteria a={a} rate={a.can_review ? "manager" : undefined} value={stars} onRate={(c, n) => setStars((cur) => ({ ...cur, [c]: n }))} />
            {a.reflections ? (
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Their reflections</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <p className="hr-pre">{a.reflections}</p>
                </div>
              </div>
            ) : null}
            {a.can_review ? (
              <div className="hr-box">
                <div className="hr-box__b">
                  <label className="hr-f">
                    <span>Your comment to {a.employee_name}</span>
                    <textarea className="hr-in" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
                  </label>
                </div>
              </div>
            ) : a.manager_feedback ? (
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>Comment</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <p className="hr-pre">{a.manager_feedback}</p>
                </div>
              </div>
            ) : null}
            {err ? (
              <Banner kind="bad" title="Not sent">
                {err}
              </Banner>
            ) : null}
            {a.can_review ? (
              <div className="hr-actions">
                <Link className="btn ghost" to={member}>
                  Cancel
                </Link>
                <button type="button" className="btn pri" disabled={Boolean(missing) || !comment.trim() || busy} onClick={() => void submit()}>
                  {busy ? "Sending…" : missing ? `${missing} item${missing === 1 ? "" : "s"} to rate` : "Submit review"}
                </button>
              </div>
            ) : null}
            <NextStep title={a.manager_done ? "Review submitted" : "Back to the team member"} body={a.manager_done ? `${a.employee_name} sees your ratings and comment in My HR.` : undefined} to={member} label="Open their page" />
          </>
        )}
      </div>
    </ResourceGate>
  );
}
