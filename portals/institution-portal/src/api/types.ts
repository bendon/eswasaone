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
