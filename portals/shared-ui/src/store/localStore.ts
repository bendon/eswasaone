/**
 * Local demo store factory — the crm/store.ts pattern, generalised (gap 01 C12).
 *
 * - localStorage-backed, seeded on first read, versioned (bump `v` to reseed).
 * - Reads and writes hand out structuredClone copies.
 * - Change events fire in this tab and in other tabs (`storage` event), so a customer action
 *   in the Service portal shows up in the staff queue on the same origin.
 * - `guard()` only blocks when demo data is explicitly turned off (VITE_DEMO_MODE=false).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { demoDataEnabled } from "../demo";

export class NotConnectedError extends Error {
  constructor(what = "This") {
    super(`${what} isn't connected to ESWASA's systems yet.`);
    this.name = "NotConnectedError";
  }
}

export type LocalStore<S> = {
  key: string;
  read: () => S;
  /** Apply a change, persist, notify; returns a copy of what `fn` returned. */
  mutate: <T>(fn: (s: S) => T) => T;
  /** A copy of what `fn` returns from the current state (no write). */
  view: <T>(fn: (s: S) => T) => T;
  reset: () => void;
  subscribe: (fn: () => void) => () => void;
  version: () => number;
  guard: (what: string) => void;
};

export function createLocalStore<S extends { v: number }>(opts: {
  key: string;
  v: number;
  seed: () => S;
  /** Runs on every fresh read (auto-close, lapse checks…). Mutates in place. */
  onRead?: (s: S) => void;
}): LocalStore<S> {
  const { key } = opts;
  let cache: S | null = null;
  const listeners = new Set<() => void>();
  let ver = 0;

  const persist = (s: S) => {
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch {
      /* quota / private mode: session-only */
    }
  };
  const emit = () => {
    ver += 1;
    listeners.forEach((l) => l());
  };

  const read = (): S => {
    if (cache) return cache;
    let s: S | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) s = JSON.parse(raw) as S;
    } catch {
      s = null;
    }
    if (!s || s.v !== opts.v) {
      s = opts.seed();
      persist(s);
    }
    opts.onRead?.(s);
    cache = s;
    return s;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === key) {
        cache = null;
        emit();
      }
    });
  }

  return {
    key,
    read,
    mutate<T>(fn: (s: S) => T): T {
      const s = read();
      const out = fn(s);
      persist(s);
      emit();
      return out === undefined ? out : structuredClone(out);
    },
    view<T>(fn: (s: S) => T): T {
      const out = fn(read());
      return out === undefined ? out : structuredClone(out);
    },
    reset() {
      cache = opts.seed();
      persist(cache);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    version: () => ver,
    guard(what: string) {
      if (!demoDataEnabled()) throw new NotConnectedError(what);
    },
  };
}

export type StoreResource<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  notConnected: boolean;
  reload: () => void;
};

/**
 * Load from one or more stores and re-run whenever any of them changes.
 * `deps` re-run the loader when route params or filters change.
 */
export function useStoreResource<T>(
  stores: Pick<LocalStore<unknown>, "subscribe" | "version">[],
  load: () => Promise<T> | T,
  deps: unknown[] = [],
): StoreResource<T> {
  const subscribe = useCallback(
    (fn: () => void) => {
      const offs = stores.map((s) => s.subscribe(fn));
      return () => offs.forEach((o) => o());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const snapshot = () => stores.reduce((n, s) => n + s.version(), 0);
  const version = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<StoreResource<T>, "reload">>({
    data: undefined,
    loading: true,
    error: null,
    notConnected: false,
  });

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(load)
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null, notConnected: false });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setState({
          data: undefined,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          notConnected: e instanceof NotConnectedError,
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

/* ---------------- small shared helpers ---------------- */

export const nowIso = () => new Date().toISOString();

/** ISO timestamp `days` from now (negative = past) at `hour`:00. */
export function isoIn(days: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
