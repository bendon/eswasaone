import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, onEscape, type IconName, type SessionUser } from "@eswasaone/shared-ui";
import { getOverview } from "../api/account";
import { primaryRoleLabel } from "../lib/roles";

type MenuLink = {
  to: string;
  label: string;
  icon: IconName;
  hint: string;
};

const AREA_LINKS: MenuLink[] = [
  { to: "/account", label: "Overview", icon: "i-home", hint: "Alerts, apps & activity" },
  { to: "/account/orders", label: "Orders", icon: "i-cart", hint: "Purchases & invoices" },
  { to: "/account/certificates", label: "Certificates", icon: "i-badge", hint: "Issued marks & licences" },
  { to: "/account/training", label: "Training", icon: "i-cap", hint: "Courses & enrolments" },
  { to: "/account/team", label: "Team", icon: "i-users", hint: "Business members" },
  { to: "/account/settings", label: "Settings", icon: "i-settings", hint: "Profile & notifications" },
];

type StatChip = { label: string; value: string; to: string };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase() || "?";
}

type Props = {
  user: SessionUser;
  onSignOut: () => void;
  /** Compact trigger for the mobile top bar */
  compact?: boolean;
};

/**
 * Citizen account menu — avatar chip opens functional areas
 * (overview, orders, certificates, training, team, settings) + sign out.
 */
export function CitizenMenu({ user, onSignOut, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<StatChip[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const displayName = user.full_name || user.username;
  const initials = initialsOf(displayName);
  const roleLabel = primaryRoleLabel(user.roles);

  useEffect(() => {
    let cancelled = false;
    void getOverview("personal")
      .then((ov) => {
        if (cancelled) return;
        const by = (needle: string) =>
          ov.stats.items.find((s) => s.label.toLowerCase().includes(needle))?.value ?? "—";
        setStats([
          { label: "Apps", value: String(by("open")), to: "/account" },
          { label: "Orders", value: String(by("order")), to: "/account/orders" },
          { label: "Certs", value: String(by("cert")), to: "/account/certificates" },
          { label: "Courses", value: String(by("course") || by("team") || "—"), to: "/account/training" },
        ]);
      })
      .catch(() => {
        if (!cancelled) setStats([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    return onEscape(() => setOpen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`userchip${open ? " is-open" : ""}${compact ? " userchip--compact" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="userchip__btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${displayName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="av" aria-hidden="true">
          {initials}
        </span>
        {!compact ? (
          <span className="t">
            <b>{displayName}</b>
            <span>{roleLabel}</span>
          </span>
        ) : null}
        <Icon name="i-cev" size={14} className="userchip__caret" />      </button>

      {open ? (
        <div className="userchip__menu" role="menu" aria-label="My account">
          <div className="userchip__id">
            <span className="av av--lg" aria-hidden="true">
              {initials}
            </span>
            <div>
              <b>{displayName}</b>
              <span>
                {user.email || "Citizen account"}
                {roleLabel ? ` · ${roleLabel}` : ""}
              </span>
            </div>
          </div>

          {stats.length > 0 ? (
            <div className="userchip__stats" role="group" aria-label="Account summary">
              {stats.map((s) => (
                <Link
                  key={s.label}
                  to={s.to}
                  role="menuitem"
                  className="userchip__stat"
                  onClick={() => setOpen(false)}
                >
                  <b>{s.value}</b>
                  <span>{s.label}</span>
                </Link>
              ))}
            </div>
          ) : null}

          <nav className="userchip__links" aria-label="Account areas">
            {AREA_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className="userchip__ic" aria-hidden="true">
                  <Icon name={link.icon} size={16} />
                </span>
                <span className="userchip__link-copy">
                  <b>{link.label}</b>
                  <span>{link.hint}</span>
                </span>
              </Link>
            ))}
          </nav>

          <div className="userchip__foot">
            <button
              type="button"
              className="userchip__signout"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <Icon name="i-out" size={15} />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
