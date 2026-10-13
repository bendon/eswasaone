import { useState } from "react";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrMyInterview } from "../api/types";
import { Banner, Crumbs, fmtDay, NextStep } from "./parts";
import { useHrSettings } from "../hr/useHrSettings";

/**
 * Interviews to score (journey J2, panel side). Any staff member on an interview panel records their
 * feedback here; HR sees it on the applicant. Live GET /hr/me/interviews.
 */
export function MyInterviews() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ items: HrMyInterview[] }>("/hr/me/interviews", { enabled: Boolean(user), refreshKey: sessionKey });
  const [done, setDone] = useState<string[]>([]);
  const items = (res.data?.items ?? []).filter((i) => !done.includes(i.id));

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(res.data)}>
      <div className="hr-view">
        <Crumbs items={[["My HR", ".."], ["Interviews to score"]]} />
        <div className="hr-head">
          <div>
            <h2>Interviews to score</h2>
            <p>Interviews where you're on the panel. HR can't decide until every panel member has scored.</p>
          </div>
        </div>
        {done.length ? <Banner kind="ok" title={`Feedback recorded for ${done.length} interview${done.length === 1 ? "" : "s"}`} /> : null}
        {items.length ? (
          items.map((i) => <FeedbackForm key={i.id} interview={i} onDone={() => setDone((d) => [...d, i.id])} />)
        ) : (
          <>
            <EmptyState title="Nothing to score" detail="Interviews you're asked to sit on appear here." />
            <NextStep title="All caught up" to=".." label="Back to My HR" />
          </>
        )}
      </div>
    </ResourceGate>
  );
}

function FeedbackForm({ interview, onDone }: { interview: HrMyInterview; onDone: () => void }) {
  const scale = Array.from({ length: useHrSettings()?.rating_max ?? 0 }, (_, i) => i + 1);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const skills = interview.skills;
  const ready = result && skills.length > 0 && skills.every((s) => stars[s]);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/hr/me/interviews/${encodeURIComponent(interview.id)}/feedback`, {
        method: "POST",
        body: JSON.stringify({ result, ratings: skills.map((s) => ({ skill: s, stars: stars[s] })), feedback: notes.trim() || null, confirm: true }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>{interview.applicant_name}</h3>
          <p>
            {interview.designation ? `${interview.designation}. ` : ""}
            {fmtDay(interview.scheduled_on, true)}
            {interview.from_time ? ` at ${interview.from_time}` : ""}. {interview.interview_type ?? ""}
          </p>
        </div>
      </div>
      <div className="hr-box__b hr-view" style={{ gap: 12 }}>
        {!skills.length ? (
          <Banner kind="warn" title="This interview type has no skills to rate">Ask HR to add the expected skills to the interview type.</Banner>
        ) : (
          skills.map((s) => (
            <fieldset key={s} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="hr-f">{s}</legend>
              <div className="hr-actions" role="radiogroup" aria-label={s} style={{ justifyContent: "flex-start" }}>
                {scale.map((n) => (
                  <label key={n} className="hr-radio" style={{ padding: "6px 12px" }}>
                    <input type="radio" name={`${interview.id}-${s}`} checked={stars[s] === n} onChange={() => setStars((cur) => ({ ...cur, [s]: n }))} />
                    <span>
                      <b>{n}</b>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))
        )}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="hr-f">Your recommendation</legend>
          <div className="hr-radios">
            {[
              ["Cleared", "Take them forward"],
              ["Rejected", "Don't take them forward"],
            ].map(([v, label]) => (
              <label key={v} className="hr-radio">
                <input type="radio" name={`${interview.id}-result`} checked={result === v} onChange={() => setResult(v)} />
                <span>
                  <b>{label}</b>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="hr-f">
          <span>Comments for HR</span>
          <textarea className="hr-in" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {err ? (
          <Banner kind="bad" title="Not saved">
            {err}
          </Banner>
        ) : null}
        <div className="hr-actions">
          <span />
          <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
            {busy ? "Saving…" : "Record feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
