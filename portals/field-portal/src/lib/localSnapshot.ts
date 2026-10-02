/**
 * Last-known-good snapshots for Field PWA (localStorage).
 * Survives tab remounts; complements Workbox NetworkFirst for GETs.
 */

const PREFIX = "eswasaone.field.snap.v1:";

export type SnapshotMeta = {
  savedAt: string;
  path: string;
};

type Envelope<T> = {
  meta: SnapshotMeta;
  data: T;
};

function fullKey(path: string): string {
  return `${PREFIX}${path}`;
}

export function readSnapshot<T>(path: string): { data: T; meta: SnapshotMeta } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(fullKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
    return { data: parsed.data, meta: parsed.meta };
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(path: string, data: T): void {
  if (typeof localStorage === "undefined") return;
  try {
    const envelope: Envelope<T> = {
      meta: { savedAt: new Date().toISOString(), path },
      data,
    };
    localStorage.setItem(fullKey(path), JSON.stringify(envelope));
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearSnapshot(path: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(fullKey(path));
  } catch {
    /* ignore */
  }
}

/** Clear all Field snapshots (e.g. on sign-out). */
export function clearAllSnapshots(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function isProbablyOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
