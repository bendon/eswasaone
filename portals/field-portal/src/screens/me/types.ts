/** Contract schemas for Field Me (leave / slips / expense claims / record). */
import type { components } from "@contracts";

export type HrLeaveSummary = components["schemas"]["HrLeaveSummary"];
export type HrLeaveBalance = components["schemas"]["HrLeaveBalance"];
export type HrPayslip = components["schemas"]["HrPayslip"];
export type HrMe = components["schemas"]["HrMe"];
export type HrEmployeeRecord = components["schemas"]["HrEmployeeRecord"];
export type HrExpenseClaim = components["schemas"]["HrExpenseClaim"];
export type HrExpenseClaims = components["schemas"]["HrExpenseClaims"];
export type HrExpenseOptions = components["schemas"]["HrExpenseOptions"];
export type HrExpenseClaimBody = components["schemas"]["HrExpenseClaimBody"];

export type HrSlipsResponse = { items: HrPayslip[] };

export type CreateLeaveBody = {
  leave_type: string;
  from_date: string;
  to_date: string;
  reason?: string;
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
