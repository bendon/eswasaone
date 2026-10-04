import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { Icon } from "../icons/Icon";

export type SiteFooterHealth = {
  tone: "up" | "warn" | "down";
  text: string;
};

export type SiteFooterColumn = {
  title: string;
  links: { label: string; to: string }[];
};

export type SiteFooterContact = {
  phone?: string;
  /** tel: target when `phone` is a display string, e.g. "+26825184633". */
  phoneHref?: string;
  email?: string;
  address?: string;
};

export type SiteFooterProps = {
  /** Extra class on the footer element. */
  className?: string;
  /** Compact (auth / sheet) vs full page foot. */
  compact?: boolean;
  /** Optional system-health chip (institution portal). */
  health?: SiteFooterHealth | null;
  /** Optional slot after the brand lockup (rarely needed). */
  children?: ReactNode;
  /** "full" renders the multi-column navy footer (service portal). */
  variant?: "default" | "full";
  /** Link columns for the full variant. */
  columns?: SiteFooterColumn[];
  /** Contact column for the full variant. */
  contact?: SiteFooterContact;
};

/** Trust footer with official ESWASA lockup — product remains EswasaOne above. */
export function SiteFooter({
  className,
  compact = false,
  health = null,
  children,
  variant = "default",
  columns = [],
  contact,
}: SiteFooterProps) {
  const year = new Date().getFullYear();
  if (variant === "full") {
    return (
      <footer className={["site-footer-full", className].filter(Boolean).join(" ")}>
        <div className="site-footer-full__in">
          <div className="site-footer-full__about">
            <span className="site-footer-full__logo">
              <BrandLogo variant="lockup" />
            </span>
            <p>EswasaOne is operated by the Eswatini Standards Authority (ESWASA).</p>
            {children}
          </div>
          {columns.map((col) => (
            <nav key={col.title} className="site-footer-full__col" aria-label={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          {contact ? (
            <div className="site-footer-full__col">
              <h4>Contact</h4>
              <ul className="site-footer-full__contact">
                {contact.phone ? (
                  <li>
                    <Icon name="i-phone" width={15} height={15} />
                    <a href={`tel:${contact.phoneHref ?? contact.phone}`}>{contact.phone}</a>
                  </li>
                ) : null}
                {contact.email ? (
                  <li>
                    <Icon name="i-mail" width={15} height={15} />
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  </li>
                ) : null}
                {contact.address ? (
                  <li>
                    <Icon name="i-pin" width={15} height={15} />
                    <span>{contact.address}</span>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="site-footer-full__bar">
          <div className="site-footer-full__bar-in">
            <span>© {year} ESWASA · All rights reserved</span>
            <span>Eswatini Standards Authority</span>
          </div>
        </div>
      </footer>
    );
  }
  return (
    <footer
      className={["site-footer", compact ? "site-footer--compact" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <BrandLogo variant="lockup" className="site-footer__lockup" />
      {children}
      <div className="site-footer__row">
        <p className="site-footer__copy">
          <span>EswasaOne is operated by the Eswatini Standards Authority (ESWASA).</span>
          <span className="site-footer__meta">© {year} ESWASA · All rights reserved</span>
        </p>
        {health ? (
          <div
            className={`site-footer__health site-footer__health--${health.tone}`}
            role="status"
            aria-label="System health"
          >
            <span className={`site-footer__health-dot ${health.tone}`} aria-hidden />
            <Icon name="i-clock" width={13} height={13} />
            <span>{health.text}</span>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
