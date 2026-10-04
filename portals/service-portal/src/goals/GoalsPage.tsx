import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import {
  GOAL_FILTERS,
  GOALS,
  type GoalCard,
  type GoalCategory,
} from "./catalogue";
import { GoalCardLink } from "./GoalCardLink";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { StaggeredGrid } from "../components/StaggeredGrid";
import type { LayoutOutletContext } from "../layout/ServiceLayout";

function matches(card: GoalCard, cat: "all" | GoalCategory, q: string): boolean {
  const inCat = cat === "all" || card.categories.includes(cat);
  if (!inCat) return false;
  if (!q) return true;
  const hay = `${card.title} ${card.summary} ${card.tags} ${card.goal}`.toLowerCase();
  return hay.includes(q);
}

export function GoalsPage() {
  const { openDock } = useOutletContext<LayoutOutletContext>();
  const [cat, setCat] = useState<"all" | GoalCategory>("all");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return GOALS.filter((g) => matches(g, cat, needle));
  }, [cat, q]);

  return (
    <div className="goals-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Goals" }]} />

      <section className="page-hero page-hero--goals">
        <div className="page-hero__inner">
          <span className="page-hero__label">GOALS</span>
          <h1>What do you want to do?</h1>
          <p>
            Pick a goal and we&rsquo;ll build the exact steps — which standards apply, what to
            prepare, and what it costs. Every guide is free; you only sign in to act.
          </p>
          <div className="goals-search">
            <div className="goals-search__inp">
              <Icon name="i-search" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search goals — e.g. honey, ISO 9001, bottled water…"
                aria-label="Search goals"
              />
            </div>
            <button type="button" className="goals-search__ask" onClick={openDock}>
              <Icon name="i-spark" /> Ask Esi instead
            </button>
          </div>
        </div>
      </section>

      <div className="gpills" role="toolbar" aria-label="Filter by category">
        {GOAL_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`gpill${cat === f.id ? " on" : ""}`}
            onClick={() => setCat(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="gcount">
        <b>{visible.length}</b> goal{visible.length === 1 ? "" : "s"}
        {cat === "all" ? "" : " in this category"}
      </p>

      <StaggeredGrid
        label="Goals"
        items={visible}
        itemKey={(g) => g.slug}
        renderItem={(g) => <GoalCardLink goal={g} />}
        empty={
          <div className="gempty">
            <p>No goals match that. Try a different search, or ask Esi to build a new one.</p>
            <button type="button" className="goals-search__ask" onClick={openDock}>
              <Icon name="i-spark" /> Ask Esi
            </button>
          </div>
        }
      />
    </div>
  );
}
