import { useCallback, useEffect, useRef, useState } from "react";
import { AuthError, sessionFetch } from "@eswasaone/shared-ui";

type Options = {
  /** Skip fetch until true (default true). */
  enabled?: boolean;
  /** Change to re-fetch after login / navigation. */
  refreshKey?: string | number | null;
};

/**
 * Data fetch with skeleton-first initial load and soft reload.
 * Previous ``data`` is kept while ``refreshing`` so the UI never blanks.
 * Uses sessionFetch (cookies + bearer) so 401s surface as AuthError.
 */
export function useApiResource<T>(path: string, options: Options = {}) {
  const enabled = options.enabled ?? true;
  const refreshKey = options.refreshKey ?? "";
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;

  const reload = useCallback(() => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const soft = dataRef.current !== null;
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setAuthRequired(false);
    void sessionFetch<T>(path)
      .then((res) => {
        setData(res);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        setLoading(false);
        setRefreshing(false);
        if (err instanceof AuthError && err.authRequired) {
          setAuthRequired(true);
          setError(err.reason || err.message || "Sign in required");
          if (!soft) setData(null);
        } else {
          setError(err instanceof Error ? err.message : "Request failed");
          if (!soft) setData(null);
        }
      });
  }, [path, enabled]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { data, error, loading, refreshing, authRequired, reload };
}
