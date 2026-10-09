import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmNotConnected,
  Stars,
  lookupCase,
  publicCrmConfig,
  rateCase,
  useCrm,
} from "@eswasaone/shared-ui/crm";
import { Breadcrumbs } from "../../components/Breadcrumbs";

/**
 * Satisfaction survey reached from the closing email/SMS: /feedback/:ref?code=TRK…
 * Question 1 is the star rating stored on the case; the rest are folded into the comment.
 * TODO: wire real — store per-question answers once Core has a survey response DocType.
 */
export function FeedbackPage() {
  const { ref = "" } = useParams();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const cfg = publicCrmConfig();
  const res = useCrm(() => (code ? lookupCase(ref, code) : Promise.resolve(null)), [ref, code]);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const extra = cfg.survey
        .slice(1)
        .map((q, i) => (answers[i] ? `${q} ${answers[i]}/5` : null))
        .filter(Boolean)
        .join(" · ");
      await rateCase(ref, score, [comment.trim(), extra].filter(Boolean).join("\n"));
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page crm-pub" style={{ maxWidth: 640 }}>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Feedback" }]} />
      {res.notConnected ? (
        <CrmNotConnected what="Feedback" audience="public" />
      ) : res.loading && res.data === undefined ? (
        <p className="crm-muted">Loading…</p>
      ) : !res.data ? (
        <CrmBanner>
          This feedback link isn't valid any more. <Link to="/complaints">Go to complaints &amp; enquiries</Link>.
        </CrmBanner>
      ) : done || res.data.csat ? (
        <div className="crm-card crm-done">
          <div className="crm-done__ic">
            <Icon name="i-heart" />
          </div>
          <h2>Thank you</h2>
          <p className="crm-muted">Your feedback goes straight to the team and our Quality Manager.</p>
        </div>
      ) : (
        <div className="crm-card crm-form">
          <div>
            <span className="crm-mono">{res.data.ref}</span>
            <h1 className="page-h" style={{ marginTop: 6 }}>
              How did we do?
            </h1>
            <p className="crm-muted" style={{ margin: 0 }}>
              About “{res.data.subject}”
            </p>
          </div>
          {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
          <div className="crm-field">
            {cfg.survey[0]}
            <Stars value={score} onChange={setScore} />
          </div>
          {cfg.survey.slice(1).map((q, i) => (
            <div key={q} className="crm-field">
              {q}
              <Stars
                value={answers[i] ?? 0}
                size={20}
                onChange={(n) =>
                  setAnswers((a) => {
                    const next = [...a];
                    next[i] = n;
                    return next;
                  })
                }
              />
            </div>
          ))}
          <label className="crm-field">
            Anything else? (optional)
            <textarea className="crm-textarea" value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button type="button" className="crm-btn crm-btn--pri crm-btn--lg" disabled={!score || busy} onClick={() => void submit()}>
            Send feedback
          </button>
        </div>
      )}
    </div>
  );
}
