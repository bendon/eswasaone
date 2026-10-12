import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CrmNotConnectedError, crmVersion, subscribeCrm } from "./store";

export type CrmResource<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** True when the CRM store isn't available (demo mode off, no Core endpoint yet). */
  notConnected: boolean;
  reload: () => void;
};

/**
 * Load CRM data and re-run whenever the store changes (this tab or another tab).
 * `deps` re-run the loader when route params or filters change.
 */
export function useCrm<T>(load: () => Promise<T>, deps: unknown[] = []): CrmResource<T> {
  const version = useSyncExternalStore(subscribeCrm, crmVersion, crmVersion);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<CrmResource<T>, "reload">>({
    data: undefined,
    loading: true,
    error: null,
    notConnected: false,
  });

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null, notConnected: false });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setState({
          data: undefined,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          notConnected: e instanceof CrmNotConnectedError,
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/* ---------------- formatting ---------------- */

export function fmtE(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `E ${Math.round(n).toLocaleString()}`;
}

export function fmtShortE(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `E ${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1000) return `E ${Math.round(n / 1000)}k`;
  return `E ${n}`;
}

export function fmtDay(iso?: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return fmtDay(iso);
}

export function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
