import { ApiError, AuthError, apiFetch } from "@eswasaone/shared-ui";
import type { CreateLeaveBody, HrExpenseClaimBody, HrLeaveSummary } from "./types";

/** Field Me (mobile E1–E5): the caller's own HR through Core. Writes are quiet; panes show the server's sentence. */

export function createLeave(body: CreateLeaveBody): Promise<HrLeaveSummary> {
  return apiFetch<HrLeaveSummary>("/hr/leave", { method: "POST", body: JSON.stringify(body), quiet: true });
}

/** Cancel your own Open request, or Approved leave that hasn't started (eswasa_hr.leave.cancel). */
export function cancelLeave(id: string, reason: string): Promise<unknown> {
  return apiFetch(`/hr/leave/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason, confirm: true }),
    quiet: true,
  });
}

/** Send a claim to your named expense approver; it's decided in Approvals. */
export function submitClaim(body: HrExpenseClaimBody): Promise<{ name?: string; approver?: string; message?: string }> {
  return apiFetch("/hr/me/expense-claims", { method: "POST", body: JSON.stringify(body), quiet: true });
}

/** One plain sentence for a failed call; an outage never reads as success. */
export function errorText(err: unknown, fallback = "That didn't work. Nothing was saved."): string {
  if (err instanceof AuthError) return err.authRequired ? "Your session ended. Sign in again, then retry." : err.message || fallback;
  if (err instanceof ApiError && err.status >= 502 && err.status <= 504) return "HR can't be reached right now. Nothing was saved.";
  if (err instanceof TypeError) return "You're offline or HR can't be reached. Nothing was saved.";
  return err instanceof Error && err.message ? err.message : fallback;
}
