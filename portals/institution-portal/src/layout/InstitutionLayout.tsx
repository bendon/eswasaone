import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  AppShell,
  TopBar,
  AuthError,
  apiFetch,
  me,
  logout,
  askAgent,
  SiteFooter,
  IdleLockGate,
  Dock,
  DialogProvider,
  onEscape,
  type SessionUser,
  type SiteFooterHealth,
} from "@eswasaone/shared-ui";
import { InstitutionSidebar } from "./InstitutionSidebar";
import { AccessDeniedPanel } from "../components/AccessDeniedPanel";
import { titleForPath, type InstitutionRouteId, INSTITUTION_NAV, routeFromAsk } from "../nav";
import { canAccessRoute, hasStaffRole, primaryStaffLabel } from "../staff";
import { listPendingAccessRequests } from "../hr/accessRequests";
import { probeCoreHealth } from "../lib/coreHealth";
import { StaffGate } from "../pages/StaffGate";

export type InstitutionOutletContext = {
  user: SessionUser;
  openAuth: (reason?: string) => void;
  refreshUser: () => void;
  sessionKey: string;
};

type BadgePayload = Partial<Record<InstitutionRouteId, number>>;

export function useInstitution() {
  return useOutletContext<InstitutionOutletContext>();
}

function sameSessionUser(a: SessionUser, b: SessionUser): boolean {
  return (
    a.username === b.username &&
    a.email === b.email &&
    a.full_name === b.full_name &&
    (a.roles ?? []).join("|") === (b.roles ?? []).join("|")
  );
}

function routeIdFromPath(pathname: string): InstitutionRouteId {
  const clean = pathname.replace(/\/$/, "") || "/";
  const hit = INSTITUTION_NAV.find((n) => {
    if (n.end) return clean === "/" || clean === "";
    return clean === n.path || clean.startsWith(`${n.path}/`);
  });
  return hit?.id ?? "dashboard";
}

export function InstitutionLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [badges, setBadges] = useState<BadgePayload>({});
  const [askBusy, setAskBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = useCallback(() => setNavOpen(false), []);
  const toggleNav = useCallback(() => setNavOpen((v) => !v), []);

  const refreshUser = useCallback(() => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const watchdog = window.setTimeout(() => {
      finish(() => {
        setAuthReady(true);
        // Keep existing user if any; only clear when we never had one.
        setUser((prev) => prev);
      });
    }, 12_000);
    void me()
      .then((u) => {
        finish(() => {
          window.clearTimeout(watchdog);
          if (!u) {
            setUser(null);
            setGateError(null);
            setAuthReady(true);
            return;
          }
          // Citizen / public sessions stay signed in — bounce to Service Portal.
          if (!hasStaffRole(u.roles)) {
            window.location.assign("/");
            return;
          }
          // Keep the same object when the session is unchanged so every
          // `user`-keyed effect (dashboard fetches, badges) does not re-run.
          setUser((prev) => (prev && sameSessionUser(prev, u) ? prev : u));
          setGateError(null);
          setAuthReady(true);
        });
      })
      .catch((err: unknown) => {
        finish(() => {
          window.clearTimeout(watchdog);
          setAuthReady(true);
          setUser(null);
          if (!(err instanceof AuthError && err.authRequired)) console.error(err);
        });
      });
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    setNavOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const off = onEscape(closeNav);
    return () => {
      document.body.style.overflow = prev;
      off();
    };
  }, [navOpen, closeNav]);

  useEffect(() => {
    if (!user || !hasStaffRole(user.roles)) {
      setBadges({});
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      apiFetch<{ pending_count: number }>("/approvals?limit=1"),
      apiFetch<{ new_count: number }>("/tbt/alerts?limit=1"),
    ]).then((results) => {
      if (cancelled) return;
      const next: BadgePayload = {};
      if (results[0].status === "fulfilled" && results[0].value.pending_count > 0) {
        next.approvals = results[0].value.pending_count;
      }
      if (results[1].status === "fulfilled" && results[1].value.new_count > 0) {
        next.tbt = results[1].value.new_count;
      }
      // Local access-request queue until /hr/access-requests exists.
      const pendingAccess = listPendingAccessRequests().length;
      if (pendingAccess > 0 && canAccessRoute(user.roles, "hr")) {
        next.hr = pendingAccess;
      }
      setBadges(next);
    });
    return () => {
      cancelled = true;
    };
  }, [loc.pathname, user]);

  const isStaff = Boolean(user && hasStaffRole(user.roles));

  /** Full rail — locked modules stay visible so staff can request access. */
  const visibleNav = useMemo(() => {
    if (!user) return [];
    return INSTITUTION_NAV;
  }, [user]);

  const lockedNav = useMemo(() => {
    if (!user) return new Set<InstitutionRouteId>();
    return new Set(
      INSTITUTION_NAV.filter((item) => !canAccessRoute(user.roles, item.id)).map((i) => i.id),
    );
  }, [user]);

  const roleBanner = useMemo(() => {
    if (!user) return { title: "Guest", subtitle: "Sign in for staff access" };
    return {
      title: primaryStaffLabel(user.roles),
      subtitle: user.email || "Institution access",
    };
  }, [user]);

  const sessionKey = user?.username ?? "guest";

  // Footer health chip — Core liveness via /api (nginx does not proxy root /health).
  const [footerHealth, setFooterHealth] = useState<SiteFooterHealth | null>(null);
  useEffect(() => {
    let cancelled = false;
    void probeCoreHealth()
      .then((state) => {
        if (cancelled) return;
        setFooterHealth(
          state === "up"
            ? { tone: "up", text: "Core API reachable" }
            : { tone: "down", text: "Core API degraded" },
        );
      })
      .catch(() => {
        if (!cancelled) setFooterHealth({ tone: "down", text: "Core API unreachable" });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  const routeId = routeIdFromPath(loc.pathname);
  const allowedHere = user ? canAccessRoute(user.roles, routeId) : false;

  const openAuth = useCallback((reason?: string) => {
    void logout().catch(() => undefined);
    setUser(null);
    setGateError(reason ?? "Sign in required");
  }, []);

  const signOut = useCallback(() => {
    void logout()
      .then(() => {
        setUser(null);
        setGateError(null);
      })
      .catch(console.error);
  }, []);

  const onDockAsk = useCallback(
    async (message: string) => {
      setAskBusy(true);
      try {
        const res = await askAgent({ message, context: { portal: "institution" } });
        const dest = routeFromAsk(message, res.tools_used);
        if (dest && dest !== "/") navigate(dest);
      } catch (err) {
        if (err instanceof AuthError && err.authRequired) {
          void logout().catch(() => undefined);
          setUser(null);
          setGateError(err.reason || err.message);
        } else {
          console.error(err);
        }
      } finally {
        setAskBusy(false);
      }
    },
    [navigate],
  );

  const ctx: InstitutionOutletContext | null = useMemo(() => {
    if (!user) return null;
    return { user, openAuth, refreshUser, sessionKey };
  }, [user, openAuth, refreshUser, sessionKey]);

  if (!authReady) {
    return (
      <div className="app app--auth-gate">
        <div className="staff-gate">
          <p style={{ color: "var(--muted)" }}>Checking staff session…</p>
        </div>
      </div>
    );
  }

  if (!isStaff || !user || !ctx) {
    return (
      <div className="app app--auth-gate">
        <StaffGate
          deniedMessage={gateError}
          onStaffSession={(u) => {
            setUser(u);
            setGateError(null);
          }}
        />
      </div>
    );
  }

  let body: ReactNode;
  if (!allowedHere) {
    body = <AccessDeniedPanel routeId={routeId} user={user} />;
  } else {
    body = <Outlet context={ctx} />;
  }

  return (
    <DialogProvider>
    <IdleLockGate
      enabled
      identityHint={user.email || user.username}
      onRequireFullLogin={() => {
        void logout().catch(() => undefined);
        setUser(null);
        setGateError("Sign-in window expired. Password and OTP required again");
      }}
    >
      <AppShell className={navOpen ? "app--nav-open" : undefined}>
        <button
          type="button"
          className="side-scrim"
          aria-label="Close navigation"
          tabIndex={navOpen ? 0 : -1}
          onClick={closeNav}
        />
        <InstitutionSidebar
          items={visibleNav}
          lockedIds={lockedNav}
          badges={badges}
          roleBanner={roleBanner}
          signedIn
          open={navOpen}
          onClose={closeNav}
          onCollapse={closeNav}
          onSignOut={signOut}
        />
        <div className="main">
          <TopBar
            title={titleForPath(loc.pathname)}
            pill={allowedHere ? "STAFF ACCESS" : "ACCESS DENIED"}
            userName={user.full_name || user.username}
            userRole={roleBanner.title}
            userEmail={user.email || user.username}
            onMenuClick={toggleNav}
            menuOpen={navOpen}
            menuItems={[
              { id: "home", label: "Dashboard", icon: "i-grid", to: "/" },
              ...(canAccessRoute(user.roles, "approvals")
                ? [{ id: "approvals", label: "Approvals", icon: "i-check-c" as const, to: "/approvals" }]
                : []),
              ...(canAccessRoute(user.roles, "hr")
                ? [{ id: "hr", label: "HR & People", icon: "i-users" as const, to: "/hr" }]
                : []),
            ]}
            onSignOut={signOut}
          />
          <div className="content">
            {body}
            <SiteFooter health={footerHealth} />
          </div>
        </div>
      </AppShell>
      <Dock
        visible
        signedIn
        userName={user.full_name || user.username}
        busy={askBusy}
        onAsk={onDockAsk}
        contextItems={[
          {
            id: "q1",
            title: "Which audits are overdue this week?",
            tone: "alert",
            ask: "Which audits are overdue this week?",
          },
          {
            id: "q2",
            title: "Applications past SLA",
            tone: "pending",
            ask: "Applications past SLA",
          },
          {
            id: "q3",
            title: "Revenue YTD vs target",
            tone: "info",
            ask: "Revenue YTD vs target",
          },
          {
            id: "q4",
            title: "Draft the board pack summary",
            tone: "tip",
            ask: "Draft the board pack summary",
          },
        ]}
      />
    </IdleLockGate>
    </DialogProvider>
  );
}
