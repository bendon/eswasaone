import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AuthModal,
  IdleLockGate,
  logout as apiLogout,
  me,
  redirectStaffAfterLogin,
  type SessionUser,
} from "@eswasaone/shared-ui";
import { useLocation, useNavigate } from "react-router-dom";

type AuthCtx = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
  openAuth: (opts?: { title?: string; reason?: string; next?: string }) => void;
  signOut: () => Promise<void>;
  requireAuth: (opts?: { title?: string; reason?: string; next?: string }) => boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

const SAFE_FALLBACK: AuthCtx = {
  user: null,
  loading: true,
  refresh: async () => null,
  openAuth: () => undefined,
  signOut: async () => undefined,
  requireAuth: () => false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Sign in to EswasaOne");
  const [reason, setReason] = useState<string | undefined>();
  const [next, setNext] = useState<string | undefined>();
  const navigate = useNavigate();
  const loc = useLocation();

  const refresh = useCallback(async () => {
    try {
      const u = await me();
      setUser(u);
      // Staff share the cookie session but land on Field or Institution SPA.
      if (u && redirectStaffAfterLogin(u.roles)) return u;
      return u;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openAuth = useCallback(
    (opts?: { title?: string; reason?: string; next?: string }) => {
      setTitle(opts?.title || "Sign in to EswasaOne");
      setReason(opts?.reason);
      // Citizens land on My account after a successful sign-in/sign-up unless
      // the caller set a deeper return path (e.g. RequireAuth, apply flow).
      setNext(opts?.next ?? "/account");
      setOpen(true);
    },
    [],
  );

  const requireAuth = useCallback(
    (opts?: { title?: string; reason?: string; next?: string }) => {
      if (user) return true;
      openAuth(opts);
      return false;
    },
    [user, openAuth],
  );

  const signOut = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, openAuth, signOut, requireAuth }),
    [user, loading, refresh, openAuth, signOut, requireAuth],
  );

  return (
    <Ctx.Provider value={value}>
      <IdleLockGate
        enabled={Boolean(user)}
        identityHint={user?.email || user?.username || ""}
        onRequireFullLogin={() => {
          void apiLogout().catch(() => undefined);
          setUser(null);
          const returnTo = `${loc.pathname}${loc.search}` || "/account";
          if (loc.pathname.startsWith("/login")) {
            openAuth({
              title: "Sign in again",
              reason: "Your session expired. Sign in to continue.",
              next: returnTo,
            });
            return;
          }
          navigate(`/login?next=${encodeURIComponent(returnTo)}`, { replace: true });
        }}
      >
        {children}
      </IdleLockGate>
      <AuthModal
        open={open}
        title={title}
        reason={reason}
        onClose={() => setOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          setOpen(false);
          if (redirectStaffAfterLogin(u.roles)) return;
          const dest = next || "/account";
          setNext(undefined);
          if (dest !== loc.pathname) navigate(dest);
        }}
      />
    </Ctx.Provider>
  );
}

/** Safe during HMR / errorElement remount — returns loading stub instead of throwing. */
export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("useAuth outside AuthProvider — returning safe stub");
    }
    return SAFE_FALLBACK;
  }
  return ctx;
}
