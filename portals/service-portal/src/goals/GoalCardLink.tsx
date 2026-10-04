import type { OutlineCardMeta } from "../components/OutlineCard";
import { OutlineCard } from "../components/OutlineCard";
import type { GoalCard } from "./catalogue";

export function goalHref(g: GoalCard): string {
  return g.slug === "find-standard" ? "/applicability" : `/goals/${g.slug}`;
}

type Props = {
  goal: GoalCard;
  /** Compact cards drop the steps/timeline/fee row (related strip). */
  compact?: boolean;
};

/** Goal → OutlineCard — shared by the goals library and the related strip. */
export function GoalCardLink({ goal: g, compact = false }: Props) {
  const meta: OutlineCardMeta[] = compact
    ? []
    : [
        ...(g.steps > 1 ? [{ icon: "i-layers" as const, label: `${g.steps} steps` }] : []),
        { icon: "i-clock", label: g.timeline },
        ...(g.fee ? [{ icon: "i-dollar" as const, label: g.fee }] : []),
      ];
  return (
    <OutlineCard
      to={goalHref(g)}
      icon={g.icon}
      title={g.title}
      body={g.summary}
      tint={g.tint}
      tone={g.tone}
      tag={g.typeLabel}
      meta={meta}
      cta={g.cta || "Start guide"}
    />
  );
}
