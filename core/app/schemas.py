"""Pydantic models mirroring contracts/openapi.yaml schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class CertificationQuoteLine(BaseModel):
    label: str
    amount: float


class CertificationQuote(BaseModel):
    id: str
    status: str
    flow: str = "ms"
    org: str = ""
    contact_email: str = ""
    standards: str = ""
    scope: str = ""
    requested_at: str | None = None
    contact: str | None = None
    phone: str | None = None
    employees: str | None = None
    sites: str | None = None
    issued_at: str | None = None
    valid_until: str | None = None
    lines: list[CertificationQuoteLine] | None = None
    total: float | None = None
    application_id: str | None = None
    notes: str | None = None
    quotation: str | None = None
    pdf_url: str | None = None
    pdf_key: str | None = None
    due_by: str | None = None


class CertificationApplication(BaseModel):
    id: str
    scheme: str
    applicant: str
    status: str
    created_at: str | None = None
    updated_at: str | None = None
    quote: CertificationQuote | None = None


class CertificationScheme(BaseModel):
    """Public catalogue entry — ``code`` is what CreateCertificationApplication.scheme takes."""

    code: str
    name: str
    standard_ref: str | None = None
    scheme_type: str
    accreditation_basis: str | None = None
    surveillance_interval_months: int | None = None
    certificate_validity_months: int | None = None
    fee: float | None = None
    description: str | None = None


class CreateCertificationApplication(BaseModel):
    scheme: str
    applicant_name: str
    contact_email: str | None = None
    confirm: bool


class CreateCertificationQuote(BaseModel):
    confirm: bool
    org: str
    email: str
    flow: str | None = "ms"
    contact: str | None = None
    phone: str | None = None
    standards: str | None = None
    scope: str | None = None
    employees: str | None = None
    sites: str | None = None
    comments: str | None = None
    registration_no: str | None = None
    position: str | None = None
    address: str | None = None
    based_in_eswatini: str | None = None
    made_in_eswatini: str | None = None
    existing_certs: str | None = None
    timeline: str | None = None


class IssueCertificationQuote(BaseModel):
    confirm: bool
    lines: list[CertificationQuoteLine] | None = None
    valid_days: int = 30
    notes: str | None = None


class AdvanceCertificationBody(BaseModel):
    """Workflow act body — used by /act and deprecated /advance."""

    action: str
    confirm: bool
    expected_state: str | None = None
    idempotency_key: str | None = None
    reason: str | None = None
    comment: str | None = None
    payload: dict | None = None


WorkflowActBody = AdvanceCertificationBody


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
    pending: float | None = None
    owed: float | None = None  # balance of an encashable leave type
    above_carry_over: float | None = None  # balance above the type's carry-over cap


class HrLeaveBalances(BaseModel):
    """GET /hr/leave/balances: Leave Ledger balances. Empty items and None totals mean no Leave Period or
    allocation yet ("Awaiting ESWASA leave policy (H14)")."""

    items: list[HrLeaveBalance] = Field(default_factory=list)
    employee: str | None = None
    owed: float | None = None
    above_carry_over: float | None = None
    awaiting: str | None = None


class HrPersonRef(BaseModel):
    """A person named on screen: Frappe User id plus display name."""

    user: str | None = None
    name: str | None = None


class HrMe(BaseModel):
    """OpenAPI: HrMe — the caller's own HR record for My HR (E1)."""

    linked: bool
    employee: HrEmployeeSummary | None = None
    line_manager: str | None = None
    leave_approver: HrPersonRef | None = None
    balances: list[HrLeaveBalance] = Field(default_factory=list)
    leave: list[HrLeaveSummary] = Field(default_factory=list)


class HrLeavePreviewBody(BaseModel):
    leave_type: str
    from_date: str
    to_date: str


class HrWorkConflict(BaseModel):
    id: str
    title: str
    date: str | None = None
    kind: str = "Field visit"


class HrLeavePreview(BaseModel):
    """OpenAPI: HrLeavePreview — what a leave request would mean, before it is sent (E2)."""

    days: float
    balance: float | None = None
    balance_after: float | None = None
    approver: HrPersonRef | None = None
    conflicts: list[HrWorkConflict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class HrDeclarationInterest(BaseModel):
    organisation: str
    relationship: str
    from_date: str | None = None
    to_date: str | None = None


class HrMyDeclaration(BaseModel):
    """OpenAPI: HrMyDeclaration — the caller's impartiality and confidentiality declaration (E6)."""

    employee: str | None = None
    employee_name: str | None = None
    year: int
    year_label: str
    status: str  # outstanding | draft | signed
    signed_on: str | None = None
    nothing_else: bool = False
    interests: list[HrDeclarationInterest] = Field(default_factory=list)
    look_back_from: str | None = None
    relationships: list[str] = Field(default_factory=list)
    confidentiality_text: str = ""
    wording_confirmed: bool = False


class HrSignDeclarationBody(BaseModel):
    interests: list[HrDeclarationInterest] = Field(default_factory=list)
    nothing_else: bool = False
    confidentiality_accepted: bool
    signed_name: str
    confirm: bool


class HrDeclarationOutstanding(BaseModel):
    employee: str
    employee_name: str | None = None
    department: str | None = None
    designation: str | None = None
    has_login: bool = True


class HrDeclarationRegister(BaseModel):
    """OpenAPI: HrDeclarationRegister — signed and outstanding declarations for the year (H5c)."""

    year: int
    year_label: str
    total: int
    signed: int
    outstanding: list[HrDeclarationOutstanding] = Field(default_factory=list)


class HrRemindBody(BaseModel):
    confirm: bool


class HrRemindResult(BaseModel):
    created: int
    without_login: int = 0
    outstanding: int = 0


class HrAuthorisationRow(BaseModel):
    id: str
    employee: str
    employee_name: str | None = None
    skill: str
    valid_from: str | None = None
    valid_to: str | None = None
    status: str  # In training | Current | Expiring | Expired | Withdrawn


class HrEvidenceLink(BaseModel):
    doctype: str  # Training Result | LMS Certificate
    name: str


class HrAuthorisationEvidence(BaseModel):
    evidence_type: str
    reference: str | None = None
    notes: str | None = None
    # Plan 07 step 5: optional extras; the screen's shape above is unchanged.
    id: str | None = None
    file: str | None = None
    link: HrEvidenceLink | None = None


class HrAuthorisationDetail(HrAuthorisationRow):
    """OpenAPI: HrAuthorisationDetail (H5b)."""

    kind: str | None = None
    scheme: str | None = None
    approver: str | None = None
    decides: str | None = None
    person_type: str | None = None  # Employee | External (plan 07 step 7)
    evidence: list[HrAuthorisationEvidence] = Field(default_factory=list)


class HrAuthorisationRequestBody(BaseModel):
    employee: str | None = None
    # Plan 07 step 7, behind HR Settings custom_external_personnel_enabled: instead of employee.
    external_person: str | None = None
    department: str | None = None
    skill: str
    valid_from: str
    valid_to: str | None = None
    evidence: list[HrAuthorisationEvidence] = Field(default_factory=list)
    confirm: bool


class HrTrainingItem(BaseModel):
    source: str  # Training Result | LMS Certificate | LMS Enrollment
    evidence_type: str = "Training Result"
    reference: str | None = None
    title: str | None = None
    training_event: str | None = None
    date: str | None = None
    result: str | None = None
    grade: str | None = None
    hours: float | None = None
    tagged: bool = True  # False: LMS courses aren't tagged to a competence yet (H7)


class HrTrainingEvidence(BaseModel):
    """OpenAPI: HrTrainingEvidence (plan 07 step 6)."""

    employee: str
    skill: str | None = None
    items: list[HrTrainingItem] = Field(default_factory=list)
    lms_installed: bool = False


class HrExternalPerson(BaseModel):
    """OpenAPI: HrExternalPerson (plan 07 step 7, H10)."""

    id: str
    full_name: str
    email: str | None = None
    user: str | None = None
    organisation_type: str | None = None
    organisation: str | None = None
    role: str
    status: str = "Active"
    notes: str | None = None


class HrExternalPeople(BaseModel):
    enabled: bool
    items: list[HrExternalPerson] = Field(default_factory=list)


class HrExternalPersonBody(BaseModel):
    full_name: str
    role: str  # Contract auditor | Technical expert | TC expert
    email: str | None = None
    user: str | None = None
    organisation_type: str | None = None  # Supplier | Contact
    organisation: str | None = None
    status: str | None = None
    notes: str | None = None
    confirm: bool


class HrEvidencePackBody(BaseModel):
    """Exactly one of employee / external_person / scheme / discipline (checked in eswasa_hr)."""

    employee: str | None = None
    external_person: str | None = None
    scheme: str | None = None
    discipline: str | None = None
    sections: list[str] | None = None  # H11: authorisations, monitoring, declarations, training
    confirm: bool


class HrEvidencePackScope(BaseModel):
    kind: str | None = None
    value: str | None = None


class HrEvidencePackJob(BaseModel):
    """OpenAPI: HrEvidencePackJob (plan 07 step 8)."""

    id: str
    status: str  # Queued | Running | Ready | Failed
    scope: HrEvidencePackScope = Field(default_factory=HrEvidencePackScope)
    people: int = 0
    ready: bool = False
    error: str | None = None
    finished_on: str | None = None
    download: str | None = None


class HrCompetenceSkill(BaseModel):
    name: str
    kind: str | None = None
    scheme: str | None = None
    validity_months: int | None = None
    holders: int = 0
    expiring: int = 0


class HrCompetenceCell(BaseModel):
    id: str
    status: str
    valid_to: str | None = None


class HrCompetencePerson(BaseModel):
    employee: str
    employee_name: str | None = None
    cells: dict[str, HrCompetenceCell] = Field(default_factory=dict)


class HrCompetenceMatrix(BaseModel):
    """OpenAPI: HrCompetenceMatrix — people × competences with cover per competence (H5)."""

    skills: list[HrCompetenceSkill] = Field(default_factory=list)
    people: list[HrCompetencePerson] = Field(default_factory=list)


class HrRenewalBody(BaseModel):
    skill: str
    note: str
    confirm: bool


class HrVacancy(BaseModel):
    department: str | None = None
    designation: str
    approved: int
    filled: int
    in_recruitment: int = 0
    vacant: int


class HrOpeningRef(BaseModel):
    id: str
    status: str | None = None
    published: bool = False
    closes_on: str | None = None


class HrRequisition(BaseModel):
    """OpenAPI: HrRequisition — a requisition with its opening and applicant counts (H6)."""

    id: str
    designation: str
    department: str | None = None
    status: str  # Pending | Open & Approved | Rejected | Filled | On Hold | Cancelled
    requested_by: str | None = None
    posting_date: str | None = None
    expected_by: str | None = None
    opening: HrOpeningRef | None = None
    applicants: dict[str, int] = Field(default_factory=dict)
    stage: str | None = None  # Head | HR while Pending (plan 08); status stays Pending through both
    waiting_on: str | None = None  # the named people whose Approvals card is open


class HrRequisitionBody(BaseModel):
    designation: str
    department: str
    description: str
    reason: str | None = None
    expected_compensation: float
    expected_by: str | None = None
    confirm: bool


class HrPublishBody(BaseModel):
    closes_on: str
    job_title: str | None = None
    location: str | None = None
    confirm: bool


class CareerSalary(BaseModel):
    lower: float | None = None
    upper: float | None = None
    currency: str | None = None
    per: str | None = None


class CareerOpening(BaseModel):
    """OpenAPI: CareerOpening — a published vacancy as the public sees it (P1, P2)."""

    id: str
    job_title: str
    department: str | None = None
    designation: str | None = None
    location: str | None = None
    employment_type: str | None = None
    description: str = ""
    posted_on: str | None = None
    closes_on: str | None = None
    salary: CareerSalary | None = None


class CareerApplicationReceipt(BaseModel):
    reference: str
    job_title: str | None = None
    closes_on: str | None = None


class HrPipelineApplicant(BaseModel):
    id: str
    applicant_name: str
    status: str
    applied_on: str | None = None
    source: str | None = None
    stage: str  # Applied | Shortlist | Interview | Offer | Hired | Not taken forward
    interview_status: str | None = None
    offer_state: str | None = None


class HrPipeline(BaseModel):
    """OpenAPI: HrPipeline — one opening's applicants by stage (H6b)."""

    opening: dict[str, Any]
    applicants: list[HrPipelineApplicant] = Field(default_factory=list)


class HrInterviewFeedbackItem(BaseModel):
    interviewer: str
    result: str | None = None
    rating: float | None = None
    feedback: str | None = None


class HrApplicantInterview(BaseModel):
    id: str
    status: str
    scheduled_on: str | None = None
    from_time: str | None = None
    to_time: str | None = None
    interview_type: str | None = None
    panel: list[str] = Field(default_factory=list)
    feedback: list[HrInterviewFeedbackItem] = Field(default_factory=list)
    waiting_for: int = 0
    average_rating: float | None = None


class HrOfferState(BaseModel):
    name: str
    status: str | None = None
    docstatus: int = 0
    offer_date: str | None = None
    designation: str | None = None
    employee: str | None = None
    state: str


class HrApplicantDetail(BaseModel):
    """OpenAPI: HrApplicantDetail — one applicant with interviews and offer (H6c)."""

    id: str
    applicant_name: str
    email: str | None = None
    phone: str | None = None
    status: str
    cover_letter: str | None = None
    has_cv: bool = False
    source: str | None = None
    applied_on: str | None = None
    opening: dict[str, Any] | None = None
    interviews: list[HrApplicantInterview] = Field(default_factory=list)
    offer: HrOfferState | None = None
    stage: str


class HrMyInterview(BaseModel):
    id: str
    applicant_name: str | None = None
    designation: str | None = None
    scheduled_on: str | None = None
    from_time: str | None = None
    interview_type: str | None = None
    skills: list[str] = Field(default_factory=list)


class HrApplicantStatusBody(BaseModel):
    status: str  # Open | Shortlisted | Hold | Rejected
    note: str | None = None
    confirm: bool


class HrScheduleInterviewBody(BaseModel):
    interview_type: str
    scheduled_on: str
    from_time: str
    to_time: str
    interviewers: list[str]
    confirm: bool


class HrSkillRating(BaseModel):
    skill: str
    stars: int


class HrFeedbackBody(BaseModel):
    result: str  # Cleared | Rejected
    ratings: list[HrSkillRating]
    feedback: str | None = None
    confirm: bool


class HrInterviewResultBody(BaseModel):
    status: str  # Cleared | Rejected
    confirm: bool


class HrOfferBody(BaseModel):
    offer_date: str
    terms: str | None = None
    confirm: bool


class HrOfferAnswerBody(BaseModel):
    answer: str  # Accepted | Rejected
    confirm: bool


class HrCreateEmployeeBody(BaseModel):
    date_of_joining: str
    gender: str
    date_of_birth: str
    department: str | None = None
    reports_to: str | None = None
    confirm: bool


class HrOnboardingActivity(BaseModel):
    activity_name: str
    user: str | None = None
    user_name: str | None = None
    group: str | None = None
    task: str | None = None
    status: str | None = None
    mine: bool = False


class HrOnboarding(BaseModel):
    """OpenAPI: HrOnboarding — one joiner's checklist (H7, E10)."""

    id: str
    kind: str = "onboarding"  # onboarding | offboarding
    employee: str | None = None
    employee_name: str
    designation: str | None = None
    department: str | None = None
    date_of_joining: str | None = None
    last_day: str | None = None
    reason: str | None = None
    boarding_status: str | None = None
    done: int = 0
    total: int = 0
    activities: list[HrOnboardingActivity] = Field(default_factory=list)
    line_manager: str | None = None


class HrOnboardingDefaults(BaseModel):
    employee: str
    employee_name: str
    date_of_joining: str | None = None
    job_offer: str | None = None
    has_login: bool = False
    activities: list[HrOnboardingActivity] = Field(default_factory=list)


class HrStartOnboardingBody(BaseModel):
    """From the accepted offer, or (plan 08) for an employee hired outside Recruitment. No activities means the
    default checklist with named owners."""

    employee: str
    activities: list[HrOnboardingActivity] = Field(default_factory=list)
    boarding_begins_on: str | None = None
    start_date: str | None = None
    confirm: bool


class HrConfirmBody(BaseModel):
    confirm: bool


class HrTeamMember(BaseModel):
    employee: str
    employee_name: str
    designation: str | None = None
    department: str | None = None
    direct: bool | None = None
    on_probation: bool = False
    probation_review_due: str | None = None
    contract_ends: str | None = None
    away_today: str | None = None
    date_of_joining: str | None = None


class HrTeam(BaseModel):
    """OpenAPI: HrTeam — a line manager's direct and indirect reports (T1). Job fields only."""

    manager: str
    members: list[HrTeamMember] = Field(default_factory=list)
    summary: dict[str, int] = Field(default_factory=dict)


class HrTeamMemberDetail(HrTeamMember):
    line_manager: str | None = None
    scheduled_confirmation_date: str | None = None
    balances: list[HrLeaveBalance] = Field(default_factory=list)
    authorisations: list[HrAuthorisationRow] = Field(default_factory=list)


class HrTeamCalendarEntry(BaseModel):
    employee: str
    kind: str  # leave | field
    label: str
    from_date: str
    to_date: str
    approved: bool = True


class HrTeamCalendar(BaseModel):
    from_date: str
    to_date: str
    people: list[dict[str, str]] = Field(default_factory=list)
    entries: list[HrTeamCalendarEntry] = Field(default_factory=list)


class HrProbationBody(BaseModel):
    outcome: str  # confirm | extend | end
    summary: str
    extend_to: str | None = None
    confirm: bool


class HrChangeLine(BaseModel):
    property: str
    current: str | None = None
    new: str | None = None


class HrChangeItem(BaseModel):
    id: str
    kind: str  # promotion | transfer | separation | contract
    date: str | None = None
    state: str
    changes: list[HrChangeLine] = Field(default_factory=list)


class HrChanges(BaseModel):
    """OpenAPI: HrChanges — pending and past promotions, transfers and separation for one person."""

    employee: str
    employee_name: str
    status: str | None = None
    items: list[HrChangeItem] = Field(default_factory=list)


class HrPromotionBody(BaseModel):
    effective: str
    designation: str | None = None
    grade: str | None = None
    reports_to: str | None = None
    revised_ctc: float | None = None
    note: str | None = None
    confirm: bool


class HrTransferBody(BaseModel):
    effective: str
    department: str | None = None
    designation: str | None = None
    branch: str | None = None
    reports_to: str | None = None
    note: str | None = None
    confirm: bool


class HrSeparationBody(BaseModel):
    reason: str
    last_day: str
    notice_date: str | None = None
    activities: list[HrOnboardingActivity]
    note: str | None = None
    confirm: bool


class HrSeparationDefaults(BaseModel):
    employee: str
    employee_name: str
    reasons: list[str] = Field(default_factory=list)
    activities: list[HrOnboardingActivity] = Field(default_factory=list)


class HrContractDefaults(BaseModel):
    """OpenAPI: HrContractDefaults — current contract and the employment types to convert to."""

    employee: str
    employee_name: str
    employment_type: str | None = None
    contract_end_date: str | None = None
    employment_types: list[str] = Field(default_factory=list)
    pending: str | None = None


class HrContractBody(BaseModel):
    kind: str  # Renew | Make permanent
    reason: str
    new_end: str | None = None
    new_type: str | None = None
    confirm: bool


class HrPerfCycle(BaseModel):
    name: str
    cycle_name: str
    start_date: str | None = None
    end_date: str | None = None
    status: str | None = None
    people: int = 0
    objectives_set: int = 0
    self_done: int = 0
    manager_done: int = 0


class HrPerfCycles(BaseModel):
    """OpenAPI: HrPerfCycles — appraisal cycles with overall completion (H8)."""

    items: list[HrPerfCycle] = Field(default_factory=list)


class HrPerfDept(BaseModel):
    department: str
    people: int = 0
    objectives_set: int = 0
    self_done: int = 0
    manager_done: int = 0


class HrPerfPerson(BaseModel):
    appraisal: str
    employee: str
    employee_name: str
    department: str | None = None
    designation: str | None = None
    manager_name: str | None = None
    objectives: int = 0
    self_done: bool = False
    manager_done: bool = False
    step: str  # self | manager | done


class HrPerfCycleDetail(BaseModel):
    """OpenAPI: HrPerfCycleDetail — completion by department and everyone's step (H8)."""

    name: str
    cycle_name: str
    start_date: str | None = None
    end_date: str | None = None
    status: str | None = None
    departments: list[HrPerfDept] = Field(default_factory=list)
    people: list[HrPerfPerson] = Field(default_factory=list)


class HrPerfTemplate(BaseModel):
    name: str
    title: str
    criteria: list[str] = Field(default_factory=list)
    kras: list[str] = Field(default_factory=list)


class HrPerfDeptCount(BaseModel):
    name: str
    people: int = 0


class HrPerfDefaults(BaseModel):
    templates: list[HrPerfTemplate] = Field(default_factory=list)
    departments: list[HrPerfDeptCount] = Field(default_factory=list)
    reminder_days: list[int] = Field(default_factory=list)


class HrPerfCycleBody(BaseModel):
    cycle_name: str
    start_date: str
    end_date: str
    template: str
    departments: list[str] = Field(default_factory=list)
    confirm: bool


class HrPerfRemindBody(BaseModel):
    department: str | None = None
    confirm: bool


class HrPerfRemindResult(BaseModel):
    sent: int = 0


class HrAppraisalGoal(BaseModel):
    id: str
    goal_name: str
    kra: str | None = None
    strategic_goal: str | None = None
    progress: float = 0
    status: str | None = None


class HrAppraisalCriterion(BaseModel):
    criteria: str
    weight: float = 0
    self: int | None = None
    manager: int | None = None


class HrAppraisalDetail(BaseModel):
    """OpenAPI: HrAppraisalDetail — one person's appraisal (H8b, E7, T5)."""

    id: str
    cycle: str
    cycle_name: str
    start_date: str | None = None
    end_date: str | None = None
    cycle_status: str | None = None
    employee: str
    employee_name: str
    department: str | None = None
    designation: str | None = None
    manager: str | None = None
    manager_name: str | None = None
    kras: list[str] = Field(default_factory=list)
    goals: list[HrAppraisalGoal] = Field(default_factory=list)
    criteria: list[HrAppraisalCriterion] = Field(default_factory=list)
    reflections: str | None = None
    manager_feedback: str | None = None
    self_done: bool = False
    manager_done: bool = False
    step: str
    can_self: bool = False
    can_review: bool = False
    can_add_goals: bool = False


class HrAppraisalHolder(BaseModel):
    """The current appraisal, or null when the person isn't in a cycle."""

    appraisal: HrAppraisalDetail | None = None


class HrStarRating(BaseModel):
    criteria: str
    stars: int


class HrSelfAssessmentBody(BaseModel):
    ratings: list[HrStarRating]
    reflections: str | None = None
    confirm: bool


class HrGoalBody(BaseModel):
    goal_name: str
    kra: str | None = None
    strategic_goal: str | None = None
    confirm: bool


class HrReviewBody(BaseModel):
    ratings: list[HrStarRating]
    feedback: str
    confirm: bool


class HrCaseRow(BaseModel):
    """One register row. Never names the people involved."""

    id: str
    kind: str  # grievance | disciplinary
    opened_on: str | None = None
    stage: str
    owner_name: str | None = None
    next_step: str | None = None
    next_step_due: str | None = None
    overdue: bool = False
    closed: bool = False


class HrCaseOwner(BaseModel):
    user: str
    name: str | None = None


class HrCaseRegister(BaseModel):
    """OpenAPI: HrCaseRegister — cases the caller may read (HR Manager, or the case owner)."""

    items: list[HrCaseRow] = Field(default_factory=list)
    can_open: bool = False
    owners: list[HrCaseOwner] = Field(default_factory=list)


class HrCasePerson(BaseModel):
    employee: str
    employee_name: str | None = None
    role: str


class HrCaseNote(BaseModel):
    text: str
    by: str | None = None
    on: str | None = None


class HrCaseDetail(BaseModel):
    """OpenAPI: HrCaseDetail — one case (H10a)."""

    id: str
    kind: str
    stage: str
    stages: list[str] = Field(default_factory=list)
    next: list[str] = Field(default_factory=list)
    opened_on: str | None = None
    owner: str | None = None
    owner_name: str | None = None
    people: list[HrCasePerson] = Field(default_factory=list)
    description: str | None = None
    next_step: str | None = None
    next_step_due: str | None = None
    outcome: str | None = None
    decided_by: str | None = None
    decided_by_name: str | None = None
    appeal_owner_name: str | None = None
    talk_first: bool = False
    notes: list[HrCaseNote] = Field(default_factory=list)
    owners: list[HrCaseOwner] = Field(default_factory=list)


class HrCaseOpenBody(BaseModel):
    kind: str
    employee: str
    owner: str
    description: str
    next_step: str | None = None
    next_step_due: str | None = None
    subject: str | None = None
    grievance_type: str | None = None
    confirm: bool


class HrCaseActBody(BaseModel):
    to_stage: str
    note: str
    next_step: str | None = None
    next_step_due: str | None = None
    outcome: str | None = None
    appeal_owner: str | None = None
    confirm: bool


class HrCaseNoteBody(BaseModel):
    text: str
    confirm: bool


class HrCaseOwnerBody(BaseModel):
    owner: str
    note: str
    confirm: bool


class HrCaseBoardKind(BaseModel):
    kind: str
    open: int = 0
    closed_this_year: int = 0
    avg_days_to_close: float | None = None


class HrCaseBoard(BaseModel):
    """OpenAPI: HrCaseBoard — counts only, for the Board HR pack."""

    kinds: list[HrCaseBoardKind] = Field(default_factory=list)


class HrMyConcern(BaseModel):
    id: str
    raised_on: str | None = None
    status: str


class HrMyConcerns(BaseModel):
    items: list[HrMyConcern] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    handlers: list[HrCaseOwner] = Field(default_factory=list)


class HrConcernBody(BaseModel):
    description: str
    grievance_type: str | None = None
    not_handled_by: list[str] = Field(default_factory=list)
    talk_first: bool = False
    confirm: bool


class HrConcernReceipt(BaseModel):
    id: str
    raised_on: str | None = None
    status: str
    handled_by: str | None = None


class HrEstPost(BaseModel):
    designation: str
    approved: int = 0
    frozen: int = 0
    filled: int = 0
    in_recruitment: int = 0
    vacant: int = 0
    grade: str | None = None


class HrEstHead(BaseModel):
    id: str
    name: str


class HrEstCounts(BaseModel):
    approved: int = 0
    frozen: int = 0
    filled: int = 0
    in_recruitment: int = 0
    vacant: int = 0


class HrEstChange(BaseModel):
    id: str
    department: str
    designation: str
    change: str  # Add | Remove | Freeze | Unfreeze | Regrade
    count: int = 0
    new_grade: str | None = None
    summary: str
    state: str
    council_required: bool = False
    date: str | None = None


class HrEstDepartmentRow(HrEstCounts):
    department: str
    head: HrEstHead | None = None
    posts: list[HrEstPost] = Field(default_factory=list)
    unplanned: int = 0


class HrEstablishment(BaseModel):
    """GET /hr/establishment — approved posts from submitted Staffing Plans (H3)."""

    departments: list[HrEstDepartmentRow] = Field(default_factory=list)
    totals: HrEstCounts
    has_plans: bool = False
    pending: list[HrEstChange] = Field(default_factory=list)
    can_request: bool = False


class HrEstPerson(BaseModel):
    id: str
    name: str | None = None
    designation: str | None = None
    reports_to: str | None = None


class HrEstCoverWarning(BaseModel):
    skill: str
    holders: int


class HrEstDepartment(BaseModel):
    """GET /hr/establishment/departments/{id} (H3a)."""

    department: str
    parent: str | None = None
    head: HrEstHead | None = None
    posts: list[HrEstPost] = Field(default_factory=list)
    people: list[HrEstPerson] = Field(default_factory=list)
    cover_warnings: list[HrEstCoverWarning] = Field(default_factory=list)
    changes: list[HrEstChange] = Field(default_factory=list)
    can_request: bool = False
    can_set_head: bool = False


class HrTrackStep(BaseModel):
    title: str
    state: str | None = None


class HrEstDecider(BaseModel):
    user: str
    name: str


class HrEstBefore(BaseModel):
    approved: int = 0
    frozen: int = 0


class HrEstChangeDetail(HrEstChange):
    """GET /hr/establishment/changes/{name} — where it is and who decides; no decision here (H3b)."""

    reason: str | None = None
    cost_note: str | None = None
    current_grade: str | None = None
    before: HrEstBefore = Field(default_factory=HrEstBefore)
    prepared_by: str | None = None
    ed_decision_by: str | None = None
    council_reference: str | None = None
    decision_note: str | None = None
    deciders: list[HrEstDecider] = Field(default_factory=list)
    track: list[HrTrackStep] = Field(default_factory=list)


class HrEstChangeBody(BaseModel):
    department: str
    designation: str
    change: str
    reason: str
    count: int | None = None
    new_grade: str | None = None
    cost_note: str | None = None
    confirm: bool


class HrSensitiveBody(BaseModel):
    level: int  # 1 personal, 2 pay and bank
    reason: str
    confirm: bool


class HrSensitiveField(BaseModel):
    field: str
    label: str
    value: str | None = None


class HrSensitive(BaseModel):
    """POST /hr/employees/{id}/sensitive — the fields at one level; the view is logged first."""

    employee: str
    employee_name: str
    level: int
    level_label: str
    fields: list[HrSensitiveField] = Field(default_factory=list)
    log: str


class HrAccessLogRow(BaseModel):
    id: str
    viewer: str | None = None
    viewer_name: str | None = None
    level: str | None = None
    reason: str | None = None
    viewed_on: str | None = None


class HrAccessLog(BaseModel):
    employee: str
    employee_name: str
    items: list[HrAccessLogRow] = Field(default_factory=list)
    can_open: list[int] = Field(default_factory=list)


class HrAttentionItem(BaseModel):
    kind: str
    count: int
    title: str
    detail: str | None = None
    due: str | None = None
    href: str
    weight: int = 0


class HrEstDeptCount(BaseModel):
    department: str
    approved: int = 0
    filled: int = 0
    vacant: int = 0
    frozen: int = 0


class HrOverviewEstablishment(BaseModel):
    has_plans: bool = False
    totals: HrEstCounts | None = None
    departments: list[HrEstDeptCount] = Field(default_factory=list)


class HrAwayToday(BaseModel):
    employee: str | None = None
    employee_name: str | None = None
    leave_type: str | None = None
    back_on: str | None = None


class HrMovements(BaseModel):
    joiners: int = 0
    leavers: int = 0


class HrTurnover(HrMovements):
    pct: float | None = None


class HrRecordGap(BaseModel):
    field: str
    label: str
    count: int


class HrCycleStatus(BaseModel):
    name: str | None = None
    cycle_name: str
    end_date: str | None = None
    people: int = 0
    self_done: int = 0
    manager_done: int = 0


class HrLiveOverview(BaseModel):
    """GET /hr/overview/live — H0: needs attention, establishment, away today, movements, record quality."""

    as_of: str
    headcount: int = 0
    departments: int = 0
    establishment: HrOverviewEstablishment = Field(default_factory=HrOverviewEstablishment)
    attention: list[HrAttentionItem] = Field(default_factory=list)
    away_today: list[HrAwayToday] = Field(default_factory=list)
    movements: HrMovements = Field(default_factory=HrMovements)
    turnover: HrTurnover = Field(default_factory=HrTurnover)
    ending_soon: dict[str, int] = Field(default_factory=dict)
    record_quality: list[HrRecordGap] = Field(default_factory=list)
    record_checked_on: str | None = None  # R-H7: when the nightly integrity check last ran (None = live, not yet run)
    cycles: list[HrCycleStatus] = Field(default_factory=list)


class HrSetupStep(BaseModel):
    id: str
    title: str
    state: Literal["done", "partial", "todo", "awaiting", "excluded"]
    detail: str
    href: str | None = None
    awaiting: str | None = None
    desk: bool = False


class HrSetupStatus(BaseModel):
    """GET /hr/setup/status — H14 steps from live counts."""

    steps: list[HrSetupStep] = Field(default_factory=list)
    done: int = 0
    total: int = 0
    pct: int = 0


class HrBoardCaseKind(BaseModel):
    kind: str
    open: int = 0
    closed_this_year: int = 0
    avg_days_to_close: float | None = None


class HrBoardEstChange(BaseModel):
    summary: str
    department: str
    state: str
    council_required: bool = False


class HrBoardPack(BaseModel):
    """GET /hr/board-pack — H15 for the Council HR & Remuneration Committee. Aggregates only, no names."""

    as_of: str
    headcount: int = 0
    establishment: HrEstCounts | None = None
    turnover: HrTurnover = Field(default_factory=HrTurnover)
    appraisals: HrCycleStatus | None = None
    competence: dict[str, int] | None = None
    cases: list[HrBoardCaseKind] | None = None
    declarations: dict[str, Any] | None = None
    establishment_changes: list[HrBoardEstChange] = Field(default_factory=list)


class HrModuleAccessRequest(BaseModel):
    """OpenAPI: ModuleAccessRequest — the portal's hr/accessRequests.ts shape (camelCase on purpose)."""

    id: str
    moduleId: str
    moduleLabel: str
    requesterUsername: str
    requesterName: str
    requesterEmail: str = ""
    note: str = ""
    status: str  # pending | approved | rejected
    createdAt: str | None = None
    reviewedAt: str | None = None
    reviewedBy: str | None = None
    reviewNote: str | None = None
    rolesGranted: str | None = None


class HrAccessRequestBody(BaseModel):
    """POST /hr/access-requests — the requester is the session user, never a body field."""

    moduleId: str
    moduleLabel: str | None = None
    note: str | None = None
    confirm: bool = False


class HrAccessReviewBody(BaseModel):
    decision: str  # approved | rejected
    reviewNote: str | None = None
    confirm: bool = False


class HrLeaveRequest(BaseModel):
    """One row of GET /hr/leave/requests (read-only; no reason text)."""

    id: str
    employee: str | None = None
    employee_name: str | None = None
    department: str | None = None
    leave_type: str | None = None
    from_date: str | None = None
    to_date: str | None = None
    days: float | None = None
    status: str
    approver: str | None = None
    approver_name: str | None = None
    sla_date: str | None = None
    overdue: bool = False
    escalated: bool = False


class HrLeaveRequests(BaseModel):
    items: list[HrLeaveRequest] = Field(default_factory=list)


class HrLeaveCalendarEntry(BaseModel):
    employee: str
    kind: str  # leave | field
    label: str
    from_date: str
    to_date: str
    approved: bool = True
    style: str  # solid (approved) | dashed (open) | F (field visit)


class HrLeaveCalendarPerson(BaseModel):
    employee: str
    employee_name: str | None = None
    department: str | None = None


class HrLeaveCalendar(BaseModel):
    start: str
    end: str
    people: list[HrLeaveCalendarPerson] = Field(default_factory=list)
    entries: list[HrLeaveCalendarEntry] = Field(default_factory=list)


class HrLeavePolicyAllocation(BaseModel):
    policy: str | None = None
    annual_allocation: float | None = None


class HrLeavePolicyType(BaseModel):
    model_config = ConfigDict(extra="allow")  # the Leave Type policy fields the installed HRMS has

    name: str
    allocations: list[HrLeavePolicyAllocation] = Field(default_factory=list)


class HrLeavePeriod(BaseModel):
    name: str
    from_date: str | None = None
    to_date: str | None = None


class HrLeavePolicy(BaseModel):
    """GET /hr/leave/policy: configured Leave Types (brief §5.2), read-only. Nothing invented (H14)."""

    configured: bool = False
    awaiting: str | None = None
    leave_period: HrLeavePeriod | None = None
    leave_types: list[HrLeavePolicyType] = Field(default_factory=list)


class HrLeaveCancelBody(BaseModel):
    reason: str
    confirm: bool = False


class HrExpenseLine(BaseModel):
    """One expense on a claim. ``receipt`` names one of the claim's attachments (needed above the threshold)."""

    expense_type: str
    expense_date: str
    amount: float
    description: str | None = None
    receipt: str | None = None
    sanctioned: float | None = None


class HrExpenseAttachment(BaseModel):
    file_name: str
    url: str
    id: str | None = None


class HrExpenseClaim(BaseModel):
    """Plan 05: a reimbursement claim (native HRMS Expense Claim). Lines and attachments only on the detail read."""

    id: str
    employee: str | None = None
    employee_name: str | None = None
    department: str | None = None
    posting_date: str | None = None
    total: float = 0
    sanctioned: float | None = None
    currency: str | None = None
    approval_status: str = "Draft"
    status: str
    approver: str | None = None
    sla_date: str | None = None
    overdue: bool = False
    description: str | None = None
    lines: list[HrExpenseLine] | None = None
    attachments: list[HrExpenseAttachment] | None = None


class HrExpenseClaims(BaseModel):
    items: list[HrExpenseClaim]


class HrExpenseClaimBody(BaseModel):
    lines: list[HrExpenseLine]
    description: str | None = None
    attachments: list[HrExpenseAttachment] = Field(default_factory=list)
    confirm: bool = False


class HrEmployeeDocument(BaseModel):
    """Plan 06. ``file`` (a private media key) only for HR and the person; None for a line manager."""

    id: str
    employee: str | None = None
    document_type: str
    expires_on: str | None = None
    status: str  # To check | Verified | Expired
    required: bool = False
    uploaded_by: str | None = None
    uploaded_on: str | None = None
    verified_by: str | None = None
    file: str | None = None


class HrEmployeeDocuments(BaseModel):
    employee: str
    employee_name: str | None = None
    items: list[HrEmployeeDocument] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)  # required for the person's employment type, not held
    required_set: bool = False  # False until ESWASA lists required documents for this employment type


class HrRecordDocuments(BaseModel):
    items: list[HrEmployeeDocument] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    required_set: bool = False


class HrRecordLeave(BaseModel):
    balances: list[HrLeaveBalance] = Field(default_factory=list)
    awaiting: str | None = None
    next: dict[str, Any] | None = None  # {leave_type, from_date, to_date}


class HrRecordContract(BaseModel):
    employment_type: str | None = None
    contract_end_date: str | None = None
    pending: str | None = None


class HrRecordOpenItem(BaseModel):
    kind: str  # probation | declaration | appraisal | change
    title: str
    due: str | None = None
    reference: str | None = None


class HrEmployeeRecord(HrEmployeeSummary):
    """GET /hr/employees/{id}, /hr/me/record (plan 06, brief §12.2). HrEmployeeSummary's fields plus the record.
    Job fields only: protected fields open through /sensitive with a reason."""

    viewer: str | None = None  # hr | self | manager
    employee_number: str | None = None
    grade: str | None = None
    branch: str | None = None
    employment_type: str | None = None
    scheduled_confirmation_date: str | None = None
    final_confirmation_date: str | None = None
    contract_end_date: str | None = None
    relieving_date: str | None = None
    reports_to_name: str | None = None
    leave: HrRecordLeave = Field(default_factory=HrRecordLeave)
    authorisations: list[HrAuthorisationRow] = Field(default_factory=list)
    documents: HrRecordDocuments = Field(default_factory=HrRecordDocuments)
    history: list[HrChangeItem] = Field(default_factory=list)
    contract: HrRecordContract = Field(default_factory=HrRecordContract)
    open_items: list[HrRecordOpenItem] = Field(default_factory=list)


class HrProfileChange(BaseModel):
    id: str
    employee: str | None = None
    employee_name: str | None = None
    field: str
    field_label: str | None = None
    current_value: str | None = None
    requested_value: str | None = None
    reason: str | None = None
    has_evidence: bool = False
    status: str  # Pending | Approved | Rejected
    decided_by: str | None = None
    note: str | None = None
    requested_on: str | None = None


class HrProfileChanges(BaseModel):
    items: list[HrProfileChange] = Field(default_factory=list)


class HrProfileChangeBody(BaseModel):
    field: str
    requested_value: str
    reason: str
    evidence: str | None = None  # an uploaded file's link (POST /api/media); required for a name change
    confirm: bool = False


class HrImportError(BaseModel):
    """Plan 09: one problem in an import file. ``row`` is the spreadsheet row (1 is the header); None for the whole file."""

    row: int | None = None
    employee_number: str | None = None
    field: str | None = None
    message: str


class HrImportResult(BaseModel):
    """Plan 09: a dry run's findings and counts (pass 1 records, 2 links and logins, 3 opening leave balances)."""

    pass_no: int
    rows: int = 0
    create: int = 0
    update: int = 0
    unchanged: int = 0
    errors: list[HrImportError] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    ok: bool = False


class HrImportRun(BaseModel):
    """Plan 09: one recorded import run. A run with any error writes nothing (created/updated stay 0)."""

    id: str
    pass_no: int | None = None
    status: str
    file_name: str | None = None
    rows: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    error_count: int = 0
    run_by: str | None = None
    started_on: str | None = None
    finished_on: str | None = None
    go_live: str | None = None
    errors: list[HrImportError] | None = None
    warnings: list[str] | None = None


class HrImportRuns(BaseModel):
    items: list[HrImportRun]


class HrImportJob(BaseModel):
    job_id: str
    run: str
    status: str


class HrMasterDataCounts(BaseModel):
    created: int = 0
    updated: int = 0
    unchanged: int = 0


class HrMasterDataResult(BaseModel):
    """Plan 09: what loading ESWASA's master-data file did (or would do, on a dry run). Nothing is ever deleted."""

    dry_run: bool
    counts: dict[str, HrMasterDataCounts] = Field(default_factory=dict)
    missing_departments: list[str] = Field(default_factory=list)
    kept: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    ok: bool = False


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
