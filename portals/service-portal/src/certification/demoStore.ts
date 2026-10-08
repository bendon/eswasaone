/**
 * Local fallback store for certification endpoints that Core does not expose yet.
 * Persisted in localStorage so a demo journey survives reloads.
 * TODO: wire real. Every write here has a matching endpoint in the backend handover list.
 */
import { demoDataEnabled } from "@eswasaone/shared-ui";

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

/* ---------------- Connection honesty ---------------- */

/**
 * Demo mode (on unless VITE_DEMO_MODE=false) seeds sample cases and keeps writes on this
 * device. Outside demo mode nothing is shown as "sent to ESWASA" unless Core
 * accepted it: missing endpoints raise NotConnectedError instead.
 */
export function demoMode(): boolean {
  return demoDataEnabled();
}

export class NotConnectedError extends Error {
  constructor(what: string) {
    super(`${what} can't be sent to ESWASA online yet.`);
    this.name = "NotConnectedError";
  }
}

/** Address published on ingelo.php for certification submissions. */
export const CERT_EMAIL = "certification@eswasa.co.sz";

export function mailtoCert(subject: string, body: string): string {
  const trimmed = body.length > 1800 ? `${body.slice(0, 1800)}\n…` : body;
  return `mailto:${CERT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(trimmed)}`;
}
