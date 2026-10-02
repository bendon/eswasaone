import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { Icon } from "../icons/Icon";

export type SiteFooterHealth = {
  tone: "up" | "warn" | "down";
  text: string;
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
};

/** Trust footer with official ESWASA lockup — product remains EswasaOne above. */
export function SiteFooter({
  className,
  compact = false,
  health = null,
  children,
}: SiteFooterProps) {
  const year = new Date().getFullYear();
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
