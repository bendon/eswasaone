/** Frappe base roles every user inherits — never the primary display label. */
const BASE_ROLES = new Set(["All", "Guest", "Desk User"]);

/**
 * Pick a human-facing role for the nav chip / dock.
 * Frappe's User.roles child table usually lists Guest/All first, so
 * `roles[0]` wrongly shows "Guest" for staff and citizens alike.
 */
export function primaryRoleLabel(
  roles: string[] | null | undefined,
  fallback = "Citizen",
): string {
  if (!roles?.length) return fallback;
  return roles.find((r) => r && !BASE_ROLES.has(r)) || roles[0] || fallback;
}
