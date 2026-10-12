import { useCallback, useEffect, useRef, useState } from "react";
import { AuthError, apiFetch } from "@eswasaone/shared-ui";
import { readSnapshot, writeSnapshot } from "../../lib/localSnapshot";

type Options = {
  enabled?: boolean;
  refreshKey?: string | number | null;
};

/**
 * Skeleton-first fetch for Me panes — hydrates from localStorage last-known-good
 * so remounts do not flash empty, then refreshes from network.
 */
export function useMeResource<T>(path: string, options: Options = {}) {
  const enabled = options.enabled ?? true;
  const refreshKey = options.refreshKey ?? "";
  // Snapshots are per signed-in person: one device can be shared, and HR data never crosses accounts.
  const key = `${refreshKey}:${path}`;
  const snap = readSnapshot<T>(key);
  const [data, setData] = useState<T | null>(() => snap?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled && !snap);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(Boolean(snap));
  const [authRequired, setAuthRequired] = useState(false);
  const dataRef = useRef<T | null>(data);
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
    void apiFetch<T>(path)
      .then((res) => {
        setData(res);
        writeSnapshot(key, res);
        setFromCache(false);
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
          const cached = readSnapshot<T>(key);
          if (cached) {
            setData(cached.data);
            setFromCache(true);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : "Request failed");
            if (!soft) setData(null);
          }
        }
      });
  }, [path, key, enabled]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { data, error, loading, refreshing, fromCache, authRequired, reload };
}
