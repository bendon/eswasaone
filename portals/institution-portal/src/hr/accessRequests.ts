/**
 * Module access requests (staff → HR / System Manager). Live: GET/POST /hr/access-requests and
 * PATCH /hr/access-requests/{id} (rules in eswasa_hr.access_requests; the same review is an Approvals card).
 */

import { apiFetch } from "@eswasaone/shared-ui";
import type { InstitutionRouteId } from "../nav";
import { hrSend } from "./api";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type ModuleAccessRequest = {
  id: string;
  moduleId: InstitutionRouteId | string;
  moduleLabel: string;
  requesterUsername: string;
  requesterName: string;
  requesterEmail: string;
  note: string;
  status: AccessRequestStatus;
  createdAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  rolesGranted?: string;
};

/** Reviewers get every request; anyone else gets their own. */
export function listAccessRequests(filter: { status?: AccessRequestStatus; module?: string } = {}): Promise<ModuleAccessRequest[]> {
  const q = new URLSearchParams();
  if (filter.status) q.set("status", filter.status);
  if (filter.module) q.set("module", filter.module);
  const qs = q.toString();
  return apiFetch<ModuleAccessRequest[]>(`/hr/access-requests${qs ? `?${qs}` : ""}`, { quiet: true });
}

export async function listPendingAccessRequests(): Promise<ModuleAccessRequest[]> {
  return listAccessRequests({ status: "pending" });
}

export async function findPendingForUserModule(username: string, moduleId: InstitutionRouteId): Promise<ModuleAccessRequest | undefined> {
  const rows = await listAccessRequests({ status: "pending", module: moduleId });
  return rows.find((r) => r.requesterUsername === username);
}

/** The requester is the session user; a pending request for the same module comes back instead of a new one. */
export function submitAccessRequest(input: { moduleId: InstitutionRouteId; moduleLabel: string; note?: string }): Promise<ModuleAccessRequest> {
  return hrSend<ModuleAccessRequest>("/hr/access-requests", {
    moduleId: input.moduleId,
    moduleLabel: input.moduleLabel,
    note: (input.note || "").trim() || undefined,
  });
}

/** Approve grants the module's role; reject needs a note the requester sees. Four-eyes is enforced server-side. */
export function reviewAccessRequest(id: string, decision: "approved" | "rejected", reviewNote?: string): Promise<ModuleAccessRequest> {
  return hrSend<ModuleAccessRequest>(
    `/hr/access-requests/${encodeURIComponent(id)}`,
    { decision, reviewNote: (reviewNote || "").trim() || undefined },
    "PATCH",
  );
}

/** Who sees the review screen (mirrors access_requests.REVIEWER_ROLES; the server decides). */
export function canReviewAccessRequests(roles: string[] | null | undefined): boolean {
  const set = new Set(roles ?? []);
  return set.has("System Manager") || set.has("Administrator") || set.has("HR Manager") || set.has("HR User");
}
