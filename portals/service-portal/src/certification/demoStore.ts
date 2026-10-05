/**
 * Local fallback store for certification endpoints that Core does not expose yet.
 * Persisted in localStorage so a demo journey survives reloads.
 * TODO: wire real. Every write here has a matching endpoint in the backend handover list.
 */

const KEY = "eswasaone.cert.v1";

export type StoreShape = {
  quotes: Record<string, unknown>;
  details: Record<string, unknown>;
  seeded: boolean;
};

function empty(): StoreShape {
  return { quotes: {}, details: {}, seeded: false };
}

export function readStore(): StoreShape {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function writeStore(next: StoreShape): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: demo state is session-only */
  }
}

export function updateStore(fn: (s: StoreShape) => void): StoreShape {
  const s = readStore();
  fn(s);
  writeStore(s);
  return s;
}

export function newRef(prefix: string): string {
  const n = Math.floor(Date.now() / 1000) % 100000;
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

/** Draft autosave helpers (wizard + quote form). */
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`eswasaone.draft.${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`eswasaone.draft.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(`eswasaone.draft.${key}`);
  } catch {
    /* ignore */
  }
}
