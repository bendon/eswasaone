/** Contract schemas for Field Me ESS (leave / slips / expenses / employee). */
import type { components } from "@contracts";

export type HrLeaveSummary = components["schemas"]["HrLeaveSummary"];
export type HrLeaveBalance = components["schemas"]["HrLeaveBalance"];
export type HrPayslip = components["schemas"]["HrPayslip"];
export type HrExpense = components["schemas"]["HrExpense"];
export type HrEmployeeSummary = components["schemas"]["HrEmployeeSummary"];

export type HrLeaveResponse = { items: HrLeaveSummary[] };
export type HrLeaveBalancesResponse = { items: HrLeaveBalance[] };
export type HrSlipsResponse = { items: HrPayslip[] };
export type HrEmployeesResponse = { items: HrEmployeeSummary[] };

export type CreateLeaveBody = {
  leave_type: string;
  from_date: string;
  to_date: string;
  reason?: string;
  confirm: boolean;
};

export type CreateExpenseBody = {
  amount: number;
  expense_type: string;
  description?: string;
  confirm: boolean;
};

export const ME_TABS = ["leave", "pay", "claims", "profile"] as const;
export type MeTab = (typeof ME_TABS)[number];

export const ME_TAB_LABELS: Record<MeTab, string> = {
  leave: "Leave",
  pay: "Payslips",
  claims: "Claims",
  profile: "Profile",
};
