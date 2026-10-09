import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Icon,
  IconSprite,
  AuthModal,
  me,
  logout,
  type SessionUser,
  type IconName,
} from "@eswasaone/shared-ui";
import { buildGuide } from "../guide/api";
import type { GuideAction, GuideResponse } from "../guide/types";

const DESKTOP_NAV = [
  { id: "home", label: "Home" },
  { id: "standards", label: "Standards" },
  { id: "certification", label: "Certification" },
  { id: "training", label: "Training" },
  { id: "export", label: "Export" },
  { id: "complaints", label: "Complaints" },
] as const;

const TAB_PRIMARY = [
  { id: "home", label: "Home", icon: "i-home" as IconName },
  { id: "standards", label: "Standards", icon: "i-book" as IconName },
  { id: "certification", label: "Certify", icon: "i-badge" as IconName },
  { id: "export", label: "Export", icon: "i-globe" as IconName },
] as const;

const MORE_LINKS = [
  { id: "training", label: "Training", icon: "i-cap" as IconName },
  { id: "complaints", label: "Complaints", icon: "i-alert-c" as IconName },
  { id: "applicability", label: "Applicability", icon: "i-shield-c" as IconName },
] as const;

const CHIPS = [
  { label: "Export honey to the EU", goal: "Export honey to the EU" },
  { label: "Get ISO 9001 certified", goal: "Get ISO 9001 certified" },
  { label: "Sell bottled water locally", goal: "Sell bottled water locally" },
] as const;

const SERVICES: {
  title: string;
  body: string;
  pill: string;
  pillBg: string;
  pillFg: string;
  gradient: string;
  icon: IconName;
}[] = [
  {
    title: "Standards & E-Store",
    body: "Search the SZNS catalogue and buy standards for your sector.",
    pill: "300+ standards",
    pillBg: "#E4F0F0",
    pillFg: "#0E7C7B",
    gradient: "linear-gradient(135deg,#334155,#1E293B)",
    icon: "i-book",
  },
  {
    title: "Certification",
    body: "Apply for management-system or product certification and track it.",
    pill: "ISO 9001 & more",
    pillBg: "#E3F4E9",
    pillFg: "#15803D",
    gradient: "linear-gradient(135deg,#15803D,#166534)",
    icon: "i-badge",
  },
  {
    title: "Export Guidance",
    body: "Market access requirements by product and destination.",
    pill: "45+ markets",
    pillBg: "#FBF1D8",
    pillFg: "#B4741B",
    gradient: "linear-gradient(135deg,#0E7C7B,#0C5D63)",
    icon: "i-globe",
  },
  {
    title: "Training & Courses",
    body: "Enrol in standards-based training and earn digital certificates.",
    pill: "24 courses",
    pillBg: "#F0E9FB",
    pillFg: "#7C3AED",
    gradient: "linear-gradient(135deg,#7C3AED,#5B21B6)",
    icon: "i-cap",
  },
  {
    title: "Standards Applicability",
    body: "Not sure which standard applies? Use the free checker.",
    pill: "Free tool",
    pillBg: "#E8EEFB",
    pillFg: "#1D4ED8",
    gradient: "linear-gradient(135deg,#1D4ED8,#1E3A8A)",
    icon: "i-shield-c",
  },
  {
    title: "Complaints & Enquiries",
    body: "Report substandard products or submit a quality enquiry.",
    pill: "24–48 hr",
    pillBg: "#FDECEC",
    pillFg: "#E11D6E",
    gradient: "linear-gradient(135deg,#D97706,#B45309)",
    icon: "i-alert-c",
  },
];

const STATS = [
  { value: "312", label: "Standards Published", bg: "var(--gold)", icon: "i-file" as IconName },
  { value: "148", label: "Companies Certified", bg: "var(--blue)", icon: "i-badge" as IconName },
  { value: "2,840", label: "Learners Enrolled", bg: "var(--green)", icon: "i-users" as IconName },
  { value: "430", label: "Exporters Assisted", bg: "var(--purple)", icon: "i-trend" as IconName },
];

const ACTION_ICON: Record<GuideAction["type"], IconName> = {
  buy: "i-cart",
  apply: "i-clipboard",
  book: "i-clipboard",
  open: "i-eye",
};

type PendingAction = {
  type: GuideAction["type"];
  label: string;
  target: string;
  reason?: string;
};

function initials(user: SessionUser): string {
  const parts = (user.full_name || user.username || "?").split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function resumeAction(action: PendingAction) {
  if (action.type === "buy") {
    window.location.assign(`/estore/checkout?item=${encodeURIComponent(action.target)}`);
    return;
  }
  if (action.type === "apply" || action.type === "book") {
    window.location.assign(
      `/certification/apply?scheme=${encodeURIComponent(action.target)}`,
    );
    return;
  }
  if (action.target.startsWith("http")) {
    window.open(action.target, "_blank", "noopener,noreferrer");
  }
}

function AuthControl({
  user,
  onSignIn,
  onSignOut,
}: {
  user: SessionUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  if (!user) {
    return (
      <button type="button" className="authbtn" onClick={onSignIn}>
        Sign in
      </button>
    );
  }
  return (
    <div className="userchip">
      <span className="av">{initials(user)}</span>
      <div className="t">
        <b>{user.full_name || user.username}</b>
        <span>{user.roles?.[0] || "Citizen"}</span>
      </div>
      <button type="button" className="so" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

export function ServiceHomePage() {
  const [route, setRoute] = useState("home");
  const [moreOpen, setMoreOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<GuideResponse | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTitle, setAuthTitle] = useState("Sign in to EswasaOne");
  const [authReason, setAuthReason] = useState<string | undefined>();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void me().then(setUser).catch(() => setUser(null));
  }, []);

  const openAuth = useCallback((title: string, reason?: string) => {
    setAuthTitle(title);
    setAuthReason(reason);
    setAuthOpen(true);
  }, []);

  const run = useCallback(
    async (forcedGoal?: string) => {
      const value = (forcedGoal ?? goal).trim();
      if (!value) return;
      setGoal(value);
      setBusy(true);
      setGuide(null);
      setDone({});
      setNote(null);
      try {
        const { guide: res } = await buildGuide({ goal: value });
        setGuide(res);
      } catch (err) {
        console.error(err);
        setNote("Guide service unavailable. Try again shortly.");
      } finally {
        setBusy(false);
      }
    },
    [goal],
  );

  function handleAction(action: GuideAction) {
    if (action.type === "open" || user) {
      resumeAction({
        type: action.type,
        label: action.label,
        target: action.target,
        reason: action.reason,
      });
      if (user && action.type !== "open") {
        setNote(`Continuing: ${action.label}`);
      }
      return;
    }
    setPending({
      type: action.type,
      label: action.label,
      target: action.target,
      reason: action.reason,
    });
    openAuth("Sign in to continue", action.reason);
  }

  async function handleSignOut() {
    await logout().catch(() => undefined);
    setUser(null);
  }

  function go(id: string) {
    setRoute(id);
    setMoreOpen(false);
    if (id !== "home") {
      // Destinations only for now — Home is the assistant surface
      setNote(`“${id}” screen coming soon. Stay on Home for guides.`);
    }
  }

  function onAskSubmit(e: FormEvent) {
    e.preventDefault();
    void run();
  }

  return (
    <>
      <IconSprite />

      <header className="topnav">
        <div className="topnav__in">
          <a className="brand" href="#home" onClick={() => go("home")}>
            <span className="brand__logo">
              <Icon name="i-shield" />
            </span>
            <div>
              <b>EswasaOne</b>
              <span>SERVICE PORTAL</span>
            </div>
          </a>
          <nav className="navlinks" aria-label="Primary">
            {DESKTOP_NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={route === item.id ? "on" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.id);
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="authctl">
            <AuthControl
              user={user}
              onSignIn={() => openAuth("Sign in to EswasaOne")}
              onSignOut={() => void handleSignOut()}
            />
          </div>
        </div>
      </header>

      <header className="mtop">
        <div className="brand">
          <span className="brand__logo">
            <Icon name="i-shield" />
          </span>
          <div>
            <b>EswasaOne</b>
            <span>SERVICE PORTAL</span>
          </div>
        </div>
        <div className="authctl">
          <AuthControl
            user={user}
            onSignIn={() => openAuth("Sign in to EswasaOne")}
            onSignOut={() => void handleSignOut()}
          />
        </div>
      </header>

      <main className="wrap">
        <div className="content">
          <section className="hero">
            <div className="hero__label">ESWASAONE SERVICE PORTAL</div>
            <h2>What can we help you with today?</h2>
            <p>
              Ask the EswasaOne assistant about standards, certification, exports and training,
              and it will build the exact steps: which standards apply, what to prepare, and what
              it costs.
            </p>
            <form className="ask" onSubmit={onAskSubmit}>
              <span className="ic">
                <Icon name="i-spark" />
              </span>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder='Ask EswasaOne anything…  e.g. "Export honey to the EU"'
                aria-label="Your goal"
              />
              <button type="submit" disabled={busy || !goal.trim()}>
                <Icon name="i-send" /> {busy ? "Building…" : "Build my guide"}
              </button>
            </form>
            <div className="chips">
              {CHIPS.map((c) => (
                <button key={c.goal} type="button" onClick={() => void run(c.goal)}>
                  {c.label}
                </button>
              ))}
            </div>
          </section>

          {busy ? (
            <div className="skel show">
              <div className="skel-card">
                <div className="skel-line w60" />
                <div className="skel-line w80" />
                <div className="skel-line w40" />
              </div>
              <div className="skel-card">
                <div className="skel-line w60" />
                <div className="skel-line w80" />
              </div>
            </div>
          ) : null}

          {guide ? (
            <section className="guide show">
              <div>
                <div className="guide__head">
                  <span className="g">
                    <Icon name="i-spark" />
                  </span>
                  <div>
                    <h3>{guide.title}</h3>
                    <p>{guide.summary}</p>
                    <div className="trust">
                      <span /> Generated from official ESWASA, Codex &amp; market sources
                    </div>
                  </div>
                </div>
                <div className="steps">
                  {guide.steps.map((step, i) => (
                    <div key={`${step.title}-${i}`} className={`step${done[i] ? " done" : ""}`}>
                      <button
                        type="button"
                        className="step__n"
                        title="Mark as done"
                        onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                      >
                        {done[i] ? "✓" : i + 1}
                      </button>
                      <div className="step__card">
                        <b>{step.title}</b>
                        <p>{step.detail}</p>
                        <div className="src">
                          {step.citations.map((c) => (
                            <a
                              key={`${c.label}-${c.url}`}
                              href={c.url || "#"}
                              target={c.url?.startsWith("http") ? "_blank" : undefined}
                              rel="noopener noreferrer"
                            >
                              <Icon name="i-link" />
                              {c.label}
                              <span className={`rgt ${c.rights}`}>{c.rights}</span>
                            </a>
                          ))}
                        </div>
                        {step.action ? (
                          <div className="step__act">
                            <button
                              type="button"
                              className={`btn ${step.action.type}`}
                              onClick={() => handleAction(step.action!)}
                            >
                              <Icon name={ACTION_ICON[step.action.type]} />
                              {step.action.label}
                              {step.action.auth_required && !user ? (
                                <Icon name="i-lock" className="lock" />
                              ) : null}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="guide__rail">
                <div className="summary">
                  <h4>At a glance</h4>
                  <div className="row">
                    <span>Standards that apply</span>
                    <b>{guide.meta.standards}</b>
                  </div>
                  <div className="row">
                    <span>Estimated fees</span>
                    <b>{guide.meta.est_fee}</b>
                  </div>
                  <div className="row">
                    <span>Typical timeline</span>
                    <b>{guide.meta.est_timeline}</b>
                  </div>
                  <div className="row">
                    <span>Steps</span>
                    <b>{guide.meta.steps}</b>
                  </div>
                </div>
                <div className="authbox">
                  <b>Ready to act?</b>
                  <p>
                    Reading this guide is free. Sign in only when you want to buy a standard, apply,
                    or track progress.
                  </p>
                  {!user ? (
                    <button type="button" onClick={() => openAuth("Create your free account")}>
                      Create free account
                    </button>
                  ) : null}
                  <div className="fn">Guides &amp; applicability stay free forever</div>
                </div>
              </div>
            </section>
          ) : null}

          {note ? (
            <p style={{ marginTop: 16, color: "var(--muted)", fontSize: 13 }}>{note}</p>
          ) : null}

          <section className="stats">
            {STATS.map((s) => (
              <div key={s.label} className="stat">
                <span className="stat__ic" style={{ background: s.bg }}>
                  <Icon name={s.icon} />
                </span>
                <div>
                  <b>{s.value}</b>
                  <span>{s.label}</span>
                </div>
              </div>
            ))}
          </section>

          <div className="sec-h">Browse services</div>
          <div className="sec-sub">Or jump straight to what you need</div>
          <section className="services">
            {SERVICES.map((svc) => (
              <a key={svc.title} className="svc" href={`#${svc.title}`}>
                <div className="svc__top" style={{ background: svc.gradient }}>
                  <span className="wm">
                    <Icon name={svc.icon} />
                  </span>
                  <span className="svc__chip">
                    <Icon name={svc.icon} />
                  </span>
                  <b>{svc.title}</b>
                </div>
                <div className="svc__body">
                  <p>{svc.body}</p>
                  <div className="svc__foot">
                    <span className="svc__pill" style={{ background: svc.pillBg, color: svc.pillFg }}>
                      {svc.pill}
                    </span>
                    <span className="svc__open">
                      Open <Icon name="i-cright" />
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </section>

          <section className="actwrap">
            <div className="rail__h">
              <h3>Recent activity</h3>
            </div>
            {user ? (
              <div className="rlist">
                <div className="rrow">
                  <span className="rrow__ic" style={{ background: "var(--teal)" }}>
                    <Icon name="i-file" />
                  </span>
                  <div>
                    <b>Certification application in progress</b>
                    <span>APP-2026-00001 · ISO 9001</span>
                  </div>
                  <span className="rstatus" style={{ background: "#E4F4F1", color: "var(--teal)" }}>
                    <span className="s" style={{ background: "var(--teal)" }} /> In review
                  </span>
                </div>
                <div className="rrow">
                  <span className="rrow__ic" style={{ background: "var(--gold)" }}>
                    <Icon name="i-book" />
                  </span>
                  <div>
                    <b>Standard downloaded</b>
                    <span>SZNS catalogue item</span>
                  </div>
                  <span className="rstatus" style={{ background: "#FBF1D8", color: "#B4741B" }}>
                    <span className="s" style={{ background: "var(--gold)" }} /> Licensed
                  </span>
                </div>
              </div>
            ) : (
              <div className="guestcard">
                <b>Sign in to track your activity</b>
                Applications, purchases and training progress appear here after you sign in.
                <br />
                <button type="button" onClick={() => openAuth("Sign in to track activity")}>
                  Sign in
                </button>
              </div>
            )}
          </section>
        </div>
      </main>

      <nav className="tabbar" aria-label="Mobile primary">
        {TAB_PRIMARY.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab${route === tab.id ? " on" : ""}`}
            onClick={() => go(tab.id)}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          className={`tab${moreOpen ? " on" : ""}`}
          onClick={() => setMoreOpen(true)}
        >
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
          <h4>More</h4>
          {MORE_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(e) => {
                e.preventDefault();
                go(link.id);
              }}
            >
              <Icon name={link.icon} />
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <AuthModal
        open={authOpen}
        title={authTitle}
        reason={authReason}
        onClose={() => {
          setAuthOpen(false);
          setPending(null);
        }}
        onSuccess={(u) => {
          setUser(u);
          setAuthOpen(false);
          if (pending) {
            const action = pending;
            setPending(null);
            setNote(`Welcome back! Continuing: ${action.label}`);
            resumeAction(action);
          }
        }}
      />
    </>
  );
}
