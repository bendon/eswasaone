import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrAppraisal } from "../api/types";
import { Criteria, Goals } from "../hr/performance/parts";
import { Banner, Crumbs, fmtDay, NextStep, Track } from "./parts";

/** E7 Self-assessment: rate every item 1–5, add reflections, hand it to the line manager. */
export function MyAppraisal() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ appraisal: HrAppraisal | null }>("/hr/me/appraisal", { enabled: Boolean(user), refreshKey: sessionKey });
  const [a, setA] = useState<HrAppraisal | null>(null);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const x = res.data?.appraisal ?? null;
    setA(x);
    if (x) {
      setStars(Object.fromEntries(x.criteria.filter((c) => c.self).map((c) => [c.criteria, c.self as number])));
      setText(x.reflections ?? "");
    }
  }, [res.data]);
  const missing = a ? a.criteria.filter((c) => !stars[c.criteria]).length : 0;

  async function submit() {
    if (!a) return;
    setBusy(true);
    setErr(null);
    try {
      setA(
        await apiFetch<HrAppraisal>("/hr/me/appraisal", {
          method: "POST",
          body: JSON.stringify({ ratings: a.criteria.map((c) => ({ criteria: c.criteria, stars: stars[c.criteria] })), reflections: text.trim() || null, confirm: true }),
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(res.data)} skeleton="panel">
      <div className="hr-view">
        <Crumbs items={[["My HR", "/me"], [a?.cycle_name ?? "Appraisal"]]} />
        {!a ? (
          <EmptyState title="No appraisal open" detail="HR starts appraisal cycles. You'll get a task in Approvals when yours opens." />
        ) : (
          <>
            <div className="hr-head">
              <div>
                <h2>{a.cycle_name}</h2>
                <p>
                  {a.step === "self"
                    ? `Rate yourself on each item. Due by ${fmtDay(a.end_date, true)}.`
                    : a.step === "manager"
                      ? `Submitted. ${a.manager_name ?? "Your line manager"} adds their ratings next.`
                      : "Complete. Your line manager's ratings and comment are below."}
                </p>
              </div>
            </div>
            <Goals a={a} />
            <Criteria a={a} rate={a.can_self ? "self" : undefined} value={stars} onRate={(c, n) => setStars((cur) => ({ ...cur, [c]: n }))} />
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Reflections</h3>
                  <p>What went well, and what you need</p>
                </div>
              </div>
              <div className="hr-box__b">
                {a.can_self ? (
                  <textarea className="hr-in" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Reflections" />
                ) : (
                  <p className="hr-pre">{a.reflections || "None added."}</p>
                )}
              </div>
            </div>
            {a.manager_feedback ? (
              <div className="hr-box">
                <div className="hr-box__h">
                  <div>
                    <h3>{a.manager_name ?? "Line manager"}'s comment</h3>
                  </div>
                </div>
                <div className="hr-box__b">
                  <p className="hr-pre">{a.manager_feedback}</p>
                </div>
              </div>
            ) : null}
            {err ? (
              <Banner kind="bad" title="Not saved">
                {err}
              </Banner>
            ) : null}
            {a.can_self ? (
              <div className="hr-actions">
                <Link className="btn ghost" to="/me">
                  Cancel
                </Link>
                <button type="button" className="btn pri" disabled={Boolean(missing) || busy} onClick={() => void submit()}>
                  {busy ? "Sending…" : missing ? `${missing} item${missing === 1 ? "" : "s"} to rate` : a.self_done ? "Save changes" : "Submit to my manager"}
                </button>
              </div>
            ) : null}
            <div className="hr-box">
              <div className="hr-box__b">
                <Track
                  steps={[
                    { title: "You rate yourself", detail: "Here", state: a.self_done ? "done" : "now" },
                    { title: `${a.manager_name ?? "Your line manager"} reviews`, detail: "In My team", state: a.manager_done ? "done" : a.self_done ? "now" : undefined },
                    { title: "Complete", detail: "You see their ratings and comment here", state: a.manager_done ? "done" : undefined },
                  ]}
                />
              </div>
            </div>
            <NextStep title="Back to My HR" to="/me" label="My HR" />
          </>
        )}
      </div>
    </ResourceGate>
  );
}
