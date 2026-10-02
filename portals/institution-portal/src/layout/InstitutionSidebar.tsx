import { NavLink } from "react-router-dom";
import { BrandLogo, Icon } from "@eswasaone/shared-ui";
import { type InstitutionNavDef, type InstitutionRouteId } from "../nav";

type Props = {
  items: InstitutionNavDef[];
  lockedIds?: Set<InstitutionRouteId>;
  badges?: Partial<Record<InstitutionRouteId, number | string>>;
  roleBanner?: { title: string; subtitle: string };
  onCollapse?: () => void;
  onSignOut?: () => void;
  signedIn?: boolean;
  /** Mobile drawer open state — desktop ignores. */
  open?: boolean;
  onClose?: () => void;
};

export function InstitutionSidebar({
  items,
  lockedIds,
  badges,
  roleBanner,
  onCollapse,
  onSignOut,
  open = false,
  onClose,
}: Props) {
  return (
    <aside
      id="institution-side-nav"
      className={`side${open ? " is-open" : ""}`}
      aria-hidden={open ? undefined : undefined}
    >
      <div className="side__brand">
        <span className="side__logo">
          <BrandLogo variant="mark" />
        </span>
        <div>
          <b>EswasaOne</b>
          <span>INSTITUTION PORTAL</span>
        </div>
        {onClose ? (
          <button
            type="button"
            className="side__close ibtn"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <Icon name="i-x" />
          </button>
        ) : null}
      </div>
      <div className="side__authority">
        <BrandLogo variant="lockup" />
      </div>
      {roleBanner ? (
        <div className="side__role">
          <Icon name="i-check-c" />
          <div>
            <b>{roleBanner.title}</b>
            <span>{roleBanner.subtitle}</span>
          </div>
        </div>
      ) : null}
      <nav className="nav" aria-label="Institution modules">
        {items.map((item) => {
          const badge = badges?.[item.id];
          const locked = lockedIds?.has(item.id) ?? false;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              title={locked ? "Request access to open this module" : undefined}
              className={({ isActive }) =>
                [isActive ? "on" : undefined, locked ? "nav-locked" : undefined]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onClick={() => onClose?.()}
            >
              <Icon name={item.icon} />
              {item.label}
              {locked ? (
                <span className="nav-lock" aria-hidden>
                  <Icon name="i-lock" />
                </span>
              ) : null}
              {badge != null && badge !== 0 && badge !== "0" ? (
                <span className="badge">{badge}</span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>
      <div className="side__foot">
        <a
          href="#collapse"
          onClick={(e) => {
            e.preventDefault();
            onCollapse?.();
            onClose?.();
          }}
        >
          <Icon name="i-cleft" />
          Collapse
        </a>
        <a
          href="#signout"
          onClick={(e) => {
            e.preventDefault();
            onSignOut?.();
          }}
        >
          <Icon name="i-out" />
          Sign out
        </a>
      </div>
    </aside>
  );
}
