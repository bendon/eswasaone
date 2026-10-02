import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon, type IconName } from "@eswasaone/shared-ui";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { AccountProvider, useAccount, type EntityKind } from "./AccountContext";

const TABS: { to: string; label: string; icon: IconName; end?: boolean; businessOnly?: boolean }[] = [
  { to: "/account", label: "Overview", icon: "i-home", end: true },
  { to: "/account/orders", label: "Orders", icon: "i-book" },
  { to: "/account/certificates", label: "Certificates", icon: "i-badge" },
  { to: "/account/training", label: "Training", icon: "i-cap" },
  { to: "/account/team", label: "Team", icon: "i-users", businessOnly: true },
  { to: "/account/settings", label: "Settings", icon: "i-settings" },
];

function EntitySwitcher() {
  const { entity, entities, setEntity } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = entities.find((e) => e.id === entity);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  if (!active) return null;
  const isBiz = active.kind === "business";

  return (
    <div className="workspace__switch" ref={ref}>
      <button
        type="button"
        className="switch-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className={`switch-btn__av${isBiz ? " switch-btn__av--biz" : ""}`}>
          {active.initials}
        </span>
        <span className="switch-btn__id">
          <b>{active.name}</b>
          <span>
            <i className="type-dot" aria-hidden="true" />
            {active.role} · {active.kind === "business" ? "Business account" : "Personal account"}
          </span>
        </span>
        <svg className="switch-btn__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="switch-menu" role="menu">
          <div className="switch-menu__lbl">Switch workspace</div>
          {entities.map((ent) => (
            <button
              key={ent.id}
              type="button"
              className={`switch-item${ent.id === entity ? " is-on" : ""}`}
              role="menuitem"
              onClick={() => {
                setEntity(ent.id as EntityKind);
                setOpen(false);
              }}
            >
              <span className={`switch-item__av${ent.kind === "business" ? " switch-item__av--biz" : ""}`}>
                {ent.initials}
              </span>
              <span className="switch-item__id">
                <b>{ent.name}</b>
                <span>{ent.role} · {ent.kind === "business" ? "Business" : "Personal"}</span>
              </span>
              <svg className="switch-item__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l4 4L19 7" />
              </svg>
            </button>
          ))}
          <div className="switch-menu__foot">
            <button type="button" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add a business account
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceHeader() {
  const { activeEntity } = useAccount();
  if (!activeEntity) return null;

  return (
    <section className="workspace">
      <div className="workspace__inner">
        <EntitySwitcher />
        <div className="workspace__meta">
          <span>Member since <b>{activeEntity.member_since}</b></span>
          <span className="dot" />
          <span>{activeEntity.verified ? "Verified email" : "Unverified"}</span>
          <span className="dot" />
          <span>{activeEntity.role}</span>
        </div>
      </div>
    </section>
  );
}

function AccountShell() {
  const loc = useLocation();
  const { entity } = useAccount();
  const isBiz = entity === "business";

  const crumbs = loc.pathname === "/account"
    ? [{ label: "Home", to: "/" }, { label: "My account" }]
    : [{ label: "Home", to: "/" }, { label: "My account", to: "/account" }, { label: labelForPath(loc.pathname) }];

  return (
    <div className="page">
      <Breadcrumbs items={crumbs} />
      <WorkspaceHeader />
      <nav className="wsnav" role="tablist" aria-label="Account sections">
        {TABS.filter((t) => !t.businessOnly || isBiz).map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => (isActive ? "is-on" : undefined)}
            role="tab"
          >
            <Icon name={t.icon} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

function labelForPath(path: string): string {
  if (path.endsWith("/orders")) return "Orders";
  if (path.endsWith("/certificates")) return "Certificates";
  if (path.endsWith("/training")) return "Training";
  if (path.endsWith("/team")) return "Team";
  if (path.endsWith("/settings")) return "Settings";
  return "Overview";
}

export function AccountLayout() {
  return (
    <AccountProvider>
      <AccountShell />
    </AccountProvider>
  );
}