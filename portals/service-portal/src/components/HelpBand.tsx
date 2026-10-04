import type { ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import type { LayoutOutletContext } from "../layout/ServiceLayout";

type Props = {
  kicker: string;
  title: ReactNode;
  body: ReactNode;
  /** The desk that handles this page's enquiries, e.g. "the standards desk". */
  desk: { label: string; email: string; subject?: string };
  /** A page-specific self-serve route shown as the last option. */
  shortcut: { icon: IconName; label: string; hint: string; to: string };
};

type Row = {
  icon: IconName;
  label: string;
  hint: string;
  tint: string;
  tone: string;
} & ({ href: string } | { to: string } | { onClick: () => void });

/** End-of-page help band: copy on the left, ways to get help on the right (Esi first). */
export function HelpBand({ kicker, title, body, desk, shortcut }: Props) {
  const { openDock } = useOutletContext<LayoutOutletContext>();
  const rows: Row[] = [
    {
      icon: "i-spark",
      label: "Ask Esi",
      hint: "Instant answers from the ESWASA assistant",
      onClick: openDock,
      tint: "#FEF6DC",
      tone: "#B8860B",
    },
    {
      icon: "i-mail",
      label: `Email ${desk.label}`,
      hint: desk.email,
      href: `mailto:${desk.email}${desk.subject ? `?subject=${encodeURIComponent(desk.subject)}` : ""}`,
      tint: "#ECEEFC",
      tone: "#313391",
    },
    { ...shortcut, tint: "#E4F4F1", tone: "#0E7C7B" },
  ];

  return (
    <section className="helpband" aria-label={kicker}>
      <div className="helpband__copy">
        <span className="helpband__kicker">{kicker}</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>

      <ul className="helpband__rows">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="helpband__ic">
                <Icon name={r.icon} />
              </span>
              <span className="helpband__txt">
                <b>{r.label}</b>
                <span>{r.hint}</span>
              </span>
              <span className="helpband__go">
                <Icon name="i-cright" />
              </span>
            </>
          );
          const style = { ["--tint" as string]: r.tint, ["--tone" as string]: r.tone };
          return (
            <li key={r.label}>
              {"onClick" in r ? (
                <button type="button" className="helpband__row" onClick={r.onClick} style={style}>
                  {inner}
                </button>
              ) : "to" in r ? (
                <Link className="helpband__row" to={r.to} style={style}>
                  {inner}
                </Link>
              ) : (
                <a className="helpband__row" href={r.href} style={style}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
