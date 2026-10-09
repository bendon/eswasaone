import { NavLink } from "react-router-dom";
import { BrandLogo, Icon } from "@eswasaone/shared-ui";
import { type InstitutionNavDef, type InstitutionRouteId } from "../nav";

type Props = {
  items: InstitutionNavDef[];
  lockedIds?: Set<InstitutionRouteId>;
  badges?: Partial<Record<InstitutionRouteId, number | string>>;
  /** Desktop icon-only rail. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  collapsed = false,
  onToggleCollapse,
  onSignOut,
  open = false,
  onClose,
}: Props) {
  return (
    <aside
      id="institution-side-nav"
      className={`side${open ? " is-open" : ""}${collapsed ? " side--collapsed" : ""}`}
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
      {onToggleCollapse ? (
        <button
          type="button"
          className="side__toggle"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="institution-side-nav"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapse}
        >
          <Icon name="i-cleft" />
        </button>
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
              title={
                locked ? "Request access to open this module" : collapsed ? item.label : undefined
              }
              className={({ isActive }) =>
                [isActive ? "on" : undefined, locked ? "nav-locked" : undefined]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onClick={() => onClose?.()}
            >
              <Icon name={item.icon} />
              <span className="nav__label">{item.label}</span>
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
          href="#signout"
          className="side__signout"
          title={collapsed ? "Sign out" : undefined}
          onClick={(e) => {
            e.preventDefault();
            onSignOut?.();
          }}
        >
          <Icon name="i-out" />
          <span className="nav__label">Sign out</span>
        </a>
      </div>
    </aside>
  );
}
