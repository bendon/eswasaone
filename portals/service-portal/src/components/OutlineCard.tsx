import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";

export type OutlineCardMeta = { icon: IconName; label: string };

type Props = {
  to: string;
  icon: IconName;
  title: string;
  body: ReactNode;
  /** Card accent — drives icon chip, border, CTA and arrow colours. */
  tint: string;
  tone: string;
  tag?: string;
  meta?: OutlineCardMeta[];
  cta?: string;
  /** Label the CTA rolls up to on hover. */
  hint?: string;
  /** Extra content between the body and the meta row (e.g. a course sequence). */
  children?: ReactNode;
};

/**
 * Outlined card with sharp top-right / bottom-left corners (styles in outline-card.css).
 * Hover never refills the card — only the border, icon, CTA label and arrow respond.
 */
export function OutlineCard({
  to,
  icon,
  title,
  body,
  tint,
  tone,
  tag,
  meta = [],
  cta = "Open",
  hint = "Let’s go",
  children,
}: Props) {
  return (
    <Link
      className="gcard"
      to={to}
      style={{ ["--tint" as string]: tint, ["--tone" as string]: tone }}
    >
      <div className="gcard__top">
        <span className="gcard__ic">
          <Icon name={icon} />
        </span>
        {tag ? <span className="gcard__tag">{tag}</span> : null}
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
      {meta.length > 0 ? (
        <div className="gcard__meta">
          {meta.map((m) => (
            <span key={m.label}>
              <Icon name={m.icon} /> {m.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="gcard__foot">
        <span className="gcard__start">
          <span className="gcard__start-txt">{cta}</span>
          <span className="gcard__start-hint" aria-hidden="true">
            {hint}
          </span>
        </span>
        <span className="gcard__go">
          <Icon name="i-cright" />
        </span>
      </div>
    </Link>
  );
}
