import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../icons/Icon";
import { onEscape } from "../system/a11y";

export type TopBarMenuItem = {
  id: string;
  label: string;
  icon?: IconName;
  /** In-app route (react-router). */
  to?: string;
  onClick?: () => void;
  /** Destructive styling (e.g. sign out). */
  danger?: boolean;
};

type Props = {
  title: string;
  pill?: string;
  userName: string;
  userRole: string;
  userEmail?: string | null;
  avatarInitial?: string;
  avatarGradient?: string;
  extra?: ReactNode;
  /** Notification bell / dropdown — replaces the dummy bell in `.top__r`. */
  notifications?: ReactNode;
  /** Centred slot between the title and the account cluster (e.g. global search). */
  center?: ReactNode;
  /** Mobile nav drawer toggle — renders the hamburger when set. */
  onMenuClick?: () => void;
  menuOpen?: boolean;
  /** Extra links above Sign out. */
  menuItems?: TopBarMenuItem[];
  /** Opens the account menu — preferred over a bare click handler. */
  onSignOut?: () => void;
  /** @deprecated Prefer onSignOut + menuItems; still fires when the chip opens. */
  onUserClick?: () => void;
};

export function TopBar({
  title,
  pill,
  userName,
  userRole,
  userEmail,
  avatarInitial,
  avatarGradient = "linear-gradient(140deg,#4A52B0,#313391)",
  extra,
  notifications,
  center,
  onMenuClick,
  menuOpen = false,
  menuItems,
  onSignOut,
  onUserClick,
}: Props) {
  const initial = avatarInitial ?? userName.charAt(0).toUpperCase();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const hasMenu = Boolean(onSignOut || (menuItems && menuItems.length > 0) || onUserClick);

  useEffect(() => {
    if (!open) return;
    return onEscape(() => setOpen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function toggleMenu() {
    onUserClick?.();
    if (!onSignOut && !(menuItems && menuItems.length) && onUserClick) {
      return;
    }
    setOpen((v) => !v);
  }

  function runItem(item: TopBarMenuItem) {
    setOpen(false);
    item.onClick?.();
  }

  return (
    <header className={center ? "top top--center" : "top"}>
      {onMenuClick ? (
        <button
          type="button"
          className="ibtn top__menu-btn"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={onMenuClick}
        >
          <Icon name="i-list" />
        </button>
      ) : null}
      <h1>{title}</h1>
      {pill ? <span className="pill">{pill}</span> : null}
      {extra}
      {center ? <div className="top__center">{center}</div> : null}
      <div className="top__r">
        <button type="button" className="ibtn" aria-label="Theme">
          <Icon name="i-sun" />
        </button>
        {notifications ?? (
          <button type="button" className="ibtn" aria-label="Notifications">
            <Icon name="i-bell" />
          </button>
        )}
        <div className="top__div" />
        <div className={`top__user-wrap${open ? " is-open" : ""}`} ref={wrapRef}>
          <button
            type="button"
            className="top__user"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={hasMenu ? menuId : undefined}
            disabled={!hasMenu}
            onClick={hasMenu ? toggleMenu : undefined}
            style={{
              border: 0,
              background: "transparent",
              cursor: hasMenu ? "pointer" : "default",
              font: "inherit",
              color: "inherit",
              textAlign: "left",
            }}
          >
            <span className="top__av" style={{ background: avatarGradient }}>
              {initial}
            </span>
            <div>
              <b>{userName}</b>
              <span>{userRole}</span>
            </div>
            <Icon name="i-cev" className="cev" />
          </button>

          {open && hasMenu ? (
            <div className="top__menu" id={menuId} role="menu" aria-label="Account menu">
              <div className="top__menu-head">
                <span className="top__av" style={{ background: avatarGradient }} aria-hidden="true">
                  {initial}
                </span>
                <div className="top__menu-id">
                  <b>{userName}</b>
                  <span>{userEmail || userRole}</span>
                </div>
              </div>

              {menuItems && menuItems.length > 0 ? (
                <nav className="top__menu-links" aria-label="Account links">
                  {menuItems.map((item) =>
                    item.to ? (
                      <Link
                        key={item.id}
                        role="menuitem"
                        to={item.to}
                        onClick={() => runItem(item)}
                      >
                        {item.icon ? <Icon name={item.icon} /> : null}
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        className={item.danger ? "is-danger" : undefined}
                        onClick={() => runItem(item)}
                      >
                        {item.icon ? <Icon name={item.icon} /> : null}
                        {item.label}
                      </button>
                    ),
                  )}
                </nav>
              ) : null}

              {onSignOut ? (
                <div className="top__menu-foot">
                  <button
                    type="button"
                    role="menuitem"
                    className="top__menu-signout"
                    onClick={() => {
                      setOpen(false);
                      onSignOut();
                    }}
                  >
                    <Icon name="i-out" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
