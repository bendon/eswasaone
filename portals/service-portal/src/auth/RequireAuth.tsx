import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

/** Guarded route — progressive auth modal first; /login?next= as fallback. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, openAuth } = useAuth();
  const loc = useLocation();
  const next = loc.pathname + loc.search;

  useEffect(() => {
    if (!loading && !user) {
      openAuth({
        title: "Sign in to continue",
        reason: "This area is linked to your account.",
        next,
      });
    }
  }, [loading, user, openAuth, next]);

  if (loading) {
    return <p className="page-note">Checking session…</p>;
  }
  if (!user) {
    return (
      <div className="page">
        <h1 className="page-h">Sign in required</h1>
        <p className="page-lead">This area is linked to your account. Sign in to continue.</p>
        <div className="btn-row">
          <button type="button" className="btn-primary" onClick={() => openAuth({ next })}>
            Sign in
          </button>
          <Link className="btn-ghost" to={`/login?next=${encodeURIComponent(next)}`}>
            Sign-in page
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
