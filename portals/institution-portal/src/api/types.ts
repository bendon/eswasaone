/** Contract schemas for Institution rail endpoints (shared-ui types lag A1 expansions). */
import type { components } from "@contracts";

export type ApprovalItem = components["schemas"]["ApprovalItem"];
export type ApprovalsResponse = {
  items: ApprovalItem[];
  pending_count: number;
};

export type CertificationApplication = components["schemas"]["CertificationApplication"];
export type AuditSummary = components["schemas"]["AuditSummary"];
export type StandardSummary = components["schemas"]["StandardSummary"];
export type MetrologyJobSummary = components["schemas"]["MetrologyJobSummary"];
export type TbtNotificationSummary = components["schemas"]["TbtNotificationSummary"];
export type TbtNotificationsResponse = {
  items: TbtNotificationSummary[];
  new_count: number;
};
export type FinanceDashboard = components["schemas"]["FinanceDashboard"];
export type FinanceInvoiceSummary = components["schemas"]["FinanceInvoiceSummary"];
export type FinanceInvoicesResponse = { items: FinanceInvoiceSummary[] };

export type HrSummary = components["schemas"]["HrSummary"];
export type HrEmployeeSummary = components["schemas"]["HrEmployeeSummary"];
export type HrLeaveSummary = components["schemas"]["HrLeaveSummary"];
export type HrAppraisalSummary = components["schemas"]["HrAppraisalSummary"];
export type HrEmployeesResponse = { items: HrEmployeeSummary[] };
export type HrLeaveResponse = { items: HrLeaveSummary[] };

/*
 * HR types come from the generated contracts/types.ts where the generated shape fits the screens.
 * The hand-written ones that remain are aliases the screens rely on: unions narrower than the
 * contract's string (HrStage, HrAuthorisationStatus, HrSetupStepState), nested rows the contract
 * declares inline (HrPipeline, HrApplicantDetail, HrEstablishment, HrLiveOverview, HrBoardPack,
 * HrCompetenceMatrix, HrPerfDefaults, HrSetupStatus, HrTeamCalendar), rows the screens build
 * themselves (HrOnboardingActivity) and response wrappers with no schema of their own.
 */
export type HrPersonRef = components["schemas"]["HrPersonRef"];
export type HrLeaveBalanceRow = { leave_type: string; allocated: number; used: number; balance: number };
export type HrMe = components["schemas"]["HrMe"];
export type HrWorkConflict = components["schemas"]["HrWorkConflict"];
export type HrDeclarationInterest = components["schemas"]["HrDeclarationInterest"];
export type HrMyDeclaration = components["schemas"]["HrMyDeclaration"];
export type HrDeclarationRegister = components["schemas"]["HrDeclarationRegister"];
export type HrAuthorisationStatus = "In training" | "Current" | "Expiring" | "Expired" | "Withdrawn";
export type HrAuthorisationRow = components["schemas"]["HrAuthorisationRow"];
export type HrAuthorisationEvidence = components["schemas"]["HrAuthorisationEvidence"];
export type HrAuthorisationDetail = HrAuthorisationRow & {
  kind?: string | null;
  scheme?: string | null;
  approver?: string | null;
  decides?: string | null;
  person_type?: string | null;
  evidence: HrAuthorisationEvidence[];
};
export type HrCompetenceMatrix = {
  skills: Array<{ name: string; kind?: string | null; scheme?: string | null; validity_months?: number | null; holders: number; expiring: number }>;
  people: Array<{
    employee: string;
    employee_name?: string | null;
    cells: Record<string, { id: string; status: HrAuthorisationStatus; valid_to?: string | null }>;
  }>;
};
export type HrRemindResult = components["schemas"]["HrRemindResult"];
export type HrStage = "Applied" | "Shortlist" | "Interview" | "Offer" | "Hired" | "Not taken forward";
export type HrPipeline = {
  opening: { name: string; job_title?: string; designation?: string; department?: string; closes_on?: string | null; status?: string };
  applicants: Array<{ id: string; applicant_name: string; status: string; applied_on?: string | null; source?: string | null; stage: HrStage; interview_status?: string | null; offer_state?: string | null }>;
};
export type HrApplicantInterview = components["schemas"]["HrApplicantInterview"];
export type HrApplicantDetail = {
  id: string;
  applicant_name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  cover_letter?: string | null;
  has_cv: boolean;
  source?: string | null;
  applied_on?: string | null;
  opening?: { name: string; job_title?: string; designation?: string; department?: string } | null;
  interviews: HrApplicantInterview[];
  offer?: { name: string; status?: string | null; docstatus: number; offer_date?: string | null; designation?: string | null; employee?: string | null; state: string } | null;
  stage: HrStage;
};
export type HrMyInterview = components["schemas"]["HrMyInterview"];
export type HrOnboardingActivity = { activity_name: string; user?: string | null; user_name?: string | null; group?: string | null; task?: string | null; status?: string | null; mine?: boolean };
export type HrOnboarding = components["schemas"]["HrOnboarding"];
export type HrOnboardingDefaults = components["schemas"]["HrOnboardingDefaults"];
export type HrTeamMember = components["schemas"]["HrTeamMember"];
export type HrTeam = components["schemas"]["HrTeam"];
export type HrTeamMemberDetail = HrTeamMember & {
  line_manager?: string | null;
  scheduled_confirmation_date?: string | null;
  balances: HrLeaveBalanceRow[];
  authorisations: HrAuthorisationRow[];
};
export type HrTeamCalendar = {
  from_date: string;
  to_date: string;
  people: Array<{ employee: string; employee_name: string }>;
  entries: Array<{ employee: string; kind: "leave" | "field"; label: string; from_date: string; to_date: string; approved: boolean }>;
};
export type HrChanges = components["schemas"]["HrChanges"];
export type HrPerfCounts = { people: number; objectives_set: number; self_done: number; manager_done: number };
export type HrPerfCycle = components["schemas"]["HrPerfCycle"];
export type HrPerfStep = "self" | "manager" | "done";
export type HrPerfPerson = components["schemas"]["HrPerfPerson"];
export type HrPerfCycleDetail = components["schemas"]["HrPerfCycleDetail"];
export type HrPerfDefaults = {
  templates: Array<{ name: string; title: string; criteria: string[]; kras: string[] }>;
  departments: Array<{ name: string; people: number }>;
  reminder_days: number[];
};
export type HrAppraisal = {
  id: string;
  cycle: string;
  cycle_name: string;
  start_date?: string | null;
  end_date?: string | null;
  cycle_status?: string | null;
  employee: string;
  employee_name: string;
  department?: string | null;
  designation?: string | null;
  manager?: string | null;
  manager_name?: string | null;
  kras: string[];
  goals: Array<{ id: string; goal_name: string; kra?: string | null; strategic_goal?: string | null; progress: number; status?: string | null }>;
  criteria: Array<{ criteria: string; weight: number; self?: number | null; manager?: number | null }>;
  reflections?: string | null;
  manager_feedback?: string | null;
  self_done: boolean;
  manager_done: boolean;
  step: HrPerfStep;
  can_self: boolean;
  can_review: boolean;
  can_add_goals: boolean;
};
export type HrCaseKind = "grievance" | "disciplinary";
export type HrCaseOwner = components["schemas"]["HrCaseOwner"];
export type HrCaseRow = components["schemas"]["HrCaseRow"];
export type HrCaseRegister = components["schemas"]["HrCaseRegister"];
export type HrCase = {
  id: string;
  kind: HrCaseKind;
  stage: string;
  stages: string[];
  next: string[];
  opened_on?: string | null;
  owner?: string | null;
  owner_name?: string | null;
  people: Array<{ employee: string; employee_name?: string | null; role: string }>;
  description?: string | null;
  next_step?: string | null;
  next_step_due?: string | null;
  outcome?: string | null;
  decided_by?: string | null;
  decided_by_name?: string | null;
  appeal_owner_name?: string | null;
  talk_first: boolean;
  notes: Array<{ text: string; by?: string | null; on?: string | null }>;
  owners: HrCaseOwner[];
  // HR additions plan 01 (disciplinary only)
  offence?: string | null;
  offence_title?: string | null;
  sanction?: string | null;
  outcome_on?: string | null;
  warning_expires_on?: string | null;
  warning_status?: HrWarningStatus | null;
  appeal_result?: string | null;
  warning_letter?: string | null; // HR additions plan 03: the HR Letter carrying the warning
  sanctions?: string[];
  appeal_results?: string[];
  offences?: HrOffence[];
  /** Months each warning stays active; null while awaiting ESWASA (A1). */
  warning_months?: Record<string, number | null>;
};
export type HrWarningStatus = "Active" | "Expired" | "Withdrawn";
export type HrOffence = {
  code: string;
  title?: string | null;
  category?: string | null;
  level?: string | null;
  suggested_sanction?: string | null;
  description?: string | null;
  active: boolean;
};
export type HrOffenceList = {
  items: HrOffence[];
  can_edit: boolean;
  levels: string[];
  sanctions: string[];
  warning_months: Record<string, number | null>;
};
export type HrWarning = {
  case: string;
  sanction?: string | null;
  offence?: string | null;
  offence_title?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  status?: HrWarningStatus | null;
};
export type HrWarnings = { employee: string; items: HrWarning[]; active: number; active_until?: string | null };
export type HrMyConcerns = components["schemas"]["HrMyConcerns"];
export type HrContractDefaults = components["schemas"]["HrContractDefaults"];
export type HrEstCounts = components["schemas"]["HrEstCounts"];
export type HrEstPost = HrEstCounts & { designation: string; grade?: string | null };
export type HrEstHead = components["schemas"]["HrEstHead"];
export type HrEstChangeKind = "Add" | "Remove" | "Freeze" | "Unfreeze" | "Regrade";
export type HrEstChange = components["schemas"]["HrEstChange"];
export type HrEstablishment = {
  departments: Array<HrEstCounts & { department: string; head?: HrEstHead | null; posts: HrEstPost[]; unplanned: number }>;
  totals: HrEstCounts;
  has_plans: boolean;
  pending: HrEstChange[];
  can_request: boolean;
};
export type HrEstDepartment = components["schemas"]["HrEstDepartment"];
export type HrTrackStep = components["schemas"]["HrTrackStep"];
export type HrEstChangeDetail = HrEstChange & {
  reason?: string | null;
  cost_note?: string | null;
  current_grade?: string | null;
  before: { approved: number; frozen: number };
  prepared_by?: string | null;
  ed_decision_by?: string | null;
  council_reference?: string | null;
  decision_note?: string | null;
  deciders: Array<{ user: string; name: string }>;
  track: HrTrackStep[];
};
export type HrSensitive = components["schemas"]["HrSensitive"] & { tables?: HrSensitiveTable[] };
export type HrAccessLog = components["schemas"]["HrAccessLog"];
export type HrAttentionItem = components["schemas"]["HrAttentionItem"];
export type HrTurnover = components["schemas"]["HrTurnover"];
export type HrCycleStatus = components["schemas"]["HrCycleStatus"];
export type HrLiveOverview = {
  as_of: string;
  headcount: number;
  departments: number;
  establishment: { has_plans: boolean; totals?: HrEstCounts | null; departments: Array<{ department: string; approved: number; filled: number; vacant: number; frozen: number }> };
  attention: HrAttentionItem[];
  away_today: Array<{ employee?: string | null; employee_name?: string | null; leave_type?: string | null; back_on?: string | null }>;
  movements: { joiners: number; leavers: number };
  /** Day windows behind movements, turnover and ending soon (HR Settings). */
  windows?: { movement_days?: number; turnover_days?: number; contract_notice_days?: number; probation_notice_days?: number };
  turnover: HrTurnover;
  ending_soon: { contracts?: number; probations?: number };
  record_quality: Array<{ field: string; label: string; count: number }>;
  record_checked_on?: string | null;
  cycles: HrCycleStatus[];
  /** Additions plan 08: this month's and next month's service milestones; years empty = awaiting ESWASA (A8). */
  milestones?: HrServiceMilestone[];
  milestone_years?: number[];
};
export type HrSetupStepState = "done" | "partial" | "todo" | "awaiting" | "excluded";
export type HrSetupStatus = {
  steps: Array<{ id: string; title: string; state: HrSetupStepState; detail: string; href?: string | null; awaiting?: string | null; desk: boolean }>;
  done: number;
  total: number;
  pct: number;
};
export type HrBoardPack = {
  as_of: string;
  headcount: number;
  establishment?: HrEstCounts | null;
  turnover: HrTurnover;
  appraisals?: HrCycleStatus | null;
  competence?: { catalogue?: number; at_risk?: number } | null;
  cases?: Array<{ kind: string; open: number; closed_this_year: number; avg_days_to_close?: number | null }> | null;
  declarations?: { signed?: number; total?: number; year?: string | number } | null;
  establishment_changes: Array<{ summary: string; department: string; state: string; council_required: boolean }>;
};
export type HrSeparationDefaults = components["schemas"]["HrSeparationDefaults"];
export type HrPickItem = { id: string; name?: string | null; title?: string | null; employee_name?: string | null };
export type HrVacancy = components["schemas"]["HrVacancy"];
export type HrRequisition = components["schemas"]["HrRequisition"];
export type HrLeavePreview = components["schemas"]["HrLeavePreview"] & { certificate_required?: boolean; certificate_after_days?: number | null };
export type HrAppraisalsResponse = { items: HrAppraisalSummary[] };

/** Org-first HR structure schemas */
export type HrOrganisation = components["schemas"]["HrOrganisation"];
export type HrOrganisationPatch = components["schemas"]["HrOrganisationPatch"];
export type HrOrganisationCreate = components["schemas"]["HrOrganisationCreate"];
export type HrOrganisationOverview = components["schemas"]["HrOrganisationOverview"];
export type FinanceSettings = components["schemas"]["FinanceSettings"];
export type FinanceSetupStep = components["schemas"]["FinanceSetupStep"];
export type HrSetupProgress = components["schemas"]["HrSetupProgress"];
export type HrOrganisationCounts = components["schemas"]["HrOrganisationCounts"];
export type HrPayrollReadiness = components["schemas"]["HrPayrollReadiness"];
export type HrDepartment = components["schemas"]["HrDepartment"];
export type HrDepartmentCreate = components["schemas"]["HrDepartmentCreate"];
export type HrDesignation = components["schemas"]["HrDesignation"];
export type HrDesignationCreate = components["schemas"]["HrDesignationCreate"];
export type HrGradeBand = components["schemas"]["HrGradeBand"];
export type HrGradeBandCreate = components["schemas"]["HrGradeBandCreate"];
export type HrLocation = components["schemas"]["HrLocation"];
export type HrLocationCreate = components["schemas"]["HrLocationCreate"];
export type HrCostCentre = components["schemas"]["HrCostCentre"];
export type HrCostCentreCreate = components["schemas"]["HrCostCentreCreate"];
export type HrDepartmentsResponse = { items: HrDepartment[] };
export type HrDesignationsResponse = { items: HrDesignation[] };
export type HrGradeBandsResponse = { items: HrGradeBand[] };
export type HrLocationsResponse = { items: HrLocation[] };
export type HrCostCentresResponse = { items: HrCostCentre[] };

export type BoardPackSummary = components["schemas"]["BoardPackSummary"];
export type CrmPipeline = components["schemas"]["CrmPipeline"];
export type CrmLeadSummary = components["schemas"]["CrmLeadSummary"];
export type CrmDealSummary = components["schemas"]["CrmDealSummary"];
export type CrmLeadsResponse = { items: CrmLeadSummary[] };
export type CrmDealsResponse = { items: CrmDealSummary[] };

export type TrainingCourseSummary = components["schemas"]["TrainingCourseSummary"];
export type TrainingEnrolmentSummary = components["schemas"]["TrainingEnrolmentSummary"];
export type TrainingCoursesResponse = { items: TrainingCourseSummary[] };
export type TrainingEnrolmentsResponse = { items: TrainingEnrolmentSummary[] };

export type MarketingCampaignSummary = components["schemas"]["MarketingCampaignSummary"];
export type MarketingCampaignsResponse = { items: MarketingCampaignSummary[] };

export type AdminServiceStatus = components["schemas"]["AdminServiceStatus"];
export type AdminAppVersion = components["schemas"]["AdminAppVersion"];
export type AdminOverview = components["schemas"]["AdminOverview"];
export type AdminUpdatesResponse = components["schemas"]["AdminUpdatesResponse"];
export type AdminUpdateRunBody = components["schemas"]["AdminUpdateRunBody"];
export type AdminCommandResult = components["schemas"]["AdminCommandResult"];
export type AdminSystemSettings = components["schemas"]["AdminSystemSettings"];
export type AdminEmailSettings = components["schemas"]["AdminEmailSettings"];
export type AdminUserSummary = components["schemas"]["AdminUserSummary"];
export type AdminUsersResponse = {
  items: AdminUserSummary[];
  active: number;
  disabled: number;
};
export type AdminScheduledJob = components["schemas"]["AdminScheduledJob"];
export type AdminSchedulerResponse = components["schemas"]["AdminSchedulerResponse"];
export type AdminJobsSnapshot = components["schemas"]["AdminJobsSnapshot"];
export type AdminBackupSummary = components["schemas"]["AdminBackupSummary"];
export type AdminBackupPolicy = components["schemas"]["AdminBackupPolicy"];
export type AdminBackupsResponse = {
  items: AdminBackupSummary[];
  policy?: AdminBackupPolicy;
};
export type AdminLogEntry = components["schemas"]["AdminLogEntry"];
export type AdminLogsResponse = { items: AdminLogEntry[] };
export type AdminIntegrationStatus = components["schemas"]["AdminIntegrationStatus"];
export type AdminIntegrationsResponse = { items: AdminIntegrationStatus[] };

export type AdminAccessPolicy = components["schemas"]["AdminAccessPolicy"];
export type AdminAccessNetwork = components["schemas"]["AdminAccessNetwork"];
export type AdminAccessNetworkCreate = components["schemas"]["AdminAccessNetworkCreate"];
export type AdminAccessDevice = components["schemas"]["AdminAccessDevice"];
export type AdminAccessDeviceCreate = components["schemas"]["AdminAccessDeviceCreate"];
export type AdminAccessDevicePatch = components["schemas"]["AdminAccessDevicePatch"];
export type AdminAccessEvent = components["schemas"]["AdminAccessEvent"];
export type AdminAccessEvaluateResult = components["schemas"]["AdminAccessEvaluateResult"];
export type AdminAccessNetworksResponse = { items: AdminAccessNetwork[] };
export type AdminAccessDevicesResponse = { items: AdminAccessDevice[] };
export type AdminAccessEventsResponse = { items: AdminAccessEvent[] };

/* ---------- Sub-view types (contract endpoints with loose schemas) ---------- */

/** Governance (WS-I5) — Overview + Meetings + Pack + registers */
export type GovernanceOverview = components["schemas"]["GovernanceOverview"];
export type GovernanceKpis = components["schemas"]["GovernanceKpis"];
export type GovernanceCalendarItem = components["schemas"]["GovernanceCalendarItem"];
export type PackTrack = components["schemas"]["PackTrack"];
export type PackSection = components["schemas"]["PackSection"];
export type PackSectionStatus = components["schemas"]["PackSectionStatus"];
export type GovernanceMeeting = components["schemas"]["GovernanceMeeting"];
export type GovernanceMeetingCreate = components["schemas"]["GovernanceMeetingCreate"];
export type GovernanceMeetingAct = components["schemas"]["GovernanceMeetingAct"];
export type GovernancePack = components["schemas"]["GovernancePack"];
export type GovernancePackSectionsPatch = components["schemas"]["GovernancePackSectionsPatch"];
export type GovernancePackAssembleResult = components["schemas"]["GovernancePackAssembleResult"];
export type GovernanceResolution = components["schemas"]["GovernanceResolution"];
export type ResolutionAction = components["schemas"]["ResolutionAction"];
export type GovernanceRisk = components["schemas"]["GovernanceRisk"];
export type RiskBand = components["schemas"]["RiskBand"];
export type RiskTrend = components["schemas"]["RiskTrend"];
export type BoardMember = components["schemas"]["BoardMember"];
export type GovernanceBody = components["schemas"]["GovernanceBody"];
export type GovernanceDeclaration = components["schemas"]["GovernanceDeclaration"];
export type AllowedAction = components["schemas"]["AllowedAction"];

/** Aliases — Summary schemas map to full models in the contract */
export type GovernanceMeetingSummary = components["schemas"]["GovernanceMeetingSummary"];
export type GovernanceResolutionSummary = components["schemas"]["GovernanceResolutionSummary"];
export type GovernanceRiskSummary = components["schemas"]["GovernanceRiskSummary"];
export type GovernanceMeetingsResponse = { items: GovernanceMeeting[] };
export type GovernanceResolutionsResponse = { items: GovernanceResolution[] };
export type GovernanceRisksResponse = { items: GovernanceRisk[] };
export type ResolutionActionsResponse = { items: ResolutionAction[] };
export type BoardMembersResponse = { items: BoardMember[] };
export type GovernanceBodiesResponse = { items: GovernanceBody[] };
export type GovernanceDeclarationsResponse = { items: GovernanceDeclaration[] };

/** Metrology sub-view types — instruments/results are loosely typed in contract */
export type MetrologyInstrument = {
  id: string;
  name: string;
  serial?: string | null;
  status?: string;
  last_calibrated?: string | null;
  next_calibration?: string | null;
  [k: string]: unknown;
};
export type MetrologyInstrumentsResponse = { items: MetrologyInstrument[] };
export type MetrologyResult = {
  id: string;
  job?: string | null;
  instrument?: string | null;
  result?: string | null;
  status?: string;
  date?: string | null;
  [k: string]: unknown;
};
export type MetrologyResultsResponse = { items: MetrologyResult[] };
export type MetrologyJobsResponse = { items: MetrologyJobSummary[] };

/** Standards sub-view types — drafts/workitems/ballots/comments are loosely typed */
export type StandardDraft = {
  id: string;
  title: string;
  status?: string;
  stage?: string | null;
  sector?: string | null;
  updated?: string | null;
  [k: string]: unknown;
};
export type StandardDraftsResponse = { items: StandardDraft[] };
export type StandardWorkItem = {
  id: string;
  title: string;
  status?: string;
  assignee?: string | null;
  [k: string]: unknown;
};
export type StandardWorkItemsResponse = { items: StandardWorkItem[] };
export type StandardBallot = {
  id: string;
  title: string;
  status?: string;
  opens?: string | null;
  closes?: string | null;
  [k: string]: unknown;
};
export type StandardBallotsResponse = { items: StandardBallot[] };
export type StandardComment = {
  id: string;
  author?: string | null;
  body?: string;
  standard?: string | null;
  date?: string | null;
  [k: string]: unknown;
};
export type StandardCommentsResponse = { items: StandardComment[] };
export type StandardsResponse = { items: StandardSummary[] };

/** Finance sub-view types — budget/revenue are loosely typed */
export type FinanceBudgetLine = {
  id: string;
  label: string;
  budget?: number;
  actual?: number;
  variance_pct?: number;
  [k: string]: unknown;
};
export type FinanceBudgetResponse = { items: FinanceBudgetLine[] };
export type FinanceRevenueLine = {
  id: string;
  label: string;
  amount?: number;
  period?: string | null;
  [k: string]: unknown;
};
export type FinanceRevenueResponse = { items: FinanceRevenueLine[] };

/** Certification sub-view types */
export type CertificationAuditsResponse = { items: AuditSummary[] };
export type CertificationCertificates = {
  id: string;
  holder: string;
  scheme: string;
  issued: string;
  expires?: string | null;
  status?: string;
  [k: string]: unknown;
};
export type CertificationCertificatesResponse = { items: CertificationCertificates[] };

/** TBT subscription */
export type TbtSubscription = {
  id: string;
  email: string;
  countries?: string[] | null;
  sectors?: string[] | null;
  active?: boolean;
  [k: string]: unknown;
};
export type TbtSubscriptionsResponse = { items: TbtSubscription[] };

/** Analytics report types */
export type AnalyticsReportSummary = components["schemas"]["AnalyticsReportSummary"];
export type AnalyticsReportsResponse = { items: AnalyticsReportSummary[] };

/* Screen ↔ backend sweep (2026-10-12): routes that had no screen. */
export type HrLeaveRequest = components["schemas"]["HrLeaveRequest"] & { certificate_required?: boolean; has_certificate?: boolean };
export type HrLeaveRequests = components["schemas"]["HrLeaveRequests"];
export type HrLeaveCalendar = components["schemas"]["HrLeaveCalendar"];
export type HrSettings = components["schemas"]["HrSettings"];
export type HrLeavePolicy = components["schemas"]["HrLeavePolicy"];
export type HrEmployeeOptions = components["schemas"]["HrEmployeeOptions"];
export type HrExpenseOptions = components["schemas"]["HrExpenseOptions"];
export type HrExpenseClaim = components["schemas"]["HrExpenseClaim"];
export type HrExpenseClaims = components["schemas"]["HrExpenseClaims"];
export type HrEmployeeDocument = components["schemas"]["HrEmployeeDocument"];
export type HrEmployeeDocuments = components["schemas"]["HrEmployeeDocuments"];
export type HrProfileChange = components["schemas"]["HrProfileChange"];
export type HrProfileChanges = components["schemas"]["HrProfileChanges"];
export type HrEmployeeRecord = components["schemas"]["HrEmployeeRecord"];

/* HR additions plan 02: issued items and offboarding clearance (hand-written until contracts/types.ts is regenerated). */
export type HrIssuedItemStatus = "Issued" | "Acknowledged" | "Returned" | "Lost" | "Written off";
export type HrIssuedItem = {
  name: string;
  employee: string;
  employee_name?: string | null;
  department?: string | null;
  item_type: string;
  description?: string | null;
  tag?: string | null;
  asset?: string | null;
  issued_on?: string | null;
  issued_by?: string | null;
  condition_out?: string | null;
  acknowledged_on?: string | null;
  return_due?: string | null;
  returned_on?: string | null;
  received_by?: string | null;
  condition_in?: string | null;
  note?: string | null;
  status: HrIssuedItemStatus;
  overdue: boolean;
};
export type HrIssuedItemList = { items: HrIssuedItem[]; types: string[]; out: number; overdue: number };
export type HrIssuedItemTypes = { types: string[]; awaiting?: string | null };
export type HrEmployeeItems = {
  employee: string;
  employee_name?: string | null;
  items: HrIssuedItem[];
  types: string[];
  can_issue: boolean;
  can_return: boolean;
  can_write_off: boolean;
};
export type HrMyItems = { employee?: string | null; items: HrIssuedItem[]; waiting: number };
export type HrOffboardingActivity = HrOnboardingActivity & { blocked?: string | null };
export type HrOffboardingDetail = Omit<HrOnboarding, "activities"> & { activities: HrOffboardingActivity[]; items_out: HrIssuedItem[] };

/* HR additions plan 04 / plan 08 (hand-written until contracts/types.ts is regenerated). */
export type HrSensitiveTable = { label: string; columns: string[]; rows: Array<Record<string, unknown>> };
export type HrServiceMilestone = { employee: string; name?: string | null; years: number; date: string };
export type HrLeaveCertificate = { ok?: boolean; name: string; has_certificate?: boolean; message?: string | null };

/* HR additions plan 03: HR letters (hand-written until contracts/types.ts is regenerated). */
export type HrLetterStatus = "Requested" | "Issued" | "Cancelled";
export type HrLetter = {
  name: string;
  employee: string;
  employee_name?: string | null;
  letter_type: string;
  source_doctype?: string | null;
  source_name?: string | null;
  purpose?: string | null;
  addressed_to?: string | null;
  requested_by?: string | null;
  status: HrLetterStatus;
  issued_by?: string | null;
  issued_on?: string | null;
  requested_on?: string | null;
  note?: string | null;
  has_file: boolean;
};
export type HrLetterType = {
  letter_type: string;
  ready: boolean;
  reason?: string | null;
  source_doctype?: string | null;
  requested?: boolean;
  managers_only?: boolean;
  generated_here?: boolean;
};
export type HrLetterEligible = { letter_type: string; source_doctype?: string | null; source_name: string; label: string; date?: string | null; letter?: string | null };
export type HrLetterList = {
  employee: string;
  employee_name?: string | null;
  letters: HrLetter[];
  eligible: HrLetterEligible[];
  types: HrLetterType[];
  can_cancel: boolean;
};
export type HrMyLetters = { employee?: string | null; letters: HrLetter[]; can_request: boolean; ready: boolean; reason?: string | null };

// HR additions plan 05: training plan (H17), team training (T8), my training (E13). Hand-written until types.ts is regenerated.
export type HrTrainingNeedStatus = "Open" | "Planned" | "Met" | "Dropped";
export type HrTrainingNeed = {
  name: string;
  employee: string;
  employee_name?: string | null;
  department?: string | null;
  topic: string;
  skill?: string | null;
  source: string;
  source_name?: string | null;
  raised_by?: string | null;
  priority?: string | null;
  status: HrTrainingNeedStatus;
  plan?: string | null;
  plan_line?: string | null;
  event?: string | null;
  note?: string | null;
  creation?: string | null;
};
export type HrTrainingNeedList = { needs: HrTrainingNeed[]; open: number; sources?: string[]; departments?: string[] };
export type HrTrainingTotals = {
  lines: number;
  people: number;
  scheduled: number;
  estimated_direct: number;
  estimated_indirect: number;
  estimated: number;
  actual_direct: number;
  actual_indirect: number;
  actual: number;
};
export type HrTrainingPlanStatus = "Draft" | "Waiting" | "Approved" | "Sent back";
export type HrTrainingPlanLine = {
  name: string;
  idx?: number | null;
  topic: string;
  skill?: string | null;
  reason?: string | null;
  quarter?: string | null;
  people?: number | null;
  provider?: string | null;
  needs: HrTrainingNeed[];
  estimated_direct?: number | null;
  estimated_indirect?: number | null;
  event?: string | null;
  event_status?: string | null;
  start_time?: string | null;
  can_schedule: boolean;
};
export type HrTrainingPlanRow = {
  name: string;
  department: string;
  year: string;
  status: HrTrainingPlanStatus;
  prepared_by?: string | null;
  approved_by?: string | null;
  decided_on?: string | null;
  note?: string | null;
  decision_note?: string | null;
  totals: HrTrainingTotals;
};
export type HrTrainingPlan = HrTrainingPlanRow & {
  lines: HrTrainingPlanLine[];
  deciders: string[];
  can_edit: boolean;
  can_decide: boolean;
  approver_note?: string | null;
};
export type HrTrainingPlanList = {
  plans: HrTrainingPlanRow[];
  years: string[];
  departments: string[];
  can_prepare: boolean;
  waiting: number;
  approver_note?: string | null;
};
export type HrTrainingNominee = {
  name?: string | null;
  employee: string;
  employee_name?: string | null;
  department?: string | null;
  status?: string | null;
  attendance?: string | null;
  present?: boolean | null;
};
export type HrTrainingEvent = {
  name: string;
  event_name?: string | null;
  event_status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  trainer_name?: string | null;
  skill?: string | null;
  plan?: string | null;
  department?: string | null;
  direct_cost?: number | null;
  indirect_cost?: number | null;
  nominees: HrTrainingNominee[];
  team: Array<{ name: string; employee_name?: string | null }>;
  can_nominate: boolean;
  can_record: boolean;
  result_url?: string | null;
};
export type HrTrainingUpcoming = {
  name: string;
  event_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  skill?: string | null;
  nominated: string[];
};
export type HrTeamTraining = { team: Array<{ name: string; employee_name?: string | null }>; needs: HrTrainingNeed[]; events: HrTrainingUpcoming[] };
export type HrMyTrainingCourse = {
  event: string;
  event_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  event_status?: string | null;
  attendance?: string | null;
};
export type HrMyTraining = { employee?: string | null; needs: HrTrainingNeed[]; upcoming: HrMyTrainingCourse[]; history: HrMyTrainingCourse[] };
