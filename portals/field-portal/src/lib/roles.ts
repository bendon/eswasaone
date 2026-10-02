/** Frappe base roles every user inherits — never the primary display label. */
const BASE_ROLES = new Set(["All", "Guest", "Desk User"]);

/**
 * Pick a human-facing role for the header pill.
 * Prefer a non-base role; fall back to "Staff".
 */
export function primaryRoleLabel(
  roles: string[] | null | undefined,
  fallback = "Staff",
): string {
  if (!roles?.length) return fallback;
  return roles.find((r) => r && !BASE_ROLES.has(r)) || roles[0] || fallback;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function greetingForHour(hour = new Date().getHours()): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
