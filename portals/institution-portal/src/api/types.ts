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
};
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
export type HrSensitive = components["schemas"]["HrSensitive"];
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
export type HrLeavePreview = components["schemas"]["HrLeavePreview"];
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
export type HrLeaveRequest = components["schemas"]["HrLeaveRequest"];
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
