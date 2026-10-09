import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import type { GuideAction, GuideResponse } from "../guide/types";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";
import type { GoalCard } from "../goals/catalogue";
import { GoalCardLink } from "../goals/GoalCardLink";

const ACTION_ICON: Record<GuideAction["type"], IconName> = {
  buy: "i-cart",
  apply: "i-clipboard",
  book: "i-clipboard",
  open: "i-eye",
};

type PendingAction = {
  type: GuideAction["type"];
  label: string;
  target: string;
  reason?: string;
};

function resumeAction(action: PendingAction) {
  if (action.type === "buy") {
    if (action.target === "catalogue" || action.target.startsWith("/")) {
      window.location.assign(action.target.startsWith("/") ? action.target : "/standards");
      return;
    }
    window.location.assign(`/estore/checkout?item=${encodeURIComponent(action.target)}`);
    return;
  }
  if (action.type === "apply" || action.type === "book") {
    if (action.target.startsWith("/")) {
      window.location.assign(action.target);
      return;
    }
    window.location.assign(`/certification/apply?scheme=${encodeURIComponent(action.target)}`);
    return;
  }
  if (action.target.startsWith("http") || action.target.startsWith("/")) {
    if (action.target.startsWith("http")) {
      window.open(action.target, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(action.target);
    }
  }
}

type Props = {
  guide: GuideResponse;
  backTo?: string;
  backLabel?: string;
  related?: GoalCard[];
  note?: string | null;
};

export function GuidePanel({
  guide,
  backTo = "/goals",
  backLabel = "All goals",
  related = [],
  note,
}: Props) {
  const { user, openAuth } = useAuth();
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    setDone({});
  }, [guide.title]);

  useEffect(() => {
    if (user && pending) {
      const action = pending;
      setPending(null);
      resumeAction(action);
    }
  }, [user, pending]);

  function handleAction(action: GuideAction) {
    if (action.type === "open" || user) {
      resumeAction({
        type: action.type,
        label: action.label,
        target: action.target,
        reason: action.reason,
      });
      return;
    }
    setPending({
      type: action.type,
      label: action.label,
      target: action.target,
      reason: action.reason,
    });
    openAuth({ title: "Sign in to continue", reason: action.reason });
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Goals", to: backTo },
          { label: guide.title },
        ]}
      />

      <section className="guide" aria-live="polite">
        <div className="guide__main">
          <Link className="back" to={backTo}>
            <Icon name="i-cleft" /> {backLabel}
          </Link>

          <div className="guide__head">
            <span className="g">
              <Icon name="i-spark" />
            </span>
            <div>
              <h2>{safeText(guide.title)}</h2>
              <p>{safeText(guide.summary)}</p>
            </div>
          </div>
          <p className="guide__trust">
            Generated from official ESWASA, Codex &amp; market sources
          </p>

          <ol className="steps">
            {guide.steps.map((step, i) => (
              <li key={`${step.title}-${i}`} className={`step${done[i] ? " done" : ""}`}>
                <button
                  type="button"
                  className="step__n"
                  title="Mark as done"
                  onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                >
                  {done[i] ? "✓" : i + 1}
                </button>
                <div className="step__card">
                  <b>{safeText(step.title)}</b>
                  <p>{safeText(step.detail)}</p>
                  <div className="src">
                    {step.citations.map((c) => (
                      <a
                        key={`${c.label}-${c.url}`}
                        href={c.url || "#"}
                        target={c.url?.startsWith("http") ? "_blank" : undefined}
                        rel="noopener noreferrer"
                      >
                        <Icon name="i-link" />
                        {safeText(c.label)}
                        <span className={`rgt ${c.rights}`}>{c.rights}</span>
                      </a>
                    ))}
                  </div>
                  {step.action ? (
                    <div className="step__act">
                      <button
                        type="button"
                        className={`btn ${step.action.type}`}
                        onClick={() => handleAction(step.action!)}
                      >
                        <Icon name={ACTION_ICON[step.action.type]} />
                        {safeText(step.action.label)}
                        {step.action.auth_required && !user ? (
                          <Icon name="i-lock" className="lock" />
                        ) : null}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="guide__rail">
          <div className="summary">
            <h4>At a glance</h4>
            <div className="row">
              <span>Standards that apply</span>
              <b>{guide.meta.standards}</b>
            </div>
            <div className="row">
              <span>Estimated fees</span>
              <b>{safeText(guide.meta.est_fee)}</b>
            </div>
            <div className="row">
              <span>Typical timeline</span>
              <b>{safeText(guide.meta.est_timeline)}</b>
            </div>
            <div className="row">
              <span>Steps</span>
              <b>{guide.meta.steps}</b>
            </div>
          </div>
          <div className="authbox">
            <b>Save this guide</b>
            <p>
              Sign in to keep your progress, upload documents and get notified when a step is due.
            </p>
            {!user ? (
              <button type="button" onClick={() => openAuth({ title: "Sign in to save" })}>
                Sign in to save
              </button>
            ) : null}
            <div className="fn">Takes about 30 seconds</div>
          </div>
        </aside>
      </section>

      {note ? <p className="home-note">{note}</p> : null}

      {related.length > 0 ? (
        <section className="related" aria-labelledby="relatedTitle">
          <div className="sec-head">
            <div>
              <h2 id="relatedTitle">Related goals</h2>
              <p>Continue exploring, or browse the full library</p>
            </div>
            <Link to="/goals" className="linkish">
              All goals
            </Link>
          </div>
          <div className="related__grid">
            {related.map((g) => (
              <GoalCardLink key={g.slug} goal={g} compact />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
