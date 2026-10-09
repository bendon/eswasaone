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
  // UI-phase roles the workflow map needs but engine/fixtures doesn't have yet (gap 01 C13).
  // TODO: fixture — add these Role fixtures in engine/fixtures and keep this list in sync.
  "Quality Manager",
  "Customer Service",
  "Customer Service Manager",
  "Eswasa Appeals Panel",
  "Technical Reviewer",
  "Scheme Manager",
  "Lab Manager",
  "Technical Manager",
  "Head of Standards",
  "TC Secretary",
  "Company Secretary",
]);

/**
 * Nearest existing fixture for each UI-phase role (gap 01 C13), used until the fixtures exist.
 * TODO: fixture — drop entries as the real roles land.
 */
export const PROVISIONAL_ROLE_MAP: Record<string, string> = {
  "Quality Manager": "Certification Manager",
  "Customer Service": "Desk User",
  "Customer Service Manager": "Sales Manager",
  "Eswasa Appeals Panel": "Certification Manager",
  "Technical Reviewer": "Certification Officer",
  "Scheme Manager": "Certification Manager",
  "Lab Manager": "Eswasa Metrology Manager",
  "Technical Manager": "Eswasa Metrology Reviewer",
  "Head of Standards": "Eswasa Standards Manager",
  "TC Secretary": "Eswasa Standards Officer",
  "Company Secretary": "Eswasa Board Secretary",
};

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
  // Bounced straight back here after a recent redirect — the staff SPA is not
  // being served on this origin. Stop instead of reloading forever.
  if (redirectedRecently()) {
    console.warn(
      "[staff-redirect] Staff portal redirect bounced back to the Service Portal; not retrying. " +
        "Check that /institution/ and /field/ are routed to their SPAs on this origin.",
    );
    return false;
  }
  const dest =
    hasDeskOnlyRole(roles) || !hasFieldEssRole(roles) ? INSTITUTION_PORTAL_PATH : FIELD_PORTAL_PATH;
  markRedirect();
  window.location.assign(dest);
  return true;
}

const REDIRECT_MARK_KEY = "eswasaone_staff_redirect_at";
const REDIRECT_LOOP_WINDOW_MS = 15_000;

function redirectedRecently(): boolean {
  try {
    const at = Number(window.sessionStorage?.getItem(REDIRECT_MARK_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < REDIRECT_LOOP_WINDOW_MS;
  } catch {
    return false;
  }
}

function markRedirect(): void {
  try {
    window.sessionStorage?.setItem(REDIRECT_MARK_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — loop guard is best-effort */
  }
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
