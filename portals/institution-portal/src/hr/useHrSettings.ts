import { useApiResource } from "../hooks/useApiResource";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrSettings } from "../api/types";

/**
 * HR rules and limits (SLAs, alert windows, rating scale, upload limit, currency, contact, choice lists) from
 * GET /hr/settings. Null until loaded or when it can't be read: screens then leave the value out rather than
 * type one in.
 */
export function useHrSettings(): HrSettings | null {
  const { user, sessionKey } = useInstitution();
  // Quiet: a missing settings route (backend not deployed yet) must not pop up "Not found" on every HR screen.
  return useApiResource<HrSettings>("/hr/settings", { enabled: Boolean(user), refreshKey: sessionKey, quiet: true }).data;
}

/** "SZL 1,234.50" in the company currency; the plain number when no currency is known. */
export function money(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}
