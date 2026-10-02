"""Pydantic models mirroring contracts/openapi.yaml schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class Kpi(BaseModel):
    key: str
    label: str
    value: Any
    trend: str | None = None
    status: Literal["ok", "warn", "critical", "unknown"] | None = None


class ModuleTile(BaseModel):
    id: str
    title: str
    status: str
    href: str | None = None
    watermark: str | None = None


class ServiceCard(BaseModel):
    id: str
    title: str
    description: str | None = None
    href: str | None = None


class FeedItem(BaseModel):
    id: str
    type: str
    title: str
    body: str | None = None
    severity: Literal["info", "success", "warn", "critical"] | None = None
    created_at: str
    href: str | None = None


class InstitutionHome(BaseModel):
    kpis: list[Kpi]
    modules: list[ModuleTile]
    feed: list[FeedItem]


class ServiceHome(BaseModel):
    stats: list[Kpi]
    services: list[ServiceCard]
    recent_activity: list[FeedItem]
    alerts: list[FeedItem]


class CertificationApplication(BaseModel):
    id: str
    scheme: str
    applicant: str
    status: str
    created_at: str | None = None
    updated_at: str | None = None


class CreateCertificationApplication(BaseModel):
    scheme: str
    applicant_name: str
    contact_email: str | None = None
    confirm: bool


class AdvanceCertificationBody(BaseModel):
    action: str | None = None
    confirm: bool
    comment: str | None = None


class AuditSummary(BaseModel):
    id: str
    application_id: str
    auditor: str | None = None
    scheme: str | None = None
    due_date: str
    status: str


class StandardSummary(BaseModel):
    code: str
    title: str
    sector: str | None = None
    status: str | None = None
    buy_url: str | None = None


class CheckoutItem(BaseModel):
    standard_code: str
    qty: int = Field(ge=1)


class CheckoutRequest(BaseModel):
    items: list[CheckoutItem]
    payment_method: Literal["momo", "invoice"] | None = None
    confirm: bool


class CheckoutResult(BaseModel):
    order_id: str
    status: str
    payment_ref: str | None = None
    momo_reference: str | None = None


class VerificationResult(BaseModel):
    valid: bool
    token: str
    subject: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None
    details: dict[str, Any] | None = None


class Citation(BaseModel):
    source_id: str
    title: str
    rights: Literal["open", "public", "licensed"]
    url: str | None = None
    excerpt: str | None = None


class PendingAction(BaseModel):
    id: str
    tool: str
    summary: str
    mutates: bool | None = None


class BuyLink(BaseModel):
    standard_code: str
    url: str
    title: str | None = None


class AgentAskRequest(BaseModel):
    message: str
    context: dict[str, Any] | None = None
    confirm_action_id: str | None = None


class AgentAskResponse(BaseModel):
    answer: str
    citations: list[Citation] | None = None
    tools_used: list[str] | None = None
    pending_action: PendingAction | None = None
    buy_links: list[BuyLink] | None = None


class ApplicabilityStep(BaseModel):
    order: int
    title: str
    detail: str | None = None
    href: str | None = None


class ApplicabilityRequest(BaseModel):
    query: str
    jurisdiction: str | None = None
    sector: str | None = None
    hs_code: str | None = None


class ApplicabilityResult(BaseModel):
    summary: str
    steps: list[ApplicabilityStep]
    citations: list[Citation]
    buy_links: list[BuyLink] | None = None


class SessionUser(BaseModel):
    username: str
    full_name: str
    roles: list[str]
    email: str | None = None


class Session(BaseModel):
    """Dual-path: cookie authoritative; access_token kept for Bearer clients."""

    access_token: str | None = None
    token_type: str = "bearer"
    user: SessionUser
    otp_verified_until: float | None = None
    locked: bool = False


class LoginChallenge(BaseModel):
    """Password verified — OTP required before a full session is issued."""

    status: Literal["otp_required"] = "otp_required"
    challenge_id: str
    message: str | None = None
    stubbed: bool = False
    email_hint: str | None = None


class UnlockRequest(BaseModel):
    email: str | None = None
    username: str | None = None
    password: str


class InviteStaffRequest(BaseModel):
    email: str
    full_name: str
    roles: list[str]
    org: str | None = None


class InviteStaffResponse(BaseModel):
    ok: bool
    email: str
    message: str | None = None


class StaffMember(BaseModel):
    username: str
    full_name: str
    email: str | None = None
    roles: list[str] = []
    department: str | None = None
    designation: str | None = None
    avatar_initials: str = ""
    enabled: bool = True


class ReassignBody(BaseModel):
    to_user: str
    comment: str | None = None
    confirm: bool


class ReassignResult(BaseModel):
    ok: bool
    to_user: str
    message: str | None = None


class StaffMember(BaseModel):
    """Staff user for assignment pickers (User + Employee join)."""
    username: str
    full_name: str
    email: str | None = None
    roles: list[str] = []
    department: str | None = None
    designation: str | None = None
    avatar_initials: str = ""
    enabled: bool = True


class StaffListResponse(BaseModel):
    items: list[StaffMember]


class ReassignBody(BaseModel):
    to_user: str
    comment: str | None = None
    confirm: bool


class ReassignResult(BaseModel):
    ok: bool
    to_user: str
    message: str = ""


class StaffMember(BaseModel):
    username: str
    full_name: str
    email: str | None = None
    roles: list[str] = []
    department: str | None = None
    designation: str | None = None
    avatar_initials: str = ""
    enabled: bool = True


class ReassignBody(BaseModel):
    to_user: str
    comment: str | None = None
    confirm: bool


class ReassignResult(BaseModel):
    ok: bool
    to_user: str
    message: str = ""


class LoginRequest(BaseModel):
    """Prefer email; username kept for dual-path / desk users."""

    email: str | None = None
    username: str | None = None
    password: str | None = None
    otp: str | None = None
    challenge_id: str | None = None

    @model_validator(mode="after")
    def _require_combo(self) -> "LoginRequest":
        has_pw = bool(self.password)
        has_otp = bool(self.otp)
        has_id = bool(self.email or self.username or self.challenge_id)
        if not has_id:
            raise ValueError("email, username, or challenge_id required")
        if not has_pw and not has_otp:
            raise ValueError("password or otp required")
        return self


class RegisterRequest(BaseModel):
    email: str
    name: str
    org: str | None = None
    password: str | None = None


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetResponse(BaseModel):
    ok: bool = True
    message: str
    stubbed: bool = False


class AuthRequiredError(BaseModel):
    auth_required: bool = True
    reason: str | None = None
    detail: str | None = None


# --- Institution modules (roster v2 / A4) ------------------------------------


class ApprovalItem(BaseModel):
    id: str
    doctype: str
    name: str
    title: str
    module: str
    status: str
    due_at: str | None = None
    sla_breached: bool


class ApprovalsResponse(BaseModel):
    items: list[ApprovalItem]
    pending_count: int


class TbtNotificationSummary(BaseModel):
    id: str
    symbol: str
    title: str
    impact: Literal["high", "medium", "low"]
    unread: bool
    published_at: str | None = None


class TbtNotificationsResponse(BaseModel):
    items: list[TbtNotificationSummary]
    new_count: int


class FinanceMonths(BaseModel):
    labels: list[str]
    budget_thousands: list[float]
    actual_thousands: list[float]


class PlanTrafficLight(BaseModel):
    key: str
    label: str
    actual: str
    target: str
    status: Literal["green", "amber", "red"]


class FinanceDashboard(BaseModel):
    revenue_ytd_szl: float
    budget_ytd_szl: float
    variance_pct: float
    months: FinanceMonths
    plan: list[PlanTrafficLight]


class HrSummary(BaseModel):
    """GET /hr/summary and GET /hr/overview share this payload."""

    headcount: int
    appraisal_completion_pct: float
    open_leave: int
    new_hires_q: int = 0
    on_leave_today: int = 0
    leave_pending: int = 0
    open_positions: int = 0
    out_today: list["HrOutTodayItem"] | None = None
    activity: list["HrActivityItem"] | None = None


class HrOutTodayItem(BaseModel):
    employee: str
    id: str | None = None
    employee_name: str | None = None
    reason: str | None = None
    leave_type: str | None = None
    from_date: str | None = None
    to_date: str | None = None
    status: str | None = None


class HrActivityItem(BaseModel):
    id: str
    title: str
    at: str | None = None
    kind: str | None = None
    href: str | None = None


# Alias — OpenAPI HrSummary is the SoT; overview uses the same schema.
HrOverview = HrSummary


class BoardPackSection(BaseModel):
    title: str
    status: str


class BoardPackSummary(BaseModel):
    due_label: str
    outstanding_sections: int
    sections: list[BoardPackSection]


class MetrologyJobSummary(BaseModel):
    id: str
    instrument: str
    customer: str | None = None
    status: str
    due_date: str | None = None


class CrmPipelineStage(BaseModel):
    name: str
    count: int


class CrmPipeline(BaseModel):
    stages: list[CrmPipelineStage]
    companies: int


class FinanceInvoiceSummary(BaseModel):
    id: str
    customer: str
    status: str
    grand_total: float
    due_date: str | None = None
    overdue: bool | None = None


class CreateFinanceInvoiceBody(BaseModel):
    customer: str
    items: list[dict[str, Any]] | None = None
    confirm: bool


class HrEmployeeSummary(BaseModel):
    id: str
    employee_name: str
    department: str | None = None
    designation: str | None = None
    status: str | None = None
    date_of_joining: str | None = None
    email: str | None = None
    initials: str | None = None
    reports_to: str | None = None
    user_id: str | None = None
    desk_path: str | None = None


class CreateHrEmployeeBody(BaseModel):
    """OpenAPI: HrEmployeeCreate."""

    employee_name: str
    confirm: bool
    first_name: str | None = None
    last_name: str | None = None
    department: str | None = None
    designation: str | None = None
    date_of_joining: str | None = None
    company_email: str | None = None
    gender: str | None = None
    date_of_birth: str | None = None
    company: str | None = None
    reports_to: str | None = None
    invite: bool = False
    email: str | None = None
    roles: list[str] | None = None
    profile_name: str | None = None


HrEmployeeCreate = CreateHrEmployeeBody


class PatchHrEmployeeBody(BaseModel):
    """OpenAPI: HrEmployeePatch."""

    confirm: bool
    employee_name: str | None = None
    department: str | None = None
    designation: str | None = None
    status: str | None = None
    email: str | None = None
    reports_to: str | None = None


HrEmployeePatch = PatchHrEmployeeBody


class HrLeaveSummary(BaseModel):
    id: str
    employee: str
    leave_type: str
    from_date: str | None = None
    to_date: str | None = None
    status: str


class CreateHrLeaveBody(BaseModel):
    leave_type: str
    from_date: str
    to_date: str
    reason: str | None = None
    confirm: bool


class HrLeaveActBody(BaseModel):
    """OpenAPI: HrLeaveAct."""

    decision: str  # approve | reject
    confirm: bool
    reason: str | None = None


HrLeaveAct = HrLeaveActBody


class HrLeaveBalance(BaseModel):
    leave_type: str
    allocated: float
    used: float
    balance: float
    employee: str | None = None


class HrHoliday(BaseModel):
    date: str
    id: str | None = None
    description: str | None = None
    holiday_list: str | None = None


class HrAttendanceSnapshot(BaseModel):
    date: str
    out_today: list[HrOutTodayItem]
    present_count: int | None = None
    absent_count: int | None = None


class HrOrgChartNode(BaseModel):
    id: str
    employee_name: str
    designation: str | None = None
    department: str | None = None
    reports_to: str | None = None
    initials: str | None = None
    email: str | None = None


# --- HR organisation / structure (OpenAPI HrOrganisation*) --------------------


class HrLocationRef(BaseModel):
    id: str
    name: str
    code: str | None = None


class HrDepartmentRef(BaseModel):
    id: str
    name: str
    code: str | None = None


class HrGradeBandRef(BaseModel):
    id: str
    code: str
    name: str | None = None
    level: int | None = None


class HrCostCentreRef(BaseModel):
    id: str
    code: str
    name: str


class HrEmployeeRef(BaseModel):
    id: str
    name: str
    initials: str | None = None


class HrOrganisation(BaseModel):
    id: str
    legal_name: str
    registration_number: str | None = None
    founded_year: int | None = None
    sector: str | None = None
    registered_address: str | None = None
    primary_location_id: str | None = None
    primary_location: HrLocationRef | None = None


class HrOrganisationPatch(BaseModel):
    confirm: bool
    legal_name: str | None = None
    registration_number: str | None = None
    founded_year: int | None = None
    sector: str | None = None
    registered_address: str | None = None
    primary_location_id: str | None = None


class HrOrganisationCreate(BaseModel):
    """Create the singleton Frappe Company (confirm-before-commit)."""

    confirm: bool
    legal_name: str
    abbr: str | None = None
    default_currency: str = "SZL"
    country: str = "Eswatini"
    registration_number: str | None = None
    founded_year: int | None = None
    sector: str | None = None
    registered_address: str | None = None


class FinanceSetupStep(BaseModel):
    id: str
    label: str
    done: bool
    href: str | None = None


class FinanceSettings(BaseModel):
    """Finance department configuration snapshot (ERP-lite foundation)."""

    company_id: str | None = None
    company_name: str | None = None
    default_currency: str | None = None
    country: str | None = None
    has_chart_of_accounts: bool = False
    has_cost_centres: bool = False
    has_fiscal_year: bool = False
    pastel_status: Literal["not_configured", "stubbed"] = "not_configured"
    payment_gateway_status: Literal["not_configured", "stubbed"] = "not_configured"
    steps: list[FinanceSetupStep] = []


class HrDepartment(BaseModel):
    id: str
    name: str
    code: str | None = None
    parent_department_id: str | None = None
    head: HrEmployeeRef | None = None
    cost_centre: HrCostCentreRef | None = None
    status: Literal["active", "archived"] = "active"
    designation_count: int = 0
    filled_count: int = 0
    total_positions: int = 0


class HrDepartmentCreate(BaseModel):
    name: str
    confirm: bool
    code: str | None = None
    parent_department_id: str | None = None
    cost_centre_id: str | None = None


class HrDepartmentPatch(BaseModel):
    confirm: bool
    name: str | None = None
    code: str | None = None
    parent_department_id: str | None = None
    cost_centre_id: str | None = None
    status: Literal["active", "archived"] | None = None


class HrDepartmentHeadBody(BaseModel):
    employee_id: str
    confirm: bool


class HrDesignation(BaseModel):
    id: str
    title: str
    code: str | None = None
    description: str | None = None
    department: HrDepartmentRef | None = None
    grade_band: HrGradeBandRef | None = None
    filled: int = 0
    total: int | None = None


class HrDesignationCreate(BaseModel):
    title: str
    confirm: bool
    code: str | None = None
    description: str | None = None
    department_id: str | None = None
    grade_band_id: str | None = None
    approved_headcount: int | None = None


class HrDesignationPatch(BaseModel):
    confirm: bool
    title: str | None = None
    code: str | None = None
    description: str | None = None
    department_id: str | None = None
    grade_band_id: str | None = None
    approved_headcount: int | None = None


class HrGradeBand(BaseModel):
    id: str
    code: str
    name: str | None = None
    level: int | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    currency: str | None = "SZL"


class HrGradeBandCreate(BaseModel):
    code: str
    confirm: bool
    name: str | None = None
    level: int | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    currency: str = "SZL"


class HrGradeBandPatch(BaseModel):
    confirm: bool
    code: str | None = None
    name: str | None = None
    level: int | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    currency: str | None = None


class HrLocation(BaseModel):
    id: str
    name: str
    code: str | None = None
    address: str | None = None
    type: Literal["hq", "lab", "satellite"] | None = None
    status: Literal["active", "closed"] = "active"
    employee_count: int = 0


class HrLocationCreate(BaseModel):
    name: str
    confirm: bool
    code: str | None = None
    address: str | None = None
    type: Literal["hq", "lab", "satellite"] | None = None


class HrLocationPatch(BaseModel):
    confirm: bool
    name: str | None = None
    code: str | None = None
    address: str | None = None
    type: Literal["hq", "lab", "satellite"] | None = None
    status: Literal["active", "closed"] | None = None


class HrCostCentre(BaseModel):
    id: str
    name: str
    code: str | None = None
    description: str | None = None
    finance_account_code: str | None = None
    status: Literal["active", "draft", "archived"] = "active"
    employee_count: int = 0


class HrCostCentreCreate(BaseModel):
    name: str
    confirm: bool
    code: str | None = None
    description: str | None = None
    finance_account_code: str | None = None
    status: Literal["active", "draft", "archived"] = "active"


class HrCostCentrePatch(BaseModel):
    confirm: bool
    name: str | None = None
    code: str | None = None
    description: str | None = None
    finance_account_code: str | None = None
    status: Literal["active", "draft", "archived"] | None = None


class HrSetupProgress(BaseModel):
    has_profile: bool
    has_departments: bool
    has_designations: bool
    has_locations: bool
    has_grades: bool
    has_cost_centres: bool
    has_employees: bool
    completion_pct: float
    steps_completed: int
    steps_total: int


class HrOrganisationCounts(BaseModel):
    departments: int
    designations: int
    filled_positions: int
    vacant_positions: int
    locations: int
    cost_centres: int
    employees: int


class HrPayrollReadiness(BaseModel):
    ready: bool
    label: str
    reason: str | None = None


class HrOrganisationOverview(BaseModel):
    setup: HrSetupProgress
    counts: HrOrganisationCounts
    departments: list[HrDepartment]
    designations_preview: list[HrDesignation]
    designations_total: int
    locations: list[HrLocation]
    cost_centres: list[HrCostCentre]
    payroll: HrPayrollReadiness
    organisation: HrOrganisation | None = None


class HrAppraisalSummary(BaseModel):
    id: str
    employee: str
    cycle: str | None = None
    status: str


class HrAppraisalCycle(BaseModel):
    id: str
    title: str
    status: str
    start_date: str | None = None
    end_date: str | None = None
    completion_pct: float | None = None


class HrJobOpening(BaseModel):
    id: str
    job_title: str
    status: str
    department: str | None = None
    designation: str | None = None
    vacancies: int | None = None


class CreateHrJobBody(BaseModel):
    job_title: str
    confirm: bool
    department: str | None = None
    designation: str | None = None
    vacancies: int | None = None


class HrApplicant(BaseModel):
    id: str
    applicant_name: str
    status: str
    job: str | None = None
    stage: str | None = None


class AdvanceHrApplicantBody(BaseModel):
    stage: str
    confirm: bool
    note: str | None = None


class HrInterview(BaseModel):
    id: str
    applicant: str
    scheduled_at: str
    status: str
    interviewers: list[str] | None = None


class HrPayslip(BaseModel):
    id: str
    employee: str
    status: str
    period: str | None = None
    net_pay: float | None = None


class HrPayrollStatus(BaseModel):
    status: str
    period: str | None = None
    employees_processed: int | None = None
    message: str | None = None


class HrOnboardingItem(BaseModel):
    id: str
    title: str
    status: str
    employee: str | None = None
    due_date: str | None = None


class HrExpense(BaseModel):
    id: str
    amount: float
    expense_type: str
    status: str
    description: str | None = None


class HrGrievance(BaseModel):
    id: str
    subject: str
    status: str
    body: str | None = None


class MarketingCampaignSummary(BaseModel):
    id: str
    title: str
    status: str


class CreateMarketingCampaignBody(BaseModel):
    title: str
    confirm: bool


class CrmLeadSummary(BaseModel):
    id: str
    title: str
    organization: str | None = None
    status: str


class CreateCrmLeadBody(BaseModel):
    title: str
    organization: str | None = None
    confirm: bool


class CrmDealSummary(BaseModel):
    id: str
    title: str
    amount: float | None = None
    status: str


class CreateCrmDealBody(BaseModel):
    title: str
    amount: float | None = None
    confirm: bool


class TrainingCourseSummary(BaseModel):
    id: str
    title: str
    published: bool | None = None


class TrainingEnrolmentSummary(BaseModel):
    id: str
    course: str
    member: str | None = None
    status: str


class EnrolTrainingBody(BaseModel):
    course: str
    batch: str | None = None
    confirm: bool


class TbtSubscribeBody(BaseModel):
    sector: str | None = None
    hs_code: str | None = None
    jurisdiction: str | None = None
    confirm: bool


class AnalyticsAskBody(BaseModel):
    question: str


class AnalyticsAskResponse(BaseModel):
    answer: str
    citations: list[dict[str, Any]] | None = None
    figures: list[dict[str, Any]] | None = None


class AnalyticsReportSummary(BaseModel):
    id: str
    title: str
    period: str | None = None


# --- System Administration ---------------------------------------------------


class AdminServiceStatus(BaseModel):
    name: str
    meta: str | None = None
    status: Literal["ok", "warn", "err", "info"]
    detail: str | None = None


class AdminAppVersion(BaseModel):
    app: str
    installed: str
    latest: str | None = None
    status: Literal["current", "update", "unknown"] = "unknown"
    notes: str | None = None


class AdminOverview(BaseModel):
    site: str
    environment: str | None = None
    frappe_version: str
    erpnext_version: str
    frappe_status: Literal["ok", "warn", "err"] = "ok"
    erpnext_status: Literal["ok", "warn", "err"] = "ok"
    active_users: int
    seat_limit: int | None = None
    online_now: int | None = None
    last_backup_ago: str | None = None
    last_backup_ok: bool | None = None
    services: list[AdminServiceStatus]
    apps: list[AdminAppVersion]
    updates_available: int = 0


class AdminUpdatesResponse(BaseModel):
    channel: str
    items: list[AdminAppVersion]


class AdminUpdateRunBody(BaseModel):
    confirm: bool
    channel: str = "stable"
    backup_before: bool = True
    migrate: bool = True
    maintenance: bool = True
    dry_run: bool = False


class AdminCommandResult(BaseModel):
    ok: bool
    message: str | None = None
    lines: list[str] | None = None
    lock_holder: str | None = None


class AdminSystemSettings(BaseModel):
    time_zone: str | None = None
    date_format: str | None = None
    currency: str | None = None
    number_format: str | None = None
    session_expiry: str | None = None
    enable_scheduler: bool | None = None
    disable_user_pass_login: bool | None = None
    allow_consecutive_login_attempts: int | None = None
    force_https: bool | None = None


class AdminEmailSettings(BaseModel):
    outgoing_ok: bool
    smtp_host: str | None = None
    smtp_port: int | None = None
    from_address: str | None = None
    use_tls: bool | None = None
    incoming_set: bool | None = None
    account_name: str | None = None


class AdminUserSummary(BaseModel):
    name: str
    full_name: str
    email: str | None = None
    role_profile_name: str | None = None
    last_active: str | None = None
    enabled: bool
    user_type: str | None = None


class AdminScheduledJob(BaseModel):
    name: str
    method: str
    frequency: str
    last_run: str | None = None
    status: str
    stopped: bool | None = None


class AdminSchedulerResponse(BaseModel):
    enabled: bool
    heartbeat_ago: str | None = None
    jobs: list[AdminScheduledJob]


class AdminJobsSnapshot(BaseModel):
    running: int
    queued: int
    completed_24h: int
    failed: int


class AdminBackupSummary(BaseModel):
    timestamp: str
    size: str | None = None
    backup_type: str | None = None
    path: str


class AdminBackupPolicy(BaseModel):
    frequency: str | None = None
    include_files: bool | None = None
    retention_days: int | None = None
    offsite: bool | None = None
    encrypt: bool | None = None


class AdminLogEntry(BaseModel):
    time: str
    source: str
    message: str
    level: Literal["ok", "warn", "err", "info"]
    name: str | None = None


class AdminIntegrationStatus(BaseModel):
    id: str
    title: str
    status: Literal["ok", "warn", "err", "info"]
    detail: str
    href: str | None = None


# --- Access Security (Institution off-LAN device / network allowlist) ----------


class AdminAccessPolicy(BaseModel):
    """Controls Institution portal access outside trusted LAN/WAN."""

    enforce_off_lan: bool = False
    """When true, off-LAN clients need an approved device to open /institution."""
    fail_closed: bool = True
    """When enforce is on and store is unavailable: deny (True) or allow (False)."""
    redirect_path: str = "/"
    """Where nginx/SPA should send denied clients (Service Portal root)."""
    notes: str | None = None


class AdminAccessNetwork(BaseModel):
    id: str
    label: str
    cidr: str
    enabled: bool = True
    notes: str | None = None


class AdminAccessNetworkCreate(BaseModel):
    confirm: bool
    label: str
    cidr: str
    enabled: bool = True
    notes: str | None = None


class AdminAccessDevice(BaseModel):
    id: str
    label: str
    fingerprint: str
    """Stable device token / cert fingerprint (not a browser UA hash alone)."""
    owner_username: str | None = None
    status: Literal["pending", "approved", "revoked", "expired"] = "pending"
    created_at: str
    approved_at: str | None = None
    approved_by: str | None = None
    expires_at: str | None = None
    last_seen_at: str | None = None
    last_seen_ip: str | None = None
    notes: str | None = None


class AdminAccessDeviceCreate(BaseModel):
    confirm: bool
    label: str
    fingerprint: str
    owner_username: str | None = None
    status: Literal["pending", "approved"] = "pending"
    expires_at: str | None = None
    notes: str | None = None


class AdminAccessDevicePatch(BaseModel):
    confirm: bool
    label: str | None = None
    status: Literal["pending", "approved", "revoked", "expired"] | None = None
    owner_username: str | None = None
    expires_at: str | None = None
    notes: str | None = None


class AdminAccessEvent(BaseModel):
    id: str
    time: str
    outcome: Literal["allow", "deny"]
    reason: str
    ip: str | None = None
    username: str | None = None
    device_id: str | None = None
    path: str | None = None


class AdminAccessEvaluateResult(BaseModel):
    allowed: bool
    reason: str
    enforce_off_lan: bool
    on_trusted_network: bool
    device_status: str | None = None
    redirect_path: str = "/"
