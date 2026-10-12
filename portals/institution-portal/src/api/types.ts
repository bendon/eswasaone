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
 * My HR (GET /hr/me, POST /hr/leave/preview). Declared in contracts/openapi.yaml; written by hand
 * here because contracts/types.ts can't be regenerated until the duplicate CertificationScheme
 * key in openapi.yaml is fixed. TODO: switch to components["schemas"][...] after regeneration.
 */
export type HrPersonRef = { user?: string | null; name?: string | null };
export type HrLeaveBalanceRow = { leave_type: string; allocated: number; used: number; balance: number };
export type HrMe = {
  linked: boolean;
  employee?: HrEmployeeSummary | null;
  line_manager?: string | null;
  leave_approver?: HrPersonRef | null;
  balances: HrLeaveBalanceRow[];
  leave: HrLeaveSummary[];
};
export type HrWorkConflict = { id: string; title: string; date?: string | null; kind?: string };
export type HrDeclarationInterest = {
  organisation: string;
  relationship: string;
  from_date?: string | null;
  to_date?: string | null;
};
export type HrMyDeclaration = {
  employee?: string | null;
  employee_name?: string | null;
  year: number;
  year_label: string;
  status: "outstanding" | "draft" | "signed";
  signed_on?: string | null;
  nothing_else: boolean;
  interests: HrDeclarationInterest[];
  look_back_from?: string | null;
  relationships: string[];
  confidentiality_text: string;
  wording_confirmed: boolean;
};
export type HrDeclarationRegister = {
  year: number;
  year_label: string;
  total: number;
  signed: number;
  outstanding: Array<{
    employee: string;
    employee_name?: string | null;
    department?: string | null;
    designation?: string | null;
    has_login: boolean;
  }>;
};
export type HrAuthorisationStatus = "In training" | "Current" | "Expiring" | "Expired" | "Withdrawn";
export type HrAuthorisationRow = {
  id: string;
  employee: string;
  employee_name?: string | null;
  skill: string;
  valid_from?: string | null;
  valid_to?: string | null;
  status: HrAuthorisationStatus;
};
export type HrAuthorisationEvidence = { evidence_type: string; reference?: string | null; notes?: string | null };
export type HrAuthorisationDetail = HrAuthorisationRow & {
  kind?: string | null;
  scheme?: string | null;
  approver?: string | null;
  decides?: string | null;
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
export type HrRemindResult = { created: number; without_login: number; outstanding: number };
export type HrStage = "Applied" | "Shortlist" | "Interview" | "Offer" | "Hired" | "Not taken forward";
export type HrPipeline = {
  opening: { name: string; job_title?: string; designation?: string; department?: string; closes_on?: string | null; status?: string };
  applicants: Array<{ id: string; applicant_name: string; status: string; applied_on?: string | null; source?: string | null; stage: HrStage; interview_status?: string | null; offer_state?: string | null }>;
};
export type HrApplicantInterview = {
  id: string;
  status: string;
  scheduled_on?: string | null;
  from_time?: string | null;
  to_time?: string | null;
  interview_type?: string | null;
  panel: string[];
  feedback: Array<{ interviewer: string; result?: string | null; rating?: number | null; feedback?: string | null }>;
  waiting_for: number;
  average_rating?: number | null;
};
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
export type HrMyInterview = { id: string; applicant_name?: string | null; designation?: string | null; scheduled_on?: string | null; from_time?: string | null; interview_type?: string | null; skills: string[] };
export type HrOnboardingActivity = { activity_name: string; user?: string | null; user_name?: string | null; group?: string | null; task?: string | null; status?: string | null; mine?: boolean };
export type HrOnboarding = {
  id: string;
  kind?: "onboarding" | "offboarding";
  last_day?: string | null;
  reason?: string | null;
  employee?: string | null;
  employee_name: string;
  designation?: string | null;
  department?: string | null;
  date_of_joining?: string | null;
  boarding_status?: string | null;
  done: number;
  total: number;
  activities: HrOnboardingActivity[];
  line_manager?: string | null;
};
export type HrOnboardingDefaults = { employee: string; employee_name: string; date_of_joining?: string | null; job_offer?: string | null; has_login: boolean; activities: HrOnboardingActivity[] };
export type HrTeamMember = {
  employee: string;
  employee_name: string;
  designation?: string | null;
  department?: string | null;
  direct?: boolean | null;
  on_probation: boolean;
  probation_review_due?: string | null;
  contract_ends?: string | null;
  away_today?: string | null;
  date_of_joining?: string | null;
};
export type HrTeam = { manager: string; members: HrTeamMember[]; summary: Record<string, number> };
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
export type HrChanges = {
  employee: string;
  employee_name: string;
  status?: string | null;
  items: Array<{ id: string; kind: "promotion" | "transfer" | "separation" | "contract"; date?: string | null; state: string; changes: Array<{ property: string; current?: string | null; new?: string | null }> }>;
};
export type HrPerfCounts = { people: number; objectives_set: number; self_done: number; manager_done: number };
export type HrPerfCycle = HrPerfCounts & { name: string; cycle_name: string; start_date?: string | null; end_date?: string | null; status?: string | null };
export type HrPerfStep = "self" | "manager" | "done";
export type HrPerfPerson = {
  appraisal: string;
  employee: string;
  employee_name: string;
  department?: string | null;
  designation?: string | null;
  manager_name?: string | null;
  objectives: number;
  self_done: boolean;
  manager_done: boolean;
  step: HrPerfStep;
};
export type HrPerfCycleDetail = {
  name: string;
  cycle_name: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  departments: Array<HrPerfCounts & { department: string }>;
  people: HrPerfPerson[];
};
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
export type HrCaseOwner = { user: string; name?: string | null };
export type HrCaseRow = {
  id: string;
  kind: HrCaseKind;
  opened_on?: string | null;
  stage: string;
  owner_name?: string | null;
  next_step?: string | null;
  next_step_due?: string | null;
  overdue: boolean;
  closed: boolean;
};
export type HrCaseRegister = { items: HrCaseRow[]; can_open: boolean; owners: HrCaseOwner[] };
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
export type HrMyConcerns = { items: Array<{ id: string; raised_on?: string | null; status: string }>; categories: string[]; handlers: HrCaseOwner[] };
export type HrContractDefaults = {
  employee: string;
  employee_name: string;
  employment_type?: string | null;
  contract_end_date?: string | null;
  employment_types: string[];
  pending?: string | null;
};
export type HrEstCounts = { approved: number; frozen: number; filled: number; in_recruitment: number; vacant: number };
export type HrEstPost = HrEstCounts & { designation: string; grade?: string | null };
export type HrEstHead = { id: string; name: string };
export type HrEstChangeKind = "Add" | "Remove" | "Freeze" | "Unfreeze" | "Regrade";
export type HrEstChange = {
  id: string;
  department: string;
  designation: string;
  change: HrEstChangeKind;
  count: number;
  new_grade?: string | null;
  summary: string;
  state: "Waiting for Executive Director" | "Waiting for Council" | "Approved" | "Sent back" | "Not approved";
  council_required: boolean;
  date?: string | null;
};
export type HrEstablishment = {
  departments: Array<HrEstCounts & { department: string; head?: HrEstHead | null; posts: HrEstPost[]; unplanned: number }>;
  totals: HrEstCounts;
  has_plans: boolean;
  pending: HrEstChange[];
  can_request: boolean;
};
export type HrEstDepartment = {
  department: string;
  parent?: string | null;
  head?: HrEstHead | null;
  posts: HrEstPost[];
  people: Array<{ id: string; name?: string | null; designation?: string | null; reports_to?: string | null }>;
  cover_warnings: Array<{ skill: string; holders: number }>;
  changes: HrEstChange[];
  can_request: boolean;
  can_set_head: boolean;
};
export type HrTrackStep = { title: string; state?: "done" | "now" | null };
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
export type HrSensitive = {
  employee: string;
  employee_name: string;
  level: 1 | 2;
  level_label: string;
  fields: Array<{ field: string; label: string; value?: string | null }>;
  log: string;
};
export type HrAccessLog = {
  employee: string;
  employee_name: string;
  can_open: number[];
  items: Array<{ id: string; viewer?: string | null; viewer_name?: string | null; level?: string | null; reason?: string | null; viewed_on?: string | null }>;
};
export type HrAttentionItem = { kind: string; count: number; title: string; detail?: string | null; due?: string | null; href: string; weight?: number };
export type HrTurnover = { joiners: number; leavers: number; pct?: number | null };
export type HrCycleStatus = { name?: string | null; cycle_name: string; end_date?: string | null; people: number; self_done: number; manager_done: number };
export type HrLiveOverview = {
  as_of: string;
  headcount: number;
  departments: number;
  establishment: { has_plans: boolean; totals?: HrEstCounts | null; departments: Array<{ department: string; approved: number; filled: number; vacant: number; frozen: number }> };
  attention: HrAttentionItem[];
  away_today: Array<{ employee?: string | null; employee_name?: string | null; leave_type?: string | null; back_on?: string | null }>;
  movements: { joiners: number; leavers: number };
  turnover: HrTurnover;
  ending_soon: { contracts?: number; probations?: number };
  record_quality: Array<{ field: string; label: string; count: number }>;
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
export type HrSeparationDefaults = { employee: string; employee_name: string; reasons: string[]; activities: HrOnboardingActivity[] };
export type HrPickItem = { id: string; name?: string | null; title?: string | null; employee_name?: string | null };
export type HrVacancy = { department?: string | null; designation: string; approved: number; filled: number; in_recruitment: number; vacant: number };
export type HrRequisition = {
  id: string;
  designation: string;
  department?: string | null;
  status: "Pending" | "Open & Approved" | "Rejected" | "Filled" | "On Hold" | "Cancelled";
  requested_by?: string | null;
  posting_date?: string | null;
  expected_by?: string | null;
  opening?: { id: string; status?: string | null; published: boolean; closes_on?: string | null } | null;
  applicants: Record<string, number>;
};
export type HrLeavePreview = {
  days: number;
  balance?: number | null;
  balance_after?: number | null;
  approver?: HrPersonRef | null;
  conflicts: HrWorkConflict[];
  warnings: string[];
};
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
