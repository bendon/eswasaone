import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { buildGuide } from "../guide/api";
import type { GuideResponse } from "../guide/types";
import { Breadcrumbs } from "../components/Breadcrumbs";
import {
  cachedGuideForCard,
  getGoalBySlug,
  relatedGoals,
} from "./catalogue";
import { GuidePanel } from "./GuidePanel";

export function GoalGuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const card = slug ? getGoalBySlug(slug) : undefined;
  const related = slug ? relatedGoals(slug) : [];

  if (!card) {
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Goals", to: "/goals" },
            { label: "Not found" },
          ]}
        />
        <h1 className="page-h">Goal not found</h1>
        <p className="page-lead">That guide isn&rsquo;t in the library yet.</p>
        <Link className="btn-primary" to="/goals">
          Browse all goals
        </Link>
      </div>
    );
  }

  const guide = cachedGuideForCard(card);

  return (
    <GuidePanel
      guide={guide}
      backTo="/goals"
      backLabel="All goals"
      related={related}
    />
  );
}

/** Free-text Ask path — same layout; may use live POST /api/guide. */
export function AdHocGuidePage() {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const [guide, setGuide] = useState<GuideResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    setBusy(true);
    setGuide(null);
    setNote(null);
    void (async () => {
      try {
        const { guide: res, fromFallback } = await buildGuide({ goal: q });
        if (cancelled) return;
        setGuide(res);
        if (fromFallback) {
          setNote("Preview path. Live guide reconnecting. Popular goals always work.");
        }
      } catch {
        if (!cancelled) setNote("Could not build a guide. Try a Popular goal from the library.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  if (!q) {
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Goals", to: "/goals" },
            { label: "Ask for a guide" },
          ]}
        />
        <h1 className="page-h">Ask for a guide</h1>
        <p className="page-lead">Tell Esi what you want to do, or browse the Goals library.</p>
        <Link className="btn-primary" to="/goals">
          Browse goals
        </Link>
      </div>
    );
  }

  if (busy || !guide) {
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Goals", to: "/goals" },
            { label: q },
          ]}
        />
        <div className="skel" aria-busy="true">
          <div className="skel-card">
            <div className="skel-line w40" />
            <div className="skel-line w80" />
            <div className="skel-line w60" />
          </div>
          <div className="skel-card">
            <div className="skel-line w60" />
            <div className="skel-line w80" />
          </div>
          <div className="skel-card">
            <div className="skel-line w40" />
            <div className="skel-line w60" />
          </div>
          {note ? <p className="home-note">{note}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <GuidePanel
      guide={guide}
      backTo="/goals"
      backLabel="All goals"
      related={relatedGoals("", 4)}
      note={note}
    />
  );
}
