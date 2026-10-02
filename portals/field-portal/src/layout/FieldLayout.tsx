import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Icon, IconSprite, BrandLogo, hasStaffRole, type IconName } from "@eswasaone/shared-ui";
import { useAuth } from "../auth/AuthProvider";
import { StaffGate } from "../auth/StaffGate";
import { greetingForHour, initialsFromName, primaryRoleLabel } from "../lib/roles";

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Home", icon: "i-home", end: true },
  { to: "/audits", label: "Audits", icon: "i-clipboard" },
  { to: "/me", label: "Me", icon: "i-users" },
  { to: "/more", label: "More", icon: "i-more" },
];

function NonStaffNotice({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="staff-gate field-gate">
      <div className="staff-gate__card">
        <BrandLogo variant="lockup" className="staff-gate__brand" />
        <p className="staff-gate__eyebrow">FIELD APP</p>
        <h1 className="staff-gate__title">Staff only</h1>
        <p className="staff-gate__lead">
          This Field app is for ESWASA employees. Please use the{" "}
          <a href="/">Service Portal</a> for citizen and customer services.
        </p>
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn-primary" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function FieldLayout() {
  const { user, loading, refresh, signOut } = useAuth();
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (loading) {
    return (
      <div className="field-shell field-shell--gate">
        <p className="field-muted">Checking session…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <StaffGate
        onStaffSession={() => {
          void refresh();
        }}
      />
    );
  }

  if (!hasStaffRole(user.roles)) {
    return (
      <NonStaffNotice
        onSignOut={() => {
          void signOut();
        }}
      />
    );
  }

  const displayName = user.full_name || user.username;
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const role = primaryRoleLabel(user.roles);
  const initials = initialsFromName(displayName);

  return (
    <div className="field-shell">
      <IconSprite />
      <header className="field-header">
        <div className="field-header__brand">
          <BrandLogo variant="mark" className="field-header__mark" />
          <div>
            <p className="field-header__product">
              EswasaOne <span>FIELD</span>
            </p>
            <p className="field-header__greet">
              {greetingForHour()}, {firstName}
            </p>
          </div>
        </div>
        <div className="field-header__actions">
          <span
            className={`field-sync${online ? "" : " field-sync--off"}`}
            title={online ? "Online" : "Offline — using device cache"}
            aria-label={online ? "Online" : "Offline"}
          >
            <Icon name="i-refresh" />
            <span className="field-sync__dot" data-state={online ? "ok" : "off"} />
          </span>
          <button type="button" className="field-icon-btn" aria-label="Notifications">
            <Icon name="i-bell" />
          </button>
          <div className="field-avatar" title={displayName} aria-label={displayName}>
            {initials}
          </div>
        </div>
        <div className="field-header__meta">
          <span className="field-role-pill">{role}</span>
        </div>
      </header>

      <main className="field-main">
        <Outlet />
      </main>

      <nav className="field-tabs" aria-label="Field navigation">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              isActive ? "field-tab field-tab--active" : "field-tab"
            }
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
