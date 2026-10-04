import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useState } from "react";
import {
  BrandLogo,
  Dock,
  Icon,
  IconSprite,
  SiteFooter,
  type IconName,
  type SiteFooterColumn,
} from "@eswasaone/shared-ui";
import { useAuth } from "../auth/AuthProvider";
import { useCartToast } from "../ui/CartToast";
import { CitizenMenu } from "../components/CitizenMenu";
import { ESWASA_CONTACT } from "../lib/contact";

const DESKTOP_NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/goals", label: "Goals" },
  { to: "/standards", label: "Standards" },
  { to: "/certification", label: "Certification" },
  { to: "/training", label: "Training" },
  { to: "/export", label: "Export" },
  { to: "/ai-tech", label: "AI & Tech", dot: true },
] as const;

const TAB_PRIMARY = [
  { to: "/", label: "Home", icon: "i-home" as IconName, end: true },
  { to: "/goals", label: "Goals", icon: "i-steps" as IconName },
  { to: "/standards", label: "Standards", icon: "i-book" as IconName },
  { to: "/export", label: "Export", icon: "i-globe" as IconName },
] as const;

const MORE_LINKS = [
  { to: "/ai-tech", label: "AI & Technology", icon: "i-chip" as IconName },
  { to: "/certification", label: "Certification", icon: "i-badge" as IconName },
  { to: "/training", label: "Training", icon: "i-cap" as IconName },
  { to: "/complaints", label: "Complaints", icon: "i-alert-c" as IconName },
  { to: "/applicability", label: "Applicability", icon: "i-shield-c" as IconName },
  { to: "/verify", label: "Verify", icon: "i-eye" as IconName },
  { to: "/account", label: "My account", icon: "i-users" as IconName },
] as const;

const UTILITY_LINKS = [
  { to: "/verify", label: "Verify a certificate" },
  { to: "/applicability", label: "Applicability checker" },
  { to: "/account", label: "My account" },
] as const;

const FOOTER_COLUMNS: SiteFooterColumn[] = [
  {
    title: "Services",
    links: [
      { to: "/standards", label: "Standards & E-Store" },
      { to: "/certification", label: "Certification" },
      { to: "/training", label: "Training & Courses" },
      { to: "/export", label: "Export Guidance" },
      { to: "/ai-tech", label: "AI & Technology" },
    ],
  },
  {
    title: "Quick links",
    links: [
      { to: "/goals", label: "Goals" },
      { to: "/applicability", label: "Standards Applicability" },
      { to: "/verify", label: "Verify a certificate" },
      { to: "/complaints", label: "Complaints & Enquiries" },
      { to: "/account", label: "My account" },
    ],
  },
];

const FOOTER_CONTACT = ESWASA_CONTACT;

function CartButton() {
  const { cartCount, showToast } = useCartToast();
  return (
    <button
      type="button"
      className="cartbtn"
      aria-label="Cart"
      onClick={() =>
        showToast(
          cartCount
            ? `${cartCount} item${cartCount === 1 ? "" : "s"} in cart`
            : "Your cart is empty",
        )
      }
    >
      <Icon name="i-cart" />
      <span className="cartbtn__count" hidden={cartCount === 0}>
        {cartCount}
      </span>
    </button>
  );
}

export function ServiceLayout() {
  const { user, openAuth, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [askBusy, setAskBusy] = useState(false);
  const [askValue, setAskValue] = useState("");
  const [expandSignal, setExpandSignal] = useState(0);
  const loc = useLocation();
  const navigate = useNavigate();
  const isHome = loc.pathname === "/";
  const routeKey = loc.pathname.split("/")[1] || "home";

  const openDock = useCallback(() => {
    setExpandSignal((n) => n + 1);
  }, []);

  const runAsk = useCallback(
    async (goal: string) => {
      setAskBusy(true);
      setAskValue(goal);
      try {
        navigate(`/?goal=${encodeURIComponent(goal)}`);
      } finally {
        setAskBusy(false);
      }
    },
    [navigate],
  );

  const handleSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  return (
    <>
      <IconSprite />

      <div className="utilbar">
        <div className="utilbar__in">
          <div className="utilbar__l">
            <a href={`tel:${FOOTER_CONTACT.phoneHref}`}>
              <Icon name="i-phone" /> Call: {FOOTER_CONTACT.phone}
            </a>
            <a href={`mailto:${FOOTER_CONTACT.email}`}>
              <Icon name="i-mail" /> {FOOTER_CONTACT.email}
            </a>
          </div>
          <nav className="utilbar__r" aria-label="Utility">
            {UTILITY_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <header className="topnav">
        <div className="topnav__in">
          <NavLink className="brand" to="/">
            <span className="brand__logo">
              <BrandLogo variant="mark" />
            </span>
            <div>
              <b>EswasaOne</b>
              <span>SERVICE PORTAL</span>
            </div>
          </NavLink>
          <nav className="navlinks" aria-label="Primary">
            {DESKTOP_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) => (isActive ? "on" : undefined)}
              >
                {item.label}
                {"dot" in item && item.dot ? (
                  <span className="nav-dot" aria-hidden="true" />
                ) : null}
              </NavLink>
            ))}
          </nav>
          <div className="authctl">
            <NavLink className="navsearch" to="/standards" aria-label="Search standards">
              <Icon name="i-search" />
            </NavLink>
            <CartButton />
            {!user ? (
              <button type="button" className="authbtn" onClick={() => openAuth()}>
                Sign in
              </button>
            ) : (
              <CitizenMenu user={user} onSignOut={handleSignOut} />
            )}
            <NavLink className="reportbtn" to="/complaints">
              Report an Issue
            </NavLink>
          </div>
        </div>
      </header>

      <header className="mtop">
        <NavLink className="brand" to="/">
          <span className="brand__logo">
            <BrandLogo variant="mark" />
          </span>
          <div>
            <b>EswasaOne</b>
            <span>SERVICE PORTAL</span>
          </div>
        </NavLink>
        <div className="mtop__acts authctl">
          <CartButton />
          {!user ? (
            <button type="button" className="authbtn" onClick={() => openAuth()}>
              Sign in
            </button>
          ) : (
            <CitizenMenu user={user} onSignOut={handleSignOut} compact />
          )}
        </div>
      </header>

      <main className={`wrap${isHome ? " wrap--home" : ""}`} data-route={routeKey}>
        <div className="content">
          {isHome ? <div className="hero-sentinel" aria-hidden /> : null}
          <Outlet
            context={{
              askValue,
              setAskValue,
              runAsk,
              askBusy,
              showHeroAsk: isHome,
              openDock,
            }}
          />
          <SiteFooter variant="full" columns={FOOTER_COLUMNS} contact={FOOTER_CONTACT} />
        </div>
      </main>

      <Dock visible onAsk={runAsk} busy={askBusy} expandSignal={expandSignal} />

      <nav className="tabbar" aria-label="Mobile primary">
        {TAB_PRIMARY.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={"end" in tab ? tab.end : false}
            className={({ isActive }) => `tab${isActive ? " on" : ""}`}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </NavLink>
        ))}
        <button type="button" className={`tab${moreOpen ? " on" : ""}`} onClick={() => setMoreOpen(true)}>
          <Icon name="i-more" />
          More
        </button>
      </nav>

      <div
        className={`sheet${moreOpen ? " show" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={() => setMoreOpen(false)}
      >
        <div className="sheet__c" onClick={(e) => e.stopPropagation()}>
          <div className="sheet__grip" />
          <h4>More</h4>
          {MORE_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setMoreOpen(false)}>
              <Icon name={link.icon} />
              {link.label}
            </NavLink>
          ))}
          {user ? (
            <button
              type="button"
              className="sheet__close"
              style={{ marginTop: 8, color: "var(--red, #9F1239)" }}
              onClick={() => {
                setMoreOpen(false);
                handleSignOut();
              }}
            >
              Sign out
            </button>
          ) : null}
          <button className="sheet__close" type="button" onClick={() => setMoreOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}

export type LayoutOutletContext = {
  askValue: string;
  setAskValue: (v: string) => void;
  runAsk: (goal: string) => Promise<void>;
  askBusy: boolean;
  showHeroAsk: boolean;
  openDock: () => void;
};
