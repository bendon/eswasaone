/** Mirror Core `has_staff_role` / STAFF_ROLES — names from Frappe Role fixtures only. */

import type { InstitutionRouteId } from "./nav";
import {
  hasStaffRole as sharedHasStaffRole,
  STAFF_ROLES as SHARED_STAFF,
} from "@eswasaone/shared-ui";

/** Canonical staff roles (fixtures + ERPNext/HRMS/CRM native). No aliases. */
export const STAFF_ROLES = SHARED_STAFF;

const ANY_STAFF = "any_staff" as const;
type Access = typeof ANY_STAFF | readonly string[];

const ROUTE_ACCESS: Record<InstitutionRouteId, Access> = {
  dashboard: ANY_STAFF,
  approvals: ANY_STAFF,
  board: [
    "Eswasa Board Secretary",
    "Eswasa Board Member",
    "Eswasa Risk Officer",
    "System Manager",
    "Administrator",
    "Desk User",
  ],
  crm: ["Sales User", "Sales Manager", "System Manager", "Administrator", "Desk User"],
  certification: [
    "Certification Manager",
    "Certification Officer",
    "Certification Auditor",
    "System Manager",
    "Administrator",
    "Desk User",
  ],
  standards: [
    "Eswasa Standards Manager",
    "Eswasa Standards Officer",
    "Eswasa TC Member",
    "System Manager",
    "Administrator",
    "Desk User",
  ],
  metrology: [
    "Eswasa Metrology Manager",
    "Eswasa Metrology Officer",
    "Eswasa Metrology Reviewer",
    "System Manager",
    "Administrator",
    "Desk User",
  ],
  lms: ANY_STAFF,
  tbt: [
    "Eswasa TBT Officer",
    "Eswasa TBT Analyst",
    "Eswasa Standards Officer",
    "System Manager",
    "Administrator",
    "Desk User",
  ],
  finance: [
    "Accounts User",
    "Accounts Manager",
    "System Manager",
    "Administrator",
  ],
  // Self-service leave / appraisals apply organisation-wide; Frappe still
  // enforces Employee / HR DocPerms on the data itself.
  hr: ANY_STAFF,
  marketing: ["Sales User", "Sales Manager", "System Manager", "Administrator", "Desk User"],
  reports: ANY_STAFF,
  admin: ["System Manager", "Administrator"],
};

/** Prefer directorate / job roles over base passport (Desk User, ESWASA Staff). */
const ROLE_PRIORITY = [
  "System Manager",
  "Administrator",
  "HR Manager",
  "HR User",
  "Accounts Manager",
  "Accounts User",
  "Sales Manager",
  "Sales User",
  "Certification Manager",
  "Certification Officer",
  "Certification Auditor",
  "Eswasa Standards Manager",
  "Eswasa Standards Officer",
  "Eswasa Metrology Manager",
  "Eswasa Metrology Officer",
  "Eswasa Board Secretary",
  "Eswasa Board Member",
  "Eswasa TBT Officer",
  "Eswasa TBT Analyst",
  "Eswasa Risk Officer",
  "Eswasa Estore Manager",
  "Eswasa Estore Clerk",
  "Eswasa Verification Officer",
  "Ingest Curator",
  "Ingest Viewer",
  "Leave Approver",
  "ESWASA Staff",
  "Desk User",
] as const;

export function primaryStaffLabel(roles: string[] | null | undefined): string {
  const set = new Set(roles ?? []);
  for (const r of ROLE_PRIORITY) {
    if (set.has(r)) return r;
  }
  const staffHit = [...set].find((r) => STAFF_ROLES.has(r));
  return staffHit || "Staff";
}

export function hasStaffRole(roles: string[] | null | undefined): boolean {
  return sharedHasStaffRole(roles);
}

/** Full System status panel — System Manager / Administrator only. */
export function canViewSystemStatus(roles: string[] | null | undefined): boolean {
  const set = new Set(roles ?? []);
  return set.has("System Manager") || set.has("Administrator");
}

export function canAccessRoute(
  roles: string[] | null | undefined,
  routeId: InstitutionRouteId,
): boolean {
  if (!hasStaffRole(roles)) return false;
  const set = new Set(roles ?? []);
  if (set.has("System Manager") || set.has("Administrator")) return true;
  const need = ROUTE_ACCESS[routeId];
  if (need === ANY_STAFF) return true;
  return need.some((r) => set.has(r));
}
