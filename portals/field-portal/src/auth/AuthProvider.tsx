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
  type SessionUser,
} from "@eswasaone/shared-ui";
import { clearAllSnapshots } from "../lib/localSnapshot";

type AuthCtx = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
  openAuth: (opts?: { title?: string; reason?: string }) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const SAFE_FALLBACK: AuthCtx = {
  user: null,
  loading: true,
  refresh: async () => null,
  openAuth: () => undefined,
  signOut: async () => undefined,
};

/**
 * Field portal auth — shared cookie session, stay on /field after login.
 * Intentionally does NOT call redirectStaffToInstitution.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Sign in to Field");
  const [reason, setReason] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const u = await me();
      setUser(u);
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

  const openAuth = useCallback((opts?: { title?: string; reason?: string }) => {
    setTitle(opts?.title || "Sign in to Field");
    setReason(opts?.reason);
    setOpen(true);
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    clearAllSnapshots();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, openAuth, signOut }),
    [user, loading, refresh, openAuth, signOut],
  );

  return (
    <Ctx.Provider value={value}>
      <IdleLockGate
        enabled={Boolean(user)}
        identityHint={user?.email || user?.username || ""}
        onRequireFullLogin={() => {
          void apiLogout().catch(() => undefined);
          setUser(null);
          openAuth({
            title: "Sign in again",
            reason: "Your sign-in window expired.",
          });
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
          // Stay on /field — do not bounce staff to Institution.
          setUser(u);
          setOpen(false);
        }}
      />
    </Ctx.Provider>
  );
}

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
