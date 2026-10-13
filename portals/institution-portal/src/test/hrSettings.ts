import type { HrSettings } from "../api/types";

/** GET /hr/settings as a test site returns it (eswasa_hr.settings fallbacks). */
export const HR_SETTINGS: HrSettings = {
  leave_sla_days: 2,
  expense_sla_days: 3,
  decision_sla_days: 3,
  head_sla_days: 5,
  interview_feedback_days: 1,
  offer_reply_days: 5,
  contract_notice_days: 60,
  probation_notice_days: 30,
  expiry_alert_days: [60, 30, 7],
  thin_cover: 1,
  declaration_handoff_days: 10,
  movement_days: 90,
  turnover_days: 365,
  cycle_warn_days: 14,
  appraisal_reminder_days: [10, 3],
  calendar_max_days: 62,
  rating_max: 5,
  hr_email: "info@swasa.co.sz",
  currency: "SZL",
  working_week: [1, 2, 3, 4, 5],
  lists: {
    evidence_types: ["Training Result", "Witnessed audit", "Proficiency test", "File", "Other"],
    external_roles: ["Contract auditor", "Technical expert", "TC expert"],
    document_types: ["ID", "Contract", "Qualification", "Other"],
    evidence_sections: ["authorisations", "monitoring", "declarations", "training"],
    separation_reasons: ["Resignation", "End of fixed-term contract", "Retirement", "Dismissal", "Death in service", "Other"],
    contract_changes: ["Renew", "Make permanent"],
    establishment_changes: ["Add", "Remove", "Freeze", "Unfreeze", "Regrade"],
    council_changes: ["Add", "Regrade"],
    invite_roles: ["Accounts User", "Desk User", "ESWASA Staff", "Employee", "HR User"],
    invite_default_roles: ["ESWASA Staff", "Desk User", "Employee", "Employee Self Service"],
    case_stages: {
      grievance: ["Open", "Investigated", "Resolved"],
      disciplinary: ["Opened", "Investigation", "Hearing scheduled", "Outcome issued", "Appeal", "Closed"],
    },
    case_closed: { grievance: ["Cancelled", "Invalid", "Resolved"], disciplinary: ["Closed"] },
  },
};

/** A fetch answer for /hr/settings, or null for any other URL (tests chain it first in their stubs). */
export function settingsResponse(url: string): Response | null {
  return url.includes("/hr/settings")
    ? new Response(JSON.stringify(HR_SETTINGS), { status: 200, headers: { "Content-Type": "application/json" } })
    : null;
}
