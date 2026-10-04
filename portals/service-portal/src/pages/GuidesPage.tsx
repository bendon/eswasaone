import { useCallback, useEffect, useState } from "react";
import {
  AppShell,
  Sidebar,
  TopBar,
  Icon,
  AuthModal,
  me,
  logout,
  type NavItem,
  type SessionUser,
} from "@eswasaone/shared-ui";
import { buildGuide } from "../guide/api";
import type { GuideAction, GuideResponse } from "../guide/types";

const NAV: NavItem[] = [
  { id: "home", label: "Home", icon: "i-home" },
  { id: "guides", label: "Guides", icon: "i-spark", active: true },
  { id: "standards", label: "Standards", icon: "i-book" },
  { id: "certification", label: "Certification", icon: "i-badge" },
  { id: "export", label: "Export", icon: "i-globe" },
  { id: "complaints", label: "Complaints", icon: "i-alert-c" },
];

const DEMO_CHIPS = [
  { label: "Export honey to the EU", goal: "Export honey to the EU" },
  { label: "Get ISO 9001 certified", goal: "Get ISO 9001 certified" },
  { label: "Sell bottled water locally", goal: "Sell bottled water locally" },
] as const;

const ACTION_ICON: Record<GuideAction["type"], "i-search" | "i-file" | "i-book" | "i-globe"> = {
  buy: "i-search",
  apply: "i-file",
  book: "i-book",
  open: "i-globe",
};

type PendingAction = {
  type: GuideAction["type"];
  label: string;
  target: string;
  reason?: string;
};

type Props = {
  onNavigate?: (id: string) => void;
};

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

export function GuidesPage({ onNavigate }: Props) {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<GuideResponse | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTitle, setAuthTitle] = useState("Sign in to continue");
  const [authReason, setAuthReason] = useState<string | undefined>();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [resumeNote, setResumeNote] = useState<string | null>(null);

  useEffect(() => {
    void me().then(setUser).catch(() => setUser(null));
  }, []);

  const run = useCallback(
    async (forcedGoal?: string) => {
      const value = (forcedGoal ?? goal).trim();
      if (!value) return;
      setGoal(value);
      setBusy(true);
      setGuide(null);
      setDone({});
      setResumeNote(null);
      try {
        const { guide: res } = await buildGuide({ goal: value });
        setGuide(res);
      } catch (err) {
        console.error(err);
        setResumeNote("Guide service unavailable — try again shortly.");
      } finally {
        setBusy(false);
      }
    },
    [goal],
  );

  function openAuth(title: string, reason?: string) {
    setAuthTitle(title);
    setAuthReason(reason);
    setAuthOpen(true);
  }

  function handleAction(action: GuideAction) {
    if (action.type === "open" || user) {
      resumeAction({
        type: action.type,
        label: action.label,
        target: action.target,
        reason: action.reason,
      });
      if (user && action.type !== "open") {
        setResumeNote(`Continuing: ${action.label}`);
      }
      return;
    }
    if (action.auth_required) {
      setPending({
        type: action.type,
        label: action.label,
        target: action.target,
        reason: action.reason,
      });
      openAuth("Sign in to continue", action.reason);
    }
  }

  function onAuthSuccess(next: SessionUser) {
    setUser(next);
    setAuthOpen(false);
    if (pending) {
      const action = pending;
      setPending(null);
      setResumeNote(`Welcome back! Continuing: ${action.label}`);
      // buy → checkout, apply → create case
      window.setTimeout(() => resumeAction(action), 200);
    }
  }

  const guestLabel = user
    ? `Signed in · ${user.roles[0] ?? "Citizen"}`
    : "Browsing as guest · no account needed";

  return (
    <AppShell>
      <Sidebar
        brandSubtitle="SERVICE PORTAL"
        items={NAV}
        onNav={(id) => onNavigate?.(id)}
        onSignOut={() => {
          if (user) {
            void logout().then(() => setUser(null));
          } else {
            openAuth("Sign in to EswasaOne");
          }
        }}
      />
      <div className="main">
        <TopBar
          title="Guided flow"
          pill="Free · no login"
          userName={user?.full_name ?? "Guest"}
          userRole="Guides"
          extra={<span className="guide-top-r">Powered by the EswasaOne assistant</span>}
        />

        <div className="content">
          <p className="guide-guest-hint">{guestLabel}</p>

          <section className="ask-wrap">
            <h2>What are you trying to do?</h2>
            <p>
              Describe your goal in plain language. We’ll build the exact steps — which standards
              apply, what to prepare, and what it costs.
            </p>
            <div className="ask-main">
              <span className="ask-main__ic">
                <Icon name="i-spark" />
              </span>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder='e.g. “Export honey to the EU” or “Get ISO 9001 certified”'
                onKeyDown={(e) => {
                  if (e.key === "Enter") void run();
                }}
              />
              <button type="button" disabled={busy} onClick={() => void run()}>
                <Icon name="i-send" />
                {busy ? "Building…" : "Build my guide"}
              </button>
            </div>
            <div className="guide-chips">
              {DEMO_CHIPS.map((chip) => (
                <button
                  key={chip.goal}
                  type="button"
                  className="guide-chip"
                  onClick={() => void run(chip.goal)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </section>

          {busy ? (
            <div className="guide-skel" aria-busy="true" aria-label="Building guide">
              <div className="guide-skel-card">
                <div className="guide-skel-line w60" />
                <div className="guide-skel-line w80" />
                <div className="guide-skel-line w40" />
              </div>
              <div className="guide-skel-card">
                <div className="guide-skel-line w60" />
                <div className="guide-skel-line w80" />
                <div className="guide-skel-line w40" />
              </div>
              <div className="guide-skel-card">
                <div className="guide-skel-line w60" />
                <div className="guide-skel-line w80" />
              </div>
            </div>
          ) : null}

          {resumeNote ? (
            <div className="guide-resume" role="status">
              {resumeNote}
            </div>
          ) : null}

          {guide && !busy ? (
            <section className="guide-flow">
              <div>
                <div className="guide-flow__head">
                  <span className="guide-flow__g">
                    <Icon name="i-spark" />
                  </span>
                  <div>
                    <h3>{guide.title}</h3>
                    <p>{guide.summary}</p>
                    <div className="guide-trust">
                      <span /> Generated from official ESWASA, Codex & market sources
                    </div>
                  </div>
                </div>

                <div className="guide-steps">
                  {guide.steps.map((step, i) => {
                    const isDone = !!done[i];
                    return (
                      <div
                        key={`${step.title}-${i}`}
                        className={`guide-step${isDone ? " done" : ""}`}
                      >
                        <button
                          type="button"
                          className="guide-step__n"
                          title="Mark as done"
                          onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                        >
                          {isDone ? "✓" : i + 1}
                        </button>
                        <div className="guide-step__card">
                          <b>{step.title}</b>
                          <p>{step.detail}</p>
                          {step.citations.length > 0 ? (
                            <div className="guide-src">
                              {step.citations.map((c) => (
                                <a
                                  key={`${c.label}-${c.url}`}
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Icon name="i-book" />
                                  <span>{c.label}</span>
                                  <span className={`badge-r ${c.rights}`}>{c.rights}</span>
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {step.action ? (
                            <div className="guide-step__act">
                              <button
                                type="button"
                                className={`guide-btn ${step.action.type}`}
                                onClick={() => handleAction(step.action!)}
                              >
                                <Icon name={ACTION_ICON[step.action.type]} />
                                <span>{step.action.label}</span>
                                {step.action.auth_required && !user ? (
                                  <Icon name="i-shield" />
                                ) : null}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="guide-rail">
                <div className="guide-summary">
                  <h4>At a glance</h4>
                  <div className="guide-summary__row">
                    <span>Standards that apply</span>
                    <b>{guide.meta.standards}</b>
                  </div>
                  <div className="guide-summary__row">
                    <span>Estimated fees</span>
                    <b>{guide.meta.est_fee}</b>
                  </div>
                  <div className="guide-summary__row">
                    <span>Typical timeline</span>
                    <b>{guide.meta.est_timeline}</b>
                  </div>
                  <div className="guide-summary__row">
                    <span>Steps</span>
                    <b>{guide.meta.steps}</b>
                  </div>
                </div>
                <div className="guide-authbox">
                  <b>Ready to act?</b>
                  <p>
                    Reading this guide is free. Sign in only when you want to buy a standard,
                    apply, or track progress.
                  </p>
                  <button type="button" onClick={() => openAuth("Create your free account")}>
                    Create free account
                  </button>
                  <div className="guide-free-note">Guides & applicability stay free forever</div>
                </div>
              </div>
            </section>
          ) : null}
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
        onSuccess={onAuthSuccess}
      />
    </AppShell>
  );
}
