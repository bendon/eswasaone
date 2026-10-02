/** Mirror Core `has_staff_role` / STAFF_ROLES — Frappe Role fixture names only. */

/** Institution / Desk staff markers (Citizen-only must not pass). */
export const STAFF_ROLES = new Set([
  "System Manager",
  "Administrator",
  "Desk User",
  "ESWASA Staff",
  "Accounts User",
  "Accounts Manager",
  "Sales User",
  "Sales Manager",
  "Purchase User",
  "Purchase Manager",
  "HR User",
  "HR Manager",
  "Certification Manager",
  "Certification Officer",
  "Certification Auditor",
  "Eswasa Metrology Manager",
  "Eswasa Metrology Officer",
  "Eswasa Metrology Reviewer",
  "Eswasa Standards Manager",
  "Eswasa Standards Officer",
  "Eswasa TC Member",
  "Eswasa Board Secretary",
  "Eswasa Board Member",
  "Eswasa Risk Officer",
  "Eswasa TBT Officer",
  "Eswasa TBT Analyst",
  "Eswasa Estore Manager",
  "Eswasa Estore Clerk",
  "Eswasa Verification Officer",
  "Ingest Curator",
  "Ingest Viewer",
]);

/**
 * Field workers + HRMS ESS — land on Field PWA after login.
 * Employee / ESS alone are not Institution desk markers (see Core CITIZEN_ONLY).
 */
export const FIELD_ESS_ROLES = new Set([
  "Employee",
  "Employee Self Service",
  "Certification Auditor",
  "Certification Officer",
]);

/** Directorate / manager roles that always prefer Institution desk over Field. */
export const DESK_ONLY_ROLES = new Set([
  "System Manager",
  "Administrator",
  "HR Manager",
  "Certification Manager",
  "Accounts Manager",
]);

/** Public path of the Institution Portal SPA (nginx → :3016). */
export const INSTITUTION_PORTAL_PATH = "/institution/";

/** Public path of the Field ESS PWA (nginx → :3017). */
export const FIELD_PORTAL_PATH = "/field/";

/** Service Portal root — citizens bounced here from Institution chrome. */
export const SERVICE_PORTAL_PATH = "/";

/**
 * True only for Institution/Desk staff markers (invite / job-profile).
 * Matches Core `has_staff_role` — public packs (Citizen, Customer, LMS) never pass.
 */
export function hasStaffRole(roles: string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => STAFF_ROLES.has(r));
}

/** True when the user holds a desk-directorate / manager role. */
export function hasDeskOnlyRole(roles: string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => DESK_ONLY_ROLES.has(r));
}

/**
 * True when the user is a field ESS audience: any FIELD_ESS role and no
 * desk-directorate heavy role (managers stay on Institution).
 */
export function hasFieldEssRole(roles: string[] | null | undefined): boolean {
  const list = roles ?? [];
  if (hasDeskOnlyRole(list)) return false;
  return list.some((r) => FIELD_ESS_ROLES.has(r));
}

/** Staff or field ESS who should leave the citizen Service Portal after login. */
function shouldLeaveServicePortal(roles: string[] | null | undefined): boolean {
  const list = roles ?? [];
  return hasStaffRole(list) || list.some((r) => FIELD_ESS_ROLES.has(r));
}

/**
 * Role-aware post-login hard-navigate (shared cookie across SPAs).
 * Returns true when a redirect was started.
 *
 * - Desk managers → `/institution/`
 * - Field ESS / auditors / officers → `/field/`
 * - Other Institution staff → `/institution/` (safe default)
 * - Citizens → no redirect
 */
export function redirectStaffAfterLogin(
  roles: string[] | null | undefined,
): boolean {
  if (typeof window === "undefined" || !shouldLeaveServicePortal(roles)) {
    return false;
  }
  const path = window.location.pathname;
  // Already on a staff SPA — do not loop
  if (path.startsWith("/field") || path.startsWith("/institution")) {
    return false;
  }
  if (hasDeskOnlyRole(roles)) {
    window.location.assign(INSTITUTION_PORTAL_PATH);
    return true;
  }
  if (hasFieldEssRole(roles)) {
    window.location.assign(FIELD_PORTAL_PATH);
    return true;
  }
  window.location.assign(INSTITUTION_PORTAL_PATH);
  return true;
}

/**
 * @deprecated Prefer {@link redirectStaffAfterLogin} — delegates for backward compat.
 * Hard-navigate staff into the correct staff SPA after login.
 */
export function redirectStaffToInstitution(
  roles: string[] | null | undefined,
): boolean {
  return redirectStaffAfterLogin(roles);
}
