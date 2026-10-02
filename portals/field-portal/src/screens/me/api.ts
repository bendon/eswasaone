import { apiFetch } from "@eswasaone/shared-ui";
import type {
  CreateExpenseBody,
  CreateLeaveBody,
  HrEmployeeSummary,
  HrEmployeesResponse,
  HrExpense,
  HrLeaveBalancesResponse,
  HrLeaveResponse,
  HrLeaveSummary,
  HrSlipsResponse,
} from "./types";

/** Field Me ESS — Core HR paths via shared session credentials. */

export function listLeave(limit = 20): Promise<HrLeaveResponse> {
  return apiFetch<HrLeaveResponse>(`/hr/leave?limit=${limit}`);
}

export function listLeaveBalances(): Promise<HrLeaveBalancesResponse> {
  return apiFetch<HrLeaveBalancesResponse>("/hr/leave/balances");
}

export function createLeave(body: CreateLeaveBody): Promise<HrLeaveSummary> {
  return apiFetch<HrLeaveSummary>("/hr/leave", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listSlips(limit = 12): Promise<HrSlipsResponse> {
  return apiFetch<HrSlipsResponse>(`/hr/slips?limit=${limit}`);
}

export function createExpense(body: CreateExpenseBody): Promise<HrExpense> {
  return apiFetch<HrExpense>("/hr/expenses", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listEmployees(limit = 100): Promise<HrEmployeesResponse> {
  return apiFetch<HrEmployeesResponse>(`/hr/employees?limit=${limit}`);
}

export function getEmployee(id: string): Promise<HrEmployeeSummary> {
  return apiFetch<HrEmployeeSummary>(`/hr/employees/${encodeURIComponent(id)}`);
}

/** Match session user to an Employee row (user_id or email). */
export function findMyEmployee(
  items: HrEmployeeSummary[],
  username: string,
  email?: string | null,
): HrEmployeeSummary | null {
  const u = username.toLowerCase();
  const e = (email || "").toLowerCase();
  return (
    items.find((row) => (row.user_id || "").toLowerCase() === u) ||
    items.find((row) => (row.email || "").toLowerCase() === e) ||
    null
  );
}
