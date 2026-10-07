"""Mock / composed data when Frappe is unreachable."""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas import (
    CertificationScheme,
    ApprovalItem,
    ApprovalsResponse,
    AuditSummary,
    BoardPackSection,
    BoardPackSummary,
    CertificationApplication,
    CrmPipeline,
    CrmPipelineStage,
    FeedItem,
    FinanceDashboard,
    FinanceMonths,
    HrSummary,
    InstitutionHome,
    Kpi,
    MetrologyJobSummary,
    ModuleTile,
    PlanTrafficLight,
    ServiceCard,
    ServiceHome,
    StandardSummary,
    TbtNotificationsResponse,
    TbtNotificationSummary,
    VerificationResult,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def mock_institution_home() -> InstitutionHome:
    return InstitutionHome(
        kpis=[
            Kpi(key="open_apps", label="Open applications", value=12, trend="+2", status="ok"),
            Kpi(key="overdue_audits", label="Overdue audits", value=3, status="warn"),
            Kpi(key="standards", label="Published standards", value=148, status="ok"),
        ],
        modules=[
            ModuleTile(
                id="certification",
                title="Certification",
                status="active",
                href="/institution/certification",
            ),
            ModuleTile(
                id="standards",
                title="Standards",
                status="active",
                href="/institution/standards",
            ),
            ModuleTile(
                id="metrology",
                title="Metrology",
                status="active",
                href="/institution/metrology",
            ),
            ModuleTile(
                id="tbt",
                title="TBT / Notifications",
                status="stub",
                href="/institution/tbt",
                watermark="WS3",
            ),
        ],
        feed=[
            FeedItem(
                id="feed-1",
                type="application",
                title="Application CERT-0042 submitted",
                severity="info",
                created_at=_now(),
                href="/institution/certification/CERT-0042",
            ),
            FeedItem(
                id="feed-2",
                type="audit",
                title="Audit overdue for CERT-0018",
                severity="warn",
                created_at=_now(),
            ),
        ],
    )


def mock_service_home() -> ServiceHome:
    return ServiceHome(
        stats=[
            Kpi(key="my_apps", label="My applications", value=2, status="ok"),
            Kpi(key="certificates", label="Valid certificates", value=1, status="ok"),
        ],
        services=[
            ServiceCard(
                id="apply",
                title="Apply for certification",
                description="Start a product or system certification application",
                href="/certification/apply",
            ),
            ServiceCard(
                id="estore",
                title="Standards e-store",
                description="Browse and purchase standards",
                href="/estore",
            ),
            ServiceCard(
                id="verify",
                title="Verify a mark",
                description="Check certificate authenticity",
                href="/verify",
            ),
        ],
        recent_activity=[
            FeedItem(
                id="act-1",
                type="order",
                title="Purchased SZNS 001",
                severity="success",
                created_at=_now(),
            )
        ],
        alerts=[
            FeedItem(
                id="alert-1",
                type="renewal",
                title="Certificate renewal due in 30 days",
                severity="warn",
                created_at=_now(),
            )
        ],
    )


_MOCK_SCHEMES = (
    ("ISO9001-QMS", "Quality Management Systems: Requirements", "SZNS ISO 9001:2015", "Management System"),
    (
        "ISO14001-EMS",
        "Environmental Management Systems: Requirements with guidance for use",
        "SZNS ISO 14001:2015",
        "Management System",
    ),
    (
        "ISO22000-FSMS",
        "Food Safety Management Systems: Requirements for any organization in the food chain",
        "SZNS ISO 22000:2018",
        "Management System",
    ),
    (
        "ISO45001-OHSMS",
        "Occupational Health and Safety Management Systems: Requirements with guidance for use",
        "SZNS ISO 45001:2018",
        "Management System",
    ),
    (
        "HACCP-10330",
        "Hazard Analysis and Critical Control Point (HACCP)",
        "SZNS SANS 10330:2020",
        "Management System",
    ),
    ("PRODUCT-MARK", "Product certification", "Product Certification Mark", "Product"),
    ("INGELO", "Ingelo: certification for local MSME producers", "Ingelo Certification Scheme", "Product"),
    ("COMBINED", "Combined request (e.g., ISO + Product)", "Combined request", "Management System"),
)


def mock_schemes() -> list[CertificationScheme]:
    """Mirror of eswasa_certification.schemes.PUBLISHED_SCHEMES for offline dev."""
    return [
        CertificationScheme(
            code=code,
            name=name,
            standard_ref=ref,
            scheme_type=kind,
            accreditation_basis="ISO/IEC 17065" if kind == "Product" else "ISO/IEC 17021",
            surveillance_interval_months=12,
            certificate_validity_months=36,
        )
        for code, name, ref, kind in _MOCK_SCHEMES
    ]


def mock_applications(status: str | None = None, limit: int = 20) -> list[CertificationApplication]:
    items = [
        CertificationApplication(
            id="CERT-0042",
            scheme="Product Certification",
            applicant="Acme Foods (Pty) Ltd",
            status="Submitted",
            created_at=_now(),
            updated_at=_now(),
        ),
        CertificationApplication(
            id="CERT-0018",
            scheme="System Certification",
            applicant="Valley Dairy",
            status="Audit Scheduled",
            created_at=_now(),
            updated_at=_now(),
        ),
        CertificationApplication(
            id="CERT-0007",
            scheme="Product Certification",
            applicant="Swazi Crafts",
            status="Certified",
            created_at=_now(),
            updated_at=_now(),
        ),
    ]
    if status:
        items = [i for i in items if i.status.lower() == status.lower()]
    return items[:limit]


def mock_application(app_id: str) -> CertificationApplication | None:
    for item in mock_applications(limit=100):
        if item.id == app_id:
            return item
    return CertificationApplication(
        id=app_id,
        scheme="Product Certification",
        applicant="Unknown Applicant",
        status="Draft",
        created_at=_now(),
        updated_at=_now(),
    )


def mock_overdue_audits(
    auditor: str | None = None,
    scheme: str | None = None,
) -> list[AuditSummary]:
    items = [
        AuditSummary(
            id="AUD-101",
            application_id="CERT-0018",
            auditor="N. Dlamini",
            scheme="System Certification",
            due_date="2026-09-01",
            status="Overdue",
        ),
        AuditSummary(
            id="AUD-088",
            application_id="CERT-0012",
            auditor="S. Mamba",
            scheme="Product Certification",
            due_date="2026-08-15",
            status="Overdue",
        ),
    ]
    if auditor:
        items = [i for i in items if (i.auditor or "").lower() == auditor.lower()]
    if scheme:
        items = [i for i in items if (i.scheme or "").lower() == scheme.lower()]
    return items


def mock_standards(q: str | None = None, sector: str | None = None) -> list[StandardSummary]:
    items = [
        StandardSummary(
            code="SZNS 001",
            title="General requirements for product labelling",
            sector="Food",
            status="Published",
            buy_url="/estore/SZNS-001",
        ),
        StandardSummary(
            code="SZNS 042",
            title="Code of practice for dairy processing",
            sector="Food",
            status="Published",
            buy_url="/estore/SZNS-042",
        ),
        StandardSummary(
            code="SZNS ISO 9001",
            title="Quality management systems: Requirements",
            sector="Management",
            status="Published",
            buy_url="/estore/SZNS-ISO-9001",
        ),
    ]
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i.code.lower() or ql in i.title.lower()]
    if sector:
        items = [i for i in items if (i.sector or "").lower() == sector.lower()]
    return items


def mock_verify(token: str) -> VerificationResult:
    valid = token.upper().startswith("ESW-") or token.upper().startswith("CERT-")
    return VerificationResult(
        valid=valid,
        token=token,
        subject="Acme Foods (Pty) Ltd: Product Mark" if valid else None,
        issued_at=_now() if valid else None,
        expires_at="2027-09-19T00:00:00+00:00" if valid else None,
        details={"scheme": "Product Certification", "mock": True} if valid else {"mock": True},
    )


# --- Institution modules (A4) — # TODO: wire real ---------------------------

# Mock chart anchors from docs/mocks/eswasaone-institutional-portal.html
_MOCK_BUDGET_THOUSANDS = [520.0, 570.0, 585.0, 640.0, 660.0, 680.0]
_MOCK_ACTUAL_THOUSANDS = [470.0, 600.0, 540.0, 720.0, 665.0, 575.0]
_MOCK_MONTH_LABELS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]


# Process-local decided approvals (until governance API is wired)
_DECIDED_APPROVALS: set[str] = set()


def mock_decide_approval(approval_id: str, decision: str) -> dict[str, object]:
    _DECIDED_APPROVALS.add(approval_id)
    return {
        "ok": True,
        "id": approval_id,
        "decision": decision,
        "message": f"Recorded {decision} for {approval_id}",
    }


def mock_approvals(limit: int = 20) -> ApprovalsResponse:
    # Legacy fixtures — Institution routes must not call this (STEP 0).
    items = [
        ApprovalItem(
            id="Certification Application::CERT-0042",
            doctype="Certification Application",
            name="CERT-0042",
            title="CERT-0042: advance to Audit Scheduled",
            module="certification",
            status="Pending",
            due_at="2026-09-22T12:00:00+00:00",
            sla_breached=True,
        ),
    ]
    open_items = [i for i in items if i.id not in _DECIDED_APPROVALS]
    clipped = open_items[:limit]
    return ApprovalsResponse(items=clipped, pending_count=len(open_items))


def mock_tbt_notifications(
    unread_only: bool = False,
    limit: int = 20,
) -> TbtNotificationsResponse:
    # TODO: wire real — eswasa_tbt + ePing ingest (badge target ~4)
    items = [
        TbtNotificationSummary(
            id="G/TBT/N/EU/891",
            symbol="G/TBT/N/EU/891",
            title="High impact on textiles: EU chemical restrictions",
            impact="high",
            unread=True,
            published_at="2026-09-20T08:00:00+00:00",
        ),
        TbtNotificationSummary(
            id="G/TBT/N/ZA/312",
            symbol="G/TBT/N/ZA/312",
            title="Draft labelling rules for packaged foods",
            impact="medium",
            unread=True,
            published_at="2026-09-19T14:30:00+00:00",
        ),
        TbtNotificationSummary(
            id="G/TBT/N/US/2104",
            symbol="G/TBT/N/US/2104",
            title="Electrical safety plugs: alignment with IEC",
            impact="high",
            unread=True,
            published_at="2026-09-18T10:00:00+00:00",
        ),
        TbtNotificationSummary(
            id="G/TBT/N/KE/88",
            symbol="G/TBT/N/KE/88",
            title="Metrology: weighing instruments revision",
            impact="low",
            unread=True,
            published_at="2026-09-17T09:15:00+00:00",
        ),
        TbtNotificationSummary(
            id="G/TBT/N/BW/45",
            symbol="G/TBT/N/BW/45",
            title="Cosmetics ingredient disclosure (read)",
            impact="medium",
            unread=False,
            published_at="2026-09-10T11:00:00+00:00",
        ),
    ]
    new_count = sum(1 for i in items if i.unread)
    if unread_only:
        items = [i for i in items if i.unread]
    return TbtNotificationsResponse(items=items[:limit], new_count=new_count)


def mock_finance_months() -> FinanceMonths:
    return FinanceMonths(
        labels=list(_MOCK_MONTH_LABELS),
        budget_thousands=list(_MOCK_BUDGET_THOUSANDS),
        actual_thousands=list(_MOCK_ACTUAL_THOUSANDS),
    )


def mock_finance_kpis() -> FinanceDashboard:
    # TODO: wire real — ERPNext Budget / GL / Insights
    months = mock_finance_months()
    budget_ytd = sum(months.budget_thousands) * 1000.0
    revenue_ytd = sum(months.actual_thousands) * 1000.0
    variance_pct = round(((revenue_ytd - budget_ytd) / budget_ytd) * 100.0, 1)
    return FinanceDashboard(
        revenue_ytd_szl=revenue_ytd,
        budget_ytd_szl=budget_ytd,
        variance_pct=variance_pct,
        months=months,
        plan=[
            PlanTrafficLight(
                key="standards_developed",
                label="Standards Developed",
                actual="8",
                target="12",
                status="amber",
            ),
            PlanTrafficLight(
                key="cert_revenue",
                label="Certification Revenue",
                actual="SZL 1.9M",
                target="SZL 2.4M",
                status="amber",
            ),
            PlanTrafficLight(
                key="training_completion",
                label="Training Completion Rate",
                actual="78%",
                target="85%",
                status="amber",
            ),
            PlanTrafficLight(
                key="audit_cycle",
                label="Audit Cycle Time",
                actual="52 days",
                target="<60 days",
                status="green",
            ),
            PlanTrafficLight(
                key="csat",
                label="Customer Satisfaction",
                actual="4.3 / 5.0",
                target="4.0",
                status="green",
            ),
            PlanTrafficLight(
                key="appraisal",
                label="Staff Appraisal Completion",
                actual="64%",
                target="100%",
                status="red",
            ),
        ],
    )


def mock_hr_summary() -> HrSummary:
    # Soft-empty live path preferred; mock only for offline home tiles if needed.
    return HrSummary(
        headcount=86,
        appraisal_completion_pct=64.0,
        open_leave=11,
        new_hires_q=4,
        on_leave_today=3,
        leave_pending=11,
        open_positions=2,
        out_today=[],
        activity=[],
    )


mock_hr_overview = mock_hr_summary


def mock_board_pack() -> BoardPackSummary:
    # TODO: wire real — eswasa_governance board pack sections
    sections = [
        BoardPackSection(title="CEO report", status="Ready"),
        BoardPackSection(title="Finance pack", status="Ready"),
        BoardPackSection(title="Risk register", status="Outstanding"),
        BoardPackSection(title="Standards work programme", status="Outstanding"),
        BoardPackSection(title="Certification KPIs", status="Ready"),
    ]
    outstanding = sum(1 for s in sections if s.status.lower() == "outstanding")
    return BoardPackSummary(
        due_label="Council pack due Friday",
        outstanding_sections=outstanding,
        sections=sections,
    )


def mock_metrology_jobs(
    status: str | None = None,
    limit: int = 20,
) -> list[MetrologyJobSummary]:
    # TODO: wire real — eswasa_metrology.api.list_calibration_jobs
    items = [
        MetrologyJobSummary(
            id="CAL-2026-001",
            instrument="Analytical balance 0.1 mg",
            customer="Acme Foods (Pty) Ltd",
            status="In Progress",
            due_date="2026-09-30",
        ),
        MetrologyJobSummary(
            id="CAL-2026-002",
            instrument="Thermocouple set",
            customer="Valley Dairy",
            status="Received",
            due_date="2026-10-05",
        ),
        MetrologyJobSummary(
            id="CAL-2026-003",
            instrument="Mass comparator",
            customer="Swazi Crafts",
            status="Completed",
            due_date="2026-09-15",
        ),
    ]
    if status:
        items = [i for i in items if i.status.lower() == status.lower()]
    return items[:limit]


def mock_crm_pipeline() -> CrmPipeline:
    # TODO: wire real — ERPNext CRM Lead / Opportunity / Customer
    return CrmPipeline(
        stages=[
            CrmPipelineStage(name="Lead", count=18),
            CrmPipelineStage(name="Qualified", count=9),
            CrmPipelineStage(name="Proposal", count=5),
            CrmPipelineStage(name="Negotiation", count=3),
            CrmPipelineStage(name="Won", count=12),
        ],
        companies=47,
    )
