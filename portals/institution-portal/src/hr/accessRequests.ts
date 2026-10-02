/**
 * Module access requests (staff → supervisor / HoD / HR).
 * // TODO: wire real — POST /hr/access-requests once Orchestrator adds the contract.
 */

import type { InstitutionRouteId } from "../nav";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type ModuleAccessRequest = {
  id: string;
  moduleId: InstitutionRouteId;
  moduleLabel: string;
  requesterUsername: string;
  requesterName: string;
  requesterEmail: string;
  note: string;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
};

const STORAGE_KEY = "eswasaone.module-access-requests";

function readAll(): ModuleAccessRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ModuleAccessRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: ModuleAccessRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listAccessRequests(): ModuleAccessRequest[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listPendingAccessRequests(): ModuleAccessRequest[] {
  return listAccessRequests().filter((r) => r.status === "pending");
}

export function findPendingForUserModule(
  username: string,
  moduleId: InstitutionRouteId,
): ModuleAccessRequest | undefined {
  return listAccessRequests().find(
    (r) =>
      r.status === "pending" &&
      r.requesterUsername === username &&
      r.moduleId === moduleId,
  );
}

export function submitAccessRequest(input: {
  moduleId: InstitutionRouteId;
  moduleLabel: string;
  requesterUsername: string;
  requesterName: string;
  requesterEmail: string;
  note?: string;
}): ModuleAccessRequest {
  const existing = findPendingForUserModule(input.requesterUsername, input.moduleId);
  if (existing) return existing;

  const next: ModuleAccessRequest = {
    id: `MAR-${Date.now().toString(36).toUpperCase()}`,
    moduleId: input.moduleId,
    moduleLabel: input.moduleLabel,
    requesterUsername: input.requesterUsername,
    requesterName: input.requesterName || input.requesterUsername,
    requesterEmail: input.requesterEmail || "",
    note: (input.note || "").trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  all.unshift(next);
  writeAll(all);
  return next;
}

export function reviewAccessRequest(
  id: string,
  decision: "approved" | "rejected",
  reviewerUsername: string,
  reviewNote?: string,
): ModuleAccessRequest | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const cur = all[idx];
  if (cur.status !== "pending") return cur;
  const updated: ModuleAccessRequest = {
    ...cur,
    status: decision,
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewerUsername,
    reviewNote: (reviewNote || "").trim() || undefined,
  };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/** HR managers / System Managers review access requests. */
export function canReviewAccessRequests(roles: string[] | null | undefined): boolean {
  const set = new Set(roles ?? []);
  return (
    set.has("System Manager") ||
    set.has("Administrator") ||
    set.has("HR Manager") ||
    set.has("HR User")
  );
}
