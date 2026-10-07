"""Composed BFF routes — home, certification, standards, analytics, estore, verify."""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ValidationError

from app.adapters import RequestToPayRequest, request_to_pay
from app.agent.guardrails import enforce_licence
from app.agent.rag import search_sources
from app.audit import audit_log
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.gateway import analytics as analytics_bridge
from app.gateway import mocks
from app.identity.deps import AuthContext, get_actor, require_auth, require_auth_csrf, require_staff
from app.identity.errors import AuthRequired
from app.schemas import (
    AdvanceCertificationBody,
    AnalyticsAskBody,
    AnalyticsAskResponse,
    AnalyticsReportSummary,
    ApplicabilityRequest,
    ApplicabilityResult,
    ApplicabilityStep,
    ApprovalItem,
    ApprovalsResponse,
    AuditSummary,
    CertificationApplication,
    CertificationScheme,
    CheckoutRequest,
    CheckoutResult,
    Citation,
    CreateCertificationApplication,
    CreateCrmDealBody,
    CreateCrmLeadBody,
    CreateFinanceInvoiceBody,
    CreateHrEmployeeBody,
    CreateHrJobBody,
    CreateHrLeaveBody,
    AdvanceHrApplicantBody,
    CrmDealSummary,
    CrmLeadSummary,
    CrmPipeline,
    EnrolTrainingBody,
    FinanceDashboard,
    FinanceInvoiceSummary,
    HrActivityItem,
    HrApplicant,
    HrAppraisalSummary,
    HrAttendanceSnapshot,
    HrCostCentre,
    HrCostCentreCreate,
    HrCostCentrePatch,
    HrCostCentreRef,
    HrDepartment,
    HrDepartmentCreate,
    HrDepartmentHeadBody,
    HrDepartmentPatch,
    HrDepartmentRef,
    HrDesignation,
    HrDesignationCreate,
    HrDesignationPatch,
    HrEmployeeRef,
    HrEmployeeSummary,
    HrGradeBand,
    HrGradeBandCreate,
    HrGradeBandPatch,
    HrGradeBandRef,
    HrHoliday,
    HrJobOpening,
    HrLeaveActBody,
    HrLeaveBalance,
    HrLeaveSummary,
    HrLocation,
    HrLocationCreate,
    HrLocationPatch,
    HrLocationRef,
    HrOrgChartNode,
    HrOrganisation,
    HrOrganisationCounts,
    HrOrganisationCreate,
    HrOrganisationOverview,
    HrOrganisationPatch,
    HrOutTodayItem,
    HrPayrollReadiness,
    HrPayslip,
    HrPayrollStatus,
    HrSetupProgress,
    HrSummary,
    FinanceSettings,
    FinanceSetupStep,
    InstitutionHome,
    MarketingCampaignSummary,
    MetrologyJobSummary,
    PatchHrEmployeeBody,
    ServiceHome,
    StandardSummary,
    TbtNotificationsResponse,
    TbtNotificationSummary,
    TbtSubscribeBody,
    TrainingCourseSummary,
    TrainingEnrolmentSummary,
    VerificationResult,
)

# Default roles when POST /hr/employees invite=true without explicit roles.
_HR_INVITE_DEFAULT_ROLES = ("ESWASA Staff", "Desk User", "Employee", "Employee Self Service")
_HR_INVITE_ALLOWED_ROLES = frozenset(
    {
        "ESWASA Staff",
        "Desk User",
        "Employee",
        "Employee Self Service",
        "HR User",
        "HR Manager",
        "Leave Approver",
        "Accounts User",
        "Accounts Manager",
        "Sales User",
        "Sales Manager",
    }
)

logger = logging.getLogger(__name__)

router = APIRouter()

# WS-I5 Board & Governance — soft-fail stubs (see app.governance)
from app.governance import mount_governance_routes
mount_governance_routes(router)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_app(raw: Any) -> CertificationApplication:
    if isinstance(raw, CertificationApplication):
        return raw
    data = raw if isinstance(raw, dict) else {}
    return CertificationApplication(
        id=str(data.get("id") or data.get("name") or ""),
        scheme=str(data.get("scheme") or ""),
        applicant=str(data.get("applicant") or data.get("applicant_name") or ""),
        status=str(data.get("status") or data.get("workflow_state") or ""),
        created_at=data.get("created_at") or data.get("creation"),
        updated_at=data.get("updated_at") or data.get("modified"),
    )


def _as_audits(raw: Any) -> list[AuditSummary]:
    if isinstance(raw, dict) and "items" in raw:
        items = raw["items"]
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    return [AuditSummary.model_validate(i) for i in items]


def _as_standards(raw: Any) -> list[StandardSummary]:
    if isinstance(raw, dict) and "items" in raw:
        items = raw["items"]
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    return [StandardSummary.model_validate(i) for i in items]


def _raise_from_frappe(exc: FrappeError) -> None:
    """Map Frappe failures to Core status codes the portal can display cleanly."""
    from app.frappe_errors import raise_from_frappe

    raise_from_frappe(exc)


# --- Home -------------------------------------------------------------------


@router.get("/home/institution", response_model=InstitutionHome, tags=["home"])
async def get_institution_home(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> InstitutionHome:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable: Institution home requires live seed")
    try:
        raw = await auth.frappe(frappe).method("eswasa_governance.api.institution_home")
        return InstitutionHome.model_validate(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="Institution home unavailable")


@router.get("/home/service", response_model=ServiceHome, tags=["home"])
async def get_service_home(
    auth: Annotated[AuthContext, Depends(get_actor)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> ServiceHome:
    if auth.mock or not await frappe.health():
        return mocks.mock_service_home()
    try:
        raw = await auth.frappe(frappe).method("eswasa_governance.api.service_home")
        return ServiceHome.model_validate(raw)
    except FrappeError:
        return mocks.mock_service_home()


# --- Certification (WS2) ----------------------------------------------------


@router.get("/certification/schemes", tags=["certification"])
async def list_certification_schemes(
    auth: Annotated[AuthContext, Depends(get_actor)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[CertificationScheme]]:
    """Public catalogue: active Certification Schemes (codes accepted by POST /applications)."""
    if auth.mock or not await frappe.health():
        return {"items": mocks.mock_schemes()}
    try:
        raw = await auth.frappe(frappe).method("eswasa_certification.api.list_schemes")
        items_raw = raw.get("items", raw) if isinstance(raw, dict) else raw
        return {"items": [CertificationScheme.model_validate(i) for i in (items_raw or [])]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/certification/applications", tags=["certification"])
async def list_certification_applications(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 20,
) -> dict[str, list[CertificationApplication]]:
    if auth.mock or not await frappe.health():
        return {"items": mocks.mock_applications(status_filter, limit)}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.list_applications",
            params={"status": status_filter, "limit": limit},
        )
        items_raw = raw.get("items", raw) if isinstance(raw, dict) else raw
        return {"items": [_as_app(i) for i in (items_raw or [])]}
    except FrappeError as exc:
        # Soft: Desk User may open the module but lack Certification DocPerm —
        # return [] so the portal can paint fixtures instead of a hard 403.
        text = str(exc)
        if (
            exc.status_code == 403
            or "PermissionError" in text
            or "Insufficient Permission" in text
            or "Not permitted" in text
        ):
            return {"items": []}
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/certification/applications",
    response_model=CertificationApplication,
    status_code=status.HTTP_201_CREATED,
    tags=["certification"],
)
async def create_certification_application(
    body: CreateCertificationApplication,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CertificationApplication:
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )
    audit_log(
        action="certification.create",
        actor=auth.user.username,
        resource="Certification Application",
        detail={"scheme": body.scheme, "applicant": body.applicant_name},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        return CertificationApplication(
            id=f"CERT-{uuid.uuid4().hex[:4].upper()}",
            scheme=body.scheme,
            applicant=body.applicant_name,
            status="Application",
            created_at=_now(),
            updated_at=_now(),
        )
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.create_application",
            json={
                "scheme": body.scheme,
                "applicant_name": body.applicant_name,
                "contact_email": body.contact_email,
                "confirm": True,
            },
        )
        return _as_app(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get(
    "/certification/applications/{id}",
    response_model=CertificationApplication,
    tags=["certification"],
)
async def get_certification_application(
    id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CertificationApplication:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.get_application",
            params={"name": id},
        )
        return _as_app(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/certification/applications/{id}/act",
    response_model=CertificationApplication,
    tags=["certification"],
)
async def act_certification_application(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CertificationApplication:
    """Preferred workflow transition (map §5). Guards enforced in Frappe."""
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )
    audit_log(
        action="certification.act",
        actor=auth.user.username,
        resource=id,
        detail={
            "action": body.action,
            "expected_state": body.expected_state,
            "idempotency_key": body.idempotency_key,
            "reason": body.reason,
            "comment": body.comment,
        },
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.workflow_act.act",
            json={
                "doctype": "Certification Application",
                "name": id,
                "action": body.action,
                "expected_state": body.expected_state,
                "idempotency_key": body.idempotency_key,
                "reason": body.reason,
                "comment": body.comment,
                "confirm": True,
            },
        )
        return _as_app(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/certification/applications/{id}/advance",
    response_model=CertificationApplication,
    tags=["certification"],
    deprecated=True,
)
async def advance_certification_application(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CertificationApplication:
    """Compatibility alias — same pipeline as /act."""
    return await act_certification_application(id, body, auth, frappe)


async def _workflow_act(
    *,
    method: str,
    resource: str,
    audit_action: str,
    body: AdvanceCertificationBody,
    auth: AuthContext,
    frappe: FrappeClient,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Shared Core→Frappe /act bridge (map §5)."""
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )
    audit_log(
        action=audit_action,
        actor=auth.user.username,
        resource=resource,
        detail={
            "action": body.action,
            "expected_state": body.expected_state,
            "idempotency_key": body.idempotency_key,
            "reason": body.reason,
            "comment": body.comment,
        },
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    payload: dict[str, Any] = {
        "name": resource,
        "action": body.action,
        "expected_state": body.expected_state,
        "idempotency_key": body.idempotency_key,
        "reason": body.reason,
        "comment": body.comment,
        "confirm": True,
    }
    if extra:
        payload.update(extra)
    try:
        return await auth.frappe(frappe).method(method, json=payload)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post("/standards/work-items/{id}/act", tags=["standards"])
async def act_work_item(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    return await _workflow_act(
        method="eswasa_standards.api.act_work_item",
        resource=id,
        audit_action="standards.act",
        body=body,
        auth=auth,
        frappe=frappe,
    )


@router.post("/metrology/jobs/{id}/act", tags=["metrology"])
async def act_calibration_job(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    return await _workflow_act(
        method="eswasa_metrology.api.act_calibration_job",
        resource=id,
        audit_action="metrology.act",
        body=body,
        auth=auth,
        frappe=frappe,
    )


@router.post("/tbt/notifications/{id}/act", tags=["tbt"])
async def act_tbt_notification(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    return await _workflow_act(
        method="eswasa_tbt.api.act_notification",
        resource=id,
        audit_action="tbt.act",
        body=body,
        auth=auth,
        frappe=frappe,
    )


@router.post("/governance/resolutions/{id}/act", tags=["governance"])
async def act_board_resolution(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    return await _workflow_act(
        method="eswasa_governance.api.act_resolution",
        resource=id,
        audit_action="governance.resolution.act",
        body=body,
        auth=auth,
        frappe=frappe,
    )


@router.post("/governance/packs/{id}/act", tags=["governance"])
async def act_board_pack_route(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    return await _workflow_act(
        method="eswasa_governance.api.act_board_pack",
        resource=id,
        audit_action="governance.pack.act",
        body=body,
        auth=auth,
        frappe=frappe,
    )


@router.post("/field/visits/{id}/act", tags=["field"])
async def act_field_visit(
    id: str,
    body: AdvanceCertificationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    return await _workflow_act(
        method="eswasa_certification.workflow_act.act",
        resource=id,
        audit_action="field.visit.act",
        body=body,
        auth=auth,
        frappe=frappe,
        extra={"doctype": "Field Visit"},
    )


@router.get("/certification/audits/overdue", tags=["certification"])
async def list_overdue_audits(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    auditor: str | None = None,
    scheme: str | None = None,
) -> dict[str, list[AuditSummary]]:
    if auth.mock or not await frappe.health():
        return {"items": mocks.mock_overdue_audits(auditor, scheme)}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.list_overdue",
            params={"auditor": auditor, "scheme": scheme},
        )
        return {"items": _as_audits(raw)}
    except FrappeError:
        return {"items": mocks.mock_overdue_audits(auditor, scheme)}


# --- Standards (WS3) --------------------------------------------------------


@router.get("/standards", tags=["standards"])
async def list_standards(
    auth: Annotated[AuthContext, Depends(get_actor)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    q: str | None = None,
    sector: str | None = None,
) -> dict[str, list[StandardSummary]]:
    if auth.mock or not await frappe.health():
        return {"items": mocks.mock_standards(q, sector)}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_standards.api.list_standards",
            params={"q": q, "sector": sector},
        )
        return {"items": _as_standards(raw)}
    except FrappeError:
        return {"items": mocks.mock_standards(q, sector)}


class PublishStandardBody(BaseModel):
    standard: str
    confirm: bool


@router.post("/standards/publish", tags=["standards"])
async def publish_standard(
    body: PublishStandardBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Gazette + catalogue + e-store publish (R-S3) via eswasa_standards.api.publish_standard."""
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )
    audit_log(
        action="standards.publish",
        actor=auth.user.username,
        resource=f"Standard:{body.standard}",
        detail={"standard": body.standard},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_standards.api.publish_standard",
            json={"standard": body.standard, "confirm": True},
        )
        return raw if isinstance(raw, dict) else {"ok": True, "result": raw}
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Standards publish failed")


# --- E-store + MoMo (WS3 / WS6) ---------------------------------------------


@router.post("/estore/checkout", response_model=CheckoutResult, tags=["estore"])
async def estore_checkout(
    body: CheckoutRequest,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CheckoutResult:
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )
    audit_log(
        action="estore.checkout",
        actor=auth.user.username,
        resource="Sales Order",
        detail={
            "items": [i.model_dump() for i in body.items],
            "payment_method": body.payment_method,
        },
        confirmed=True,
    )

    order_id = f"SO-{uuid.uuid4().hex[:8].upper()}"
    momo_ref: str | None = None
    if body.payment_method == "momo":
        amount = f"{sum(i.qty for i in body.items) * 150.0:.2f}"
        # MSISDN not yet on OpenAPI CheckoutRequest — stub payer for Collection RTP
        rtp = await request_to_pay(
            RequestToPayRequest(
                amount=amount,
                msisdn="26876123456",
                external_id=order_id,
                payer_message="EswasaOne standards purchase",
            )
        )
        momo_ref = rtp.reference_id

    if auth.mock or not await frappe.health():
        return CheckoutResult(
            order_id=order_id,
            status="Pending Payment" if body.payment_method == "momo" else "Invoice Issued",
            payment_ref=f"PAY-{order_id}",
            momo_reference=momo_ref,
        )
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_estore.api.checkout",
            json={
                "items": [i.model_dump() for i in body.items],
                "payment_method": body.payment_method or "invoice",
                "confirm": True,
            },
        )
        if isinstance(raw, dict) and raw.get("order_id"):
            return CheckoutResult(
                order_id=str(raw["order_id"]),
                status=str(raw.get("status") or "pending"),
                payment_ref=raw.get("payment_ref"),
                momo_reference=momo_ref or raw.get("momo_reference"),
            )
    except FrappeError:
        logger.warning("estore.checkout Frappe call failed; returning local order")

    return CheckoutResult(
        order_id=order_id,
        status="Pending Payment" if body.payment_method == "momo" else "Invoice Issued",
        payment_ref=f"PAY-{order_id}",
        momo_reference=momo_ref,
    )


# --- Verify (WS3, public) ---------------------------------------------------


@router.get("/verify/{token}", response_model=VerificationResult, tags=["verify"])
async def verify_token(
    token: str,
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> VerificationResult:
    if not await frappe.health():
        return mocks.mock_verify(token)
    try:
        raw = await frappe.method(
            "eswasa_verification.api.verify_token",
            params={"token": token},
        )
        return VerificationResult.model_validate(raw)
    except FrappeError:
        return mocks.mock_verify(token)


# --- Ingest applicability (WS8) ---------------------------------------------


async def build_applicability(
    body: ApplicabilityRequest,
    *,
    auth: AuthContext | None = None,
    frappe: FrappeClient | None = None,
) -> ApplicabilityResult:
    """Shared by gateway + agent tool — Frappe first, else Qdrant RAG."""
    client = frappe or get_frappe_client()
    use_frappe = True
    if auth is not None and auth.mock:
        use_frappe = False
    elif not await client.health():
        use_frappe = False

    if use_frappe:
        try:
            session = auth.frappe(client) if auth else client
            raw = await session.method(
                "eswasa_ingest.api.check_applicability",
                json={
                    "query": body.query,
                    "jurisdiction": body.jurisdiction,
                    "sector": body.sector,
                    "hs_code": body.hs_code,
                },
            )
            return ApplicabilityResult.model_validate(raw)
        except FrappeError:
            logger.info("ingest.check_applicability unavailable; RAG fallback")

    hits = await search_sources(body.query, limit=5)
    citations = [
        Citation(
            source_id=h["source_id"],
            title=h["title"],
            rights=h["rights"],
            url=h.get("url"),
            excerpt=h.get("excerpt"),
        )
        for h in hits
    ]
    citations, buy_links = enforce_licence(citations)
    jurisdiction = body.jurisdiction or "Eswatini"
    return ApplicabilityResult(
        summary=(
            f"Guided applicability for “{body.query}” under {jurisdiction}"
            + (f" / sector {body.sector}" if body.sector else "")
            + (f" (HS {body.hs_code})" if body.hs_code else "")
            + f". Matched {len(citations)} source(s) from TBT/ePing corpus."
        ),
        steps=[
            ApplicabilityStep(
                order=1,
                title="Identify product / service scope",
                detail="Confirm HS code and intended market.",
            ),
            ApplicabilityStep(
                order=2,
                title="Review matching TBT / ePing notifications",
                detail="Open citations are quotable; licensed standards are paraphrased only.",
                href="https://eping.wto.org/",
            ),
            ApplicabilityStep(
                order=3,
                title="Purchase applicable standards",
                detail="Use e-store links for licensed full text.",
                href="/estore",
            ),
        ],
        citations=citations,
        buy_links=buy_links or None,
    )


@router.post(
    "/ingest/applicability",
    response_model=ApplicabilityResult,
    tags=["ingest"],
)
async def check_applicability(
    body: ApplicabilityRequest,
    auth: Annotated[AuthContext, Depends(get_actor)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> ApplicabilityResult:
    return await build_applicability(body, auth=auth, frappe=frappe)


# --- Institution modules (roster v2 / A4) -----------------------------------


def _as_approvals(raw: Any, limit: int) -> ApprovalsResponse:
    if isinstance(raw, dict):
        items_raw = raw.get("items", [])
        pending = raw.get("pending_count")
    elif isinstance(raw, list):
        items_raw = raw
        pending = None
    else:
        items_raw = []
        pending = None
    items = [ApprovalItem.model_validate(i) for i in (items_raw or [])][:limit]
    if pending is None:
        pending = len(items)
    return ApprovalsResponse(items=items, pending_count=int(pending))


def _as_tbt(raw: Any, unread_only: bool, limit: int) -> TbtNotificationsResponse | None:
    """Map Frappe TBT payload to contract shape; return None if unusable."""
    if isinstance(raw, dict):
        items_raw = raw.get("items", [])
        new_count = raw.get("new_count")
    elif isinstance(raw, list):
        items_raw = raw
        new_count = None
    else:
        return None
    if not items_raw:
        return None
    items: list[TbtNotificationSummary] = []
    for row in items_raw:
        if not isinstance(row, dict):
            continue
        try:
            if "symbol" in row and "impact" in row and "unread" in row:
                items.append(TbtNotificationSummary.model_validate(row))
                continue
            # Adapt eswasa_tbt.api.list_notifications stub shape
            nid = str(row.get("id") or row.get("name") or "")
            if not nid:
                continue
            impact_raw = str(row.get("impact") or "medium").lower()
            impact = impact_raw if impact_raw in ("high", "medium", "low") else "medium"
            unread = bool(row.get("unread", row.get("status") != "Read"))
            items.append(
                TbtNotificationSummary(
                    id=nid,
                    symbol=str(row.get("symbol") or nid),
                    title=str(row.get("title") or ""),
                    impact=impact,  # type: ignore[arg-type]
                    unread=unread,
                    published_at=row.get("published_at") or row.get("published_on"),
                )
            )
        except ValidationError:
            continue
    if not items:
        return None
    if new_count is None:
        new_count = sum(1 for i in items if i.unread)
    if unread_only:
        items = [i for i in items if i.unread]
    return TbtNotificationsResponse(items=items[:limit], new_count=int(new_count))


def _finance_with_mock_months(raw: Any) -> FinanceDashboard:
    """Validate FinanceDashboard; fill months from mock when Frappe omits them."""
    data = raw if isinstance(raw, dict) else {}
    months_raw = data.get("months") if isinstance(data, dict) else None
    months_empty = (
        not months_raw
        or not isinstance(months_raw, dict)
        or not months_raw.get("budget_thousands")
        or not months_raw.get("actual_thousands")
    )
    if months_empty:
        mock_m = mocks.mock_finance_months()
        data = {
            **data,
            "months": mock_m.model_dump(),
            "revenue_ytd_szl": data.get("revenue_ytd_szl")
            if data.get("revenue_ytd_szl") is not None
            else sum(mock_m.actual_thousands) * 1000.0,
            "budget_ytd_szl": data.get("budget_ytd_szl")
            if data.get("budget_ytd_szl") is not None
            else sum(mock_m.budget_thousands) * 1000.0,
            "variance_pct": data.get("variance_pct")
            if data.get("variance_pct") is not None
            else round(
                (
                    (
                        (data.get("revenue_ytd_szl") or sum(mock_m.actual_thousands) * 1000.0)
                        - (data.get("budget_ytd_szl") or sum(mock_m.budget_thousands) * 1000.0)
                    )
                    / (data.get("budget_ytd_szl") or sum(mock_m.budget_thousands) * 1000.0)
                )
                * 100.0,
                1,
            ),
            "plan": data.get("plan") or mocks.mock_finance_kpis().plan,
        }
    return FinanceDashboard.model_validate(data)


def _as_metrology_jobs(raw: Any, status: str | None, limit: int) -> list[MetrologyJobSummary]:
    if isinstance(raw, dict) and "items" in raw:
        items_raw = raw["items"]
    elif isinstance(raw, list):
        items_raw = raw
    else:
        items_raw = []
    items: list[MetrologyJobSummary] = []
    for row in items_raw or []:
        try:
            items.append(MetrologyJobSummary.model_validate(row))
        except ValidationError:
            if isinstance(row, dict) and row.get("id") and row.get("instrument"):
                items.append(
                    MetrologyJobSummary(
                        id=str(row["id"]),
                        instrument=str(row["instrument"]),
                        customer=row.get("customer"),
                        status=str(row.get("status") or "Unknown"),
                        due_date=row.get("due_date"),
                    )
                )
    if status:
        items = [i for i in items if i.status.lower() == status.lower()]
    return items[:limit]


@router.get("/approvals", response_model=ApprovalsResponse, tags=["approvals"])
async def list_approvals(
    auth: Annotated[AuthContext, Depends(require_staff)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> ApprovalsResponse:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable: approvals require live Workflow Action queue")
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_governance.api.list_approvals",
            params={"limit": limit},
        )
        return _as_approvals(raw, limit)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="Approvals unavailable")


class ActApprovalBody(BaseModel):
    action: str
    confirm: bool
    comment: str | None = None


@router.post("/approvals/{doctype}/{name}/act", tags=["approvals"])
async def act_on_approval(
    doctype: str,
    name: str,
    body: ActApprovalBody,
    auth: Annotated[AuthContext, Depends(require_staff)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm must be true",
        )
    action = body.action.strip().lower()
    if action not in ("approve", "reject", "return"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="action must be approve, reject, or return",
        )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    audit_log(
        action="approval.act",
        actor=auth.user.username,
        resource=f"{doctype}:{name}",
        confirmed=True,
        detail={"action": action, "comment": body.comment},
    )
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_governance.api.act_on_approval",
            json={
                "doctype": doctype,
                "name": name,
                "action": action,
                "comment": body.comment,
                "confirm": True,
            },
        )
        if isinstance(raw, dict):
            return {
                "ok": bool(raw.get("ok", True)),
                "doctype": doctype,
                "name": name,
                "action": action,
                "message": raw.get("message") or f"Recorded {action} for {doctype} {name}",
            }
        return {
            "ok": True,
            "doctype": doctype,
            "name": name,
            "action": action,
            "message": f"Recorded {action} for {doctype} {name}",
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Approval act failed")


# --- Organisation / Staff --------------------------------------------------------


class ReassignBody(BaseModel):
    to_user: str
    comment: str | None = None
    confirm: bool


@router.get("/org/staff", tags=["org"])
async def list_staff(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    q: str | None = None,
    role: str | None = None,
    limit: int = 50,
) -> dict[str, list[dict[str, Any]]]:
    """List Institution staff users for assignment pickers.

    Returns Frappe Users with staff roles (excludes Guest/Citizen),
    optionally filtered by search query and/or role.
    """
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    # Fetch enabled users, excluding Guest (Administrator IS a valid assignee)
    filters: list[Any] = [["enabled", "=", 1], ["name", "!=", "Guest"]]
    if q:
        filters.append(["full_name", "like", f"%{q}%"])
    try:
        rows = await _frappe_get_list(
            session,
            "User",
            fields=["name", "username", "full_name", "email", "enabled"],
            filters=filters,
            limit=limit,
            order_by="full_name asc",
        )
    except FrappeError as exc:
        _raise_from_frappe(exc)

    # Fetch roles for each user and filter to staff roles
    # Show users with any non-Guest/Citizen role, OR users with no roles
    # (they may be newly created staff not yet assigned roles)
    items: list[dict[str, Any]] = []
    for row in rows:
        username = str(row.get("username") or row.get("name") or "")
        full_name = str(row.get("full_name") or username)
        email = row.get("email")
        # Fetch roles via Has Role table
        try:
            role_rows = await _frappe_get_list(
                session,
                "Has Role",
                fields=["role"],
                filters=[["parent", "=", row.get("name")], ["role", "!=", "Guest"], ["role", "!=", "Citizen"], ["role", "!=", "All"]],
                limit=30,
            )
            roles = [str(r.get("role")) for r in role_rows if r.get("role")]
        except FrappeError:
            roles = []

        # Skip users with no staff roles (e.g. Citizens with only Citizen role)
        if roles and not any(r not in ("Guest", "Citizen", "All", "Newsletter Reader") for r in roles):
            continue

        # Filter by role if requested
        if role and role not in roles:
            continue

        initials = "".join([w[0] for w in full_name.split()[:2]]).upper()[:2] or username[:2].upper()
        items.append({
            "username": username,
            "full_name": full_name,
            "email": email,
            "roles": roles,
            "department": None,
            "designation": None,
            "avatar_initials": initials,
            "enabled": True,
        })
    return {"items": items}


@router.post("/approvals/{doctype}/{name}/reassign", tags=["approvals"])
async def reassign_approval(
    doctype: str,
    name: str,
    body: ReassignBody,
    auth: Annotated[AuthContext, Depends(require_staff)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Reassign a queue item's ToDo to another staff member.

    Updates the `allocated_to` field on open ToDo(s) linked to the
    given doctype/name, creating an audit trail. Does NOT trigger a
    workflow transition — the document itself stays in its current state.
    """
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm must be true",
        )
    to_user = body.to_user.strip()
    if not to_user:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to_user is required",
        )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    audit_log(
        action="approval.reassign",
        actor=auth.user.username,
        resource=f"{doctype}:{name}",
        confirmed=True,
        detail={"to_user": to_user, "comment": body.comment},
    )
    try:
        session = auth.frappe(frappe)
        # Verify target user exists and is enabled
        user_check = await _frappe_get_list(
            session,
            "User",
            fields=["name", "username", "enabled"],
            filters=[["username", "=", to_user], ["enabled", "=", 1]],
            limit=1,
        )
        if not user_check:
            # Try by name (Frappe User.name is often the email)
            user_check = await _frappe_get_list(
                session,
                "User",
                fields=["name", "username", "enabled"],
                filters=[["name", "=", to_user], ["enabled", "=", 1]],
                limit=1,
            )
        if not user_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User '{to_user}' not found or disabled",
            )

        target_name = str(user_check[0].get("name") or to_user)

        # Find open ToDos for this doctype/name
        todos = await _frappe_get_list(
            session,
            "ToDo",
            fields=["name", "allocated_to", "description"],
            filters=[
                ["status", "=", "Open"],
                ["reference_type", "=", doctype],
                ["reference_name", "=", name],
            ],
            limit=20,
        )

        if not todos:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No open tasks for {doctype} {name}",
            )

        # Update each ToDo's allocated_to
        updated = 0
        for todo in todos:
            try:
                await session.method(
                    "frappe.client.set_value",
                    json={
                        "doctype": "ToDo",
                        "name": todo.get("name"),
                        "fieldname": "allocated_to",
                        "value": target_name,
                    },
                )
                updated += 1
            except FrappeError:
                logger.warning("Failed to reassign ToDo %s", todo.get("name"))

        # Add a comment if provided
        if body.comment:
            try:
                await session.method(
                    "frappe.client.insert",
                    json={
                        "doc": {
                            "doctype": "Comment",
                            "comment_type": "Info",
                            "reference_doctype": doctype,
                            "reference_name": name,
                            "content": f"[{auth.user.username}] Reassigned to {to_user}: {body.comment}",
                        }
                    },
                )
            except FrappeError:
                pass

        return {
            "ok": True,
            "to_user": to_user,
            "message": f"Reassigned {updated} task(s) on {doctype} {name} to {to_user}",
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Reassign failed")


@router.get(
    "/tbt/alerts",
    response_model=TbtNotificationsResponse,
    tags=["tbt"],
)
async def list_tbt_alerts(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    unread_only: bool = False,
    limit: int = 20,
) -> TbtNotificationsResponse:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_tbt.api.list_notifications",
            params={"limit": limit},
        )
        mapped = _as_tbt(raw, unread_only, limit)
        if mapped is None:
            return TbtNotificationsResponse(items=[], new_count=0)
        return mapped
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="TBT alerts unavailable")


@router.get("/finance/kpis", response_model=FinanceDashboard, tags=["finance"])
async def get_finance_kpis(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> FinanceDashboard:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method("eswasa_governance.api.finance_kpis")
        return FinanceDashboard.model_validate(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="Finance KPIs unavailable")


@router.get("/finance/settings", response_model=FinanceSettings, tags=["finance"])
async def get_finance_settings(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> FinanceSettings:
    """Finance department configuration checklist (Company, CoA, cost centres, Pastel stub)."""
    if auth.mock or not await frappe.health():
        return FinanceSettings(
            steps=[
                FinanceSetupStep(
                    id="company",
                    label="Company profile",
                    done=False,
                    href="/admin?tab=company",
                ),
                FinanceSetupStep(
                    id="coa",
                    label="Chart of accounts",
                    done=False,
                    href=None,
                ),
                FinanceSetupStep(
                    id="cost_centres",
                    label="Cost centres",
                    done=False,
                    href="/hr/structure?tab=cost-centres",
                ),
                FinanceSetupStep(
                    id="fiscal_year",
                    label="Fiscal year",
                    done=False,
                    href=None,
                ),
                FinanceSetupStep(
                    id="pastel",
                    label="Sage Pastel ledger link",
                    done=False,
                    href=None,
                ),
                FinanceSetupStep(
                    id="payments",
                    label="Payment gateway",
                    done=False,
                    href=None,
                ),
            ],
        )
    session = auth.frappe(frappe)
    company = await _load_company(session)
    company_id = str(company.get("name") or "") if company else None
    company_name = None
    currency = None
    country = None
    if company:
        company_name = str(
            company.get("company_name") or company.get("name") or ""
        ) or None
        currency = company.get("default_currency")
        country = company.get("country")

    accounts: list[dict[str, Any]] = []
    cost_centres: list[dict[str, Any]] = []
    fiscal: list[dict[str, Any]] = []
    if company_id:
        accounts = await _frappe_get_list(
            session,
            "Account",
            fields=["name"],
            filters=[["company", "=", company_id]],
            limit=5,
            soft=True,
        )
        cost_centres = await _frappe_get_list(
            session,
            "Cost Center",
            fields=["name"],
            filters=[["company", "=", company_id], ["is_group", "=", 0]],
            limit=5,
            soft=True,
        )
        fiscal = await _frappe_get_list(
            session,
            "Fiscal Year",
            fields=["name"],
            limit=3,
            soft=True,
        )

    has_coa = bool(accounts)
    has_cc = bool(cost_centres)
    has_fy = bool(fiscal)
    return FinanceSettings(
        company_id=company_id,
        company_name=company_name,
        default_currency=str(currency) if currency else None,
        country=str(country) if country else None,
        has_chart_of_accounts=has_coa,
        has_cost_centres=has_cc,
        has_fiscal_year=has_fy,
        pastel_status="not_configured",
        payment_gateway_status="not_configured",
        steps=[
            FinanceSetupStep(
                id="company",
                label="Company profile",
                done=bool(company_id),
                href="/admin?tab=company",
            ),
            FinanceSetupStep(
                id="coa",
                label="Chart of accounts",
                done=has_coa,
                href=None,
            ),
            FinanceSetupStep(
                id="cost_centres",
                label="Cost centres",
                done=has_cc,
                href="/hr/structure?tab=cost-centres",
            ),
            FinanceSetupStep(
                id="fiscal_year",
                label="Fiscal year",
                done=has_fy,
                href=None,
            ),
            FinanceSetupStep(
                id="pastel",
                label="Sage Pastel ledger link",
                done=False,
                href=None,
            ),
            FinanceSetupStep(
                id="payments",
                label="Payment gateway",
                done=False,
                href=None,
            ),
        ],
    )


@router.get("/hr/summary", response_model=HrSummary, tags=["hr"])
async def get_hr_summary(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrSummary:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        raw = await session.method("eswasa_governance.api.hr_summary")
        return HrSummary.model_validate(raw)
    except FrappeError as exc:
        text = str(exc)
        if (
            "PermissionError" in text
            or "Insufficient Permission" in text
            or "DoesNotExistError" in text
            or "not found" in text.lower()
            or "AttributeError" in text
        ):
            return await _aggregate_hr_summary(session)
        _raise_from_frappe(exc)
    except ValidationError:
        return await _aggregate_hr_summary(session)
    raise HTTPException(status_code=502, detail="HR summary unavailable")


@router.get("/hr/overview", response_model=HrSummary, tags=["hr"])
async def get_hr_overview(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrSummary:
    """Alias of GET /hr/summary — aggregates from HRMS DocTypes."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        return await _aggregate_hr_summary(auth.frappe(frappe))
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


# --- HR organisation / structure --------------------------------------------

_EMPLOYEE_GRADE_DOCTYPE = "Employee Grade"
_DEPT_HEAD_FIELD_CANDIDATES = ("department_head", "custom_department_head")


def _empty_org_overview() -> HrOrganisationOverview:
    setup = HrSetupProgress(
        has_profile=False,
        has_departments=False,
        has_designations=False,
        has_locations=False,
        has_grades=False,
        has_cost_centres=False,
        has_employees=False,
        completion_pct=0.0,
        steps_completed=0,
        steps_total=7,
    )
    return HrOrganisationOverview(
        organisation=None,
        setup=setup,
        counts=HrOrganisationCounts(
            departments=0,
            designations=0,
            filled_positions=0,
            vacant_positions=0,
            locations=0,
            cost_centres=0,
            employees=0,
        ),
        departments=[],
        designations_preview=[],
        designations_total=0,
        locations=[],
        cost_centres=[],
        payroll=HrPayrollReadiness(
            ready=False,
            label="Not ready",
            reason="Missing grades, cost centres, or employees",
        ),
    )


def _as_hr_organisation(row: dict[str, Any]) -> HrOrganisation:
    name = str(row.get("name") or row.get("id") or "")
    legal = str(
        row.get("company_name")
        or row.get("legal_name")
        or row.get("name")
        or ""
    )
    founded: int | None = None
    raw_year = row.get("date_of_establishment") or row.get("founded_year")
    if raw_year is not None:
        try:
            founded = int(str(raw_year)[:4])
        except (TypeError, ValueError):
            founded = None
    primary_id = row.get("primary_location_id") or row.get("default_branch")
    primary_loc: HrLocationRef | None = None
    if primary_id:
        primary_loc = HrLocationRef(id=str(primary_id), name=str(primary_id), code=None)
    return HrOrganisation(
        id=name,
        legal_name=legal,
        registration_number=row.get("registration_details")
        or row.get("tax_id")
        or row.get("registration_number"),
        founded_year=founded,
        sector=row.get("domain") or row.get("sector"),
        registered_address=row.get("address")
        or row.get("company_address")
        or row.get("registered_address"),
        primary_location_id=str(primary_id) if primary_id else None,
        primary_location=primary_loc,
    )


def _as_hr_department(
    row: dict[str, Any],
    *,
    filled: int = 0,
    designation_count: int = 0,
    head: HrEmployeeRef | None = None,
    cost_centre: HrCostCentreRef | None = None,
) -> HrDepartment:
    disabled = row.get("disabled")
    status: Literal["active", "archived"] = (
        "archived" if disabled in (1, True, "1") else "active"
    )
    parent = row.get("parent_department") or row.get("parent_department_id")
    head_ref = head
    if head_ref is None:
        head_id = None
        for field in _DEPT_HEAD_FIELD_CANDIDATES:
            if row.get(field):
                head_id = str(row[field])
                break
        if head_id:
            head_name = str(row.get("department_head_name") or head_id)
            head_ref = HrEmployeeRef(
                id=head_id,
                name=head_name,
                initials=_hr_initials(head_name) or None,
            )
    cc = cost_centre
    if cc is None:
        cc_id = row.get("payroll_cost_center") or row.get("cost_center") or row.get("cost_centre_id")
        if cc_id:
            cc_name = str(cc_id)
            cc = HrCostCentreRef(id=str(cc_id), code=str(cc_id), name=cc_name)
    return HrDepartment(
        id=str(row.get("name") or row.get("id") or ""),
        name=str(row.get("department_name") or row.get("name") or ""),
        code=row.get("abbr") or row.get("code"),
        parent_department_id=str(parent) if parent else None,
        head=head_ref,
        cost_centre=cc,
        status=status,
        designation_count=designation_count,
        filled_count=filled,
        total_positions=filled,
    )


def _as_hr_designation(
    row: dict[str, Any],
    *,
    filled: int = 0,
    department: HrDepartmentRef | None = None,
    grade_band: HrGradeBandRef | None = None,
) -> HrDesignation:
    title = str(row.get("designation_name") or row.get("title") or row.get("name") or "")
    dept = department
    if dept is None and row.get("department"):
        d = str(row["department"])
        dept = HrDepartmentRef(id=d, name=d, code=None)
    grade = grade_band
    if grade is None and (row.get("grade") or row.get("employee_grade")):
        g = str(row.get("grade") or row.get("employee_grade"))
        grade = HrGradeBandRef(id=g, code=g, name=g, level=None)
    total = row.get("approved_headcount") or row.get("total")
    try:
        total_i = int(total) if total is not None else None
    except (TypeError, ValueError):
        total_i = None
    return HrDesignation(
        id=str(row.get("name") or row.get("id") or ""),
        title=title,
        code=row.get("code") or row.get("abbr"),
        description=row.get("description"),
        department=dept,
        grade_band=grade,
        filled=filled,
        total=total_i,
    )


def _as_hr_grade_band(row: dict[str, Any]) -> HrGradeBand:
    code = str(row.get("name") or row.get("code") or "")
    return HrGradeBand(
        id=code,
        code=code,
        name=row.get("description") or row.get("name") or code or None,
        level=row.get("level"),
        min_salary=_as_optional_float(row.get("min_salary") or row.get("default_base_pay")),
        max_salary=_as_optional_float(row.get("max_salary")),
        currency=row.get("currency") or "SZL",
    )


def _as_optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_hr_location(row: dict[str, Any], *, employee_count: int = 0) -> HrLocation:
    disabled = row.get("disabled")
    status: Literal["active", "closed"] = (
        "closed" if disabled in (1, True, "1") else "active"
    )
    loc_type = row.get("type") or row.get("custom_location_type")
    if loc_type not in ("hq", "lab", "satellite", None):
        loc_type = None
    return HrLocation(
        id=str(row.get("name") or row.get("id") or ""),
        name=str(row.get("branch") or row.get("name") or ""),
        code=row.get("code") or row.get("abbr"),
        address=row.get("address") or row.get("custom_address"),
        type=loc_type,
        status=status,
        employee_count=employee_count,
    )


def _as_hr_cost_centre(row: dict[str, Any], *, employee_count: int = 0) -> HrCostCentre:
    disabled = row.get("disabled")
    if disabled in (1, True, "1"):
        status: Literal["active", "draft", "archived"] = "archived"
    else:
        status = "active"
    name = str(row.get("cost_center_name") or row.get("name") or "")
    code = row.get("code") or (name.split(" - ")[0] if " - " in name else name) or None
    return HrCostCentre(
        id=str(row.get("name") or row.get("id") or ""),
        name=name,
        code=str(code) if code else None,
        description=row.get("description"),
        finance_account_code=row.get("account") or row.get("finance_account_code"),
        status=status,
        employee_count=employee_count,
    )


def _compute_setup(
    *,
    has_profile: bool,
    has_departments: bool,
    has_designations: bool,
    has_locations: bool,
    has_grades: bool,
    has_cost_centres: bool,
    has_employees: bool,
) -> HrSetupProgress:
    flags = (
        has_profile,
        has_departments,
        has_designations,
        has_locations,
        has_grades,
        has_cost_centres,
        has_employees,
    )
    done = sum(1 for f in flags if f)
    total = 7
    return HrSetupProgress(
        has_profile=has_profile,
        has_departments=has_departments,
        has_designations=has_designations,
        has_locations=has_locations,
        has_grades=has_grades,
        has_cost_centres=has_cost_centres,
        has_employees=has_employees,
        completion_pct=round(100.0 * done / total, 1) if total else 0.0,
        steps_completed=done,
        steps_total=total,
    )


def _payroll_readiness(
    *,
    has_grades: bool,
    has_cost_centres: bool,
    employees: int,
) -> HrPayrollReadiness:
    ready = has_grades and has_cost_centres and employees > 0
    if ready:
        return HrPayrollReadiness(ready=True, label="Ready", reason=None)
    missing: list[str] = []
    if not has_grades:
        missing.append("grade bands")
    if not has_cost_centres:
        missing.append("cost centres")
    if employees <= 0:
        missing.append("employees")
    return HrPayrollReadiness(
        ready=False,
        label="Not ready",
        reason="Missing " + ", ".join(missing),
    )


async def _frappe_delete(session: FrappeClient, doctype: str, name: str) -> None:
    try:
        await session.method(
            "frappe.client.delete",
            json={"doctype": doctype, "name": name},
        )
    except FrappeError as exc:
        text = str(exc)
        if "LinkExistsError" in text or "is linked" in text.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{doctype} is still referenced and cannot be deleted",
            ) from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


async def _load_company(session: FrappeClient) -> dict[str, Any] | None:
    rows = await _frappe_get_list(
        session,
        "Company",
        fields=[
            "name",
            "company_name",
            "abbr",
            "domain",
            "date_of_establishment",
            "tax_id",
            "default_currency",
        ],
        limit=1,
        order_by="creation asc",
        soft=True,
    )
    if not rows:
        return None
    name = str(rows[0].get("name") or "")
    if not name:
        return rows[0]
    doc = await _frappe_get_doc(session, "Company", name, soft=True)
    return doc or rows[0]


async def _aggregate_org_overview(session: FrappeClient) -> HrOrganisationOverview:
    company = await _load_company(session)
    organisation = _as_hr_organisation(company) if company else None

    dept_rows = await _frappe_get_list(
        session,
        "Department",
        fields=[
            "name",
            "department_name",
            "parent_department",
            "company",
            "disabled",
            "payroll_cost_center",
        ],
        limit=200,
        order_by="department_name asc",
        soft=True,
    )
    desig_rows = await _frappe_get_list(
        session,
        "Designation",
        fields=["name", "designation_name", "description"],
        limit=200,
        order_by="designation_name asc",
        soft=True,
    )
    loc_rows = await _frappe_get_list(
        session,
        "Branch",
        fields=["name", "branch", "company"],
        limit=100,
        order_by="name asc",
        soft=True,
    )
    cc_rows = await _frappe_get_list(
        session,
        "Cost Center",
        fields=["name", "cost_center_name", "company", "disabled", "is_group", "parent_cost_center"],
        filters=[["is_group", "=", 0]],
        limit=200,
        order_by="name asc",
        soft=True,
    )
    grade_rows = await _frappe_get_list(
        session,
        _EMPLOYEE_GRADE_DOCTYPE,
        fields=["name", "description"],
        limit=100,
        order_by="name asc",
        soft=True,
    )
    employees = await _frappe_get_list(
        session,
        "Employee",
        fields=["name", "department", "designation", "branch", "status", "grade", "payroll_cost_center"],
        filters=[["status", "=", "Active"]],
        limit=500,
        soft=True,
    )

    filled_by_dept: dict[str, int] = {}
    filled_by_desig: dict[str, int] = {}
    filled_by_loc: dict[str, int] = {}
    filled_by_cc: dict[str, int] = {}
    for emp in employees:
        d = emp.get("department")
        if d:
            filled_by_dept[str(d)] = filled_by_dept.get(str(d), 0) + 1
        des = emp.get("designation")
        if des:
            filled_by_desig[str(des)] = filled_by_desig.get(str(des), 0) + 1
        br = emp.get("branch")
        if br:
            filled_by_loc[str(br)] = filled_by_loc.get(str(br), 0) + 1
        cc = emp.get("payroll_cost_center")
        if cc:
            filled_by_cc[str(cc)] = filled_by_cc.get(str(cc), 0) + 1

    departments = [
        _as_hr_department(
            r,
            filled=filled_by_dept.get(str(r.get("name") or ""), 0),
        )
        for r in dept_rows
    ]
    designations = [
        _as_hr_designation(
            r,
            filled=filled_by_desig.get(str(r.get("name") or ""), 0),
        )
        for r in desig_rows
    ]
    locations = [
        _as_hr_location(
            r,
            employee_count=filled_by_loc.get(str(r.get("name") or ""), 0),
        )
        for r in loc_rows
    ]
    cost_centres = [
        _as_hr_cost_centre(
            r,
            employee_count=filled_by_cc.get(str(r.get("name") or ""), 0),
        )
        for r in cc_rows
    ]

    emp_count = len(employees)
    has_grades = len(grade_rows) > 0
    has_cc = len(cost_centres) > 0
    filled_positions = emp_count
    vacant = 0
    for d in designations:
        if d.total is not None and d.total > d.filled:
            vacant += d.total - d.filled

    setup = _compute_setup(
        has_profile=organisation is not None,
        has_departments=len(departments) > 0,
        has_designations=len(designations) > 0,
        has_locations=len(locations) > 0,
        has_grades=has_grades,
        has_cost_centres=has_cc,
        has_employees=emp_count > 0,
    )
    return HrOrganisationOverview(
        organisation=organisation,
        setup=setup,
        counts=HrOrganisationCounts(
            departments=len(departments),
            designations=len(designations),
            filled_positions=filled_positions,
            vacant_positions=vacant,
            locations=len(locations),
            cost_centres=len(cost_centres),
            employees=emp_count,
        ),
        departments=departments,
        designations_preview=designations[:6],
        designations_total=len(designations),
        locations=locations,
        cost_centres=cost_centres,
        payroll=_payroll_readiness(
            has_grades=has_grades,
            has_cost_centres=has_cc,
            employees=emp_count,
        ),
    )


@router.get(
    "/hr/organisation/overview",
    response_model=HrOrganisationOverview,
    tags=["hr"],
)
async def get_hr_organisation_overview(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOrganisationOverview:
    """Structure-first HR home — soft-empty when Frappe/DocTypes unavailable."""
    if auth.mock or not await frappe.health():
        return _empty_org_overview()
    try:
        return await _aggregate_org_overview(auth.frappe(frappe))
    except FrappeError:
        # Soft-empty: missing Company / DocTypes / odd Desk errors must not blank HR home.
        return _empty_org_overview()
    except ValidationError:
        return _empty_org_overview()


@router.get("/hr/organisation", response_model=HrOrganisation, tags=["hr"])
async def get_hr_organisation(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOrganisation:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=404, detail="No Company configured")
    try:
        company = await _load_company(auth.frappe(frappe))
        if not company:
            raise HTTPException(status_code=404, detail="No Company configured")
        return _as_hr_organisation(company)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


def _company_abbr(legal_name: str, abbr: str | None) -> str:
    if abbr and abbr.strip():
        return abbr.strip().upper()[:10]
    parts = [p for p in legal_name.replace("-", " ").split() if p]
    if len(parts) >= 2:
        return "".join(p[0] for p in parts[:4]).upper()
    return (legal_name[:3] or "ORG").upper()


@router.post(
    "/hr/organisation",
    response_model=HrOrganisation,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_organisation(
    body: HrOrganisationCreate,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOrganisation:
    """Create the Frappe Company singleton (confirm-before-commit)."""
    _require_confirm(body.confirm)
    legal = (body.legal_name or "").strip()
    if not legal:
        raise HTTPException(status_code=422, detail="legal_name required")
    audit_log(
        action="hr.organisation.create",
        actor=auth.user.username,
        resource="Company",
        detail={"legal_name": legal},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    existing = await _load_company(session)
    if existing and existing.get("name"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company already exists ({existing.get('name')}). Edit the organisation profile instead.",
        )
    abbr = _company_abbr(legal, body.abbr)
    doc: dict[str, Any] = {
        "doctype": "Company",
        "company_name": legal,
        "abbr": abbr,
        "default_currency": (body.default_currency or "SZL").strip().upper(),
        "country": (body.country or "Eswatini").strip(),
    }
    if body.sector:
        doc["domain"] = body.sector.strip()
    if body.registration_number:
        doc["tax_id"] = body.registration_number.strip()
    if body.founded_year is not None:
        doc["date_of_establishment"] = f"{int(body.founded_year)}-01-01"
    if body.registered_address:
        doc["company_description"] = body.registered_address.strip()
    try:
        created = await _frappe_insert(session, doc)
    except HTTPException:
        raise
    name = str(created.get("name") or legal)
    refreshed = await _frappe_get_doc(session, "Company", name, soft=True) or created
    return _as_hr_organisation(refreshed)


@router.patch("/hr/organisation", response_model=HrOrganisation, tags=["hr"])
async def patch_hr_organisation(
    body: HrOrganisationPatch,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOrganisation:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.organisation.patch",
        actor=auth.user.username,
        resource="Company",
        detail={"legal_name": body.legal_name},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    company = await _load_company(session)
    if not company or not company.get("name"):
        raise HTTPException(status_code=404, detail="No Company configured")
    name = str(company["name"])
    updates: dict[str, Any] = {}
    if body.legal_name is not None:
        updates["company_name"] = body.legal_name
    if body.registered_address is not None:
        # TODO: Company address is often a Link to Address — store best-effort on free-text if present
        updates["company_description"] = body.registered_address
    if body.sector is not None:
        updates["domain"] = body.sector
    if body.registration_number is not None:
        updates["tax_id"] = body.registration_number
    if body.founded_year is not None:
        updates["date_of_establishment"] = f"{body.founded_year}-01-01"
    # primary_location_id / registration extras — no standard Company field; leave nullable
    if not updates:
        return _as_hr_organisation(company)
    try:
        await _frappe_set_value(session, "Company", name, updates)
        refreshed = await _frappe_get_doc(session, "Company", name) or {
            **company,
            **updates,
            "name": name,
        }
        return _as_hr_organisation(refreshed)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/departments", tags=["hr"])
async def list_hr_departments(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 100,
) -> dict[str, list[HrDepartment]]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        session = auth.frappe(frappe)
        rows = await _frappe_get_list(
            session,
            "Department",
            fields=[
                "name",
                "department_name",
                "parent_department",
                "company",
                "disabled",
                "payroll_cost_center",
            ],
            limit=limit,
            order_by="department_name asc",
            soft=True,
        )
        employees = await _frappe_get_list(
            session,
            "Employee",
            fields=["name", "department"],
            filters=[["status", "=", "Active"]],
            limit=500,
            soft=True,
        )
        filled: dict[str, int] = {}
        for emp in employees:
            d = emp.get("department")
            if d:
                filled[str(d)] = filled.get(str(d), 0) + 1
        return {
            "items": [
                _as_hr_department(r, filled=filled.get(str(r.get("name") or ""), 0))
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/departments",
    response_model=HrDepartment,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_department(
    body: HrDepartmentCreate,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrDepartment:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.department.create",
        actor=auth.user.username,
        resource="Department",
        detail={"name": body.name, "code": body.code},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    doc: dict[str, Any] = {
        "doctype": "Department",
        "department_name": body.name,
    }
    if body.parent_department_id:
        doc["parent_department"] = body.parent_department_id
    if body.cost_centre_id:
        doc["payroll_cost_center"] = body.cost_centre_id
    # body.code — no standard abbr on Department; omit (TODO: custom field)
    company = await _load_company(session)
    if company and company.get("name"):
        doc["company"] = company["name"]
    try:
        raw = await _frappe_insert(session, doc)
        return _as_hr_department(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.patch("/hr/departments/{department_id}", response_model=HrDepartment, tags=["hr"])
async def patch_hr_department(
    department_id: str,
    body: HrDepartmentPatch,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrDepartment:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.department.patch",
        actor=auth.user.username,
        resource=f"Department:{department_id}",
        detail={"name": body.name},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["department_name"] = body.name
    if body.parent_department_id is not None:
        updates["parent_department"] = body.parent_department_id or ""
    if body.cost_centre_id is not None:
        updates["payroll_cost_center"] = body.cost_centre_id or ""
    if body.status == "archived":
        updates["disabled"] = 1
    elif body.status == "active":
        updates["disabled"] = 0
    try:
        if updates:
            await _frappe_set_value(session, "Department", department_id, updates)
        raw = await _frappe_get_doc(session, "Department", department_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Department not found")
        return _as_hr_department(raw)
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(status_code=404, detail="Department not found") from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.delete(
    "/hr/departments/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["hr"],
)
async def delete_hr_department(
    department_id: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    confirm: bool = False,
) -> None:
    _require_confirm(confirm)
    audit_log(
        action="hr.department.delete",
        actor=auth.user.username,
        resource=f"Department:{department_id}",
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    await _frappe_delete(auth.frappe(frappe), "Department", department_id)


@router.post("/hr/departments/{department_id}/head", response_model=HrDepartment, tags=["hr"])
async def assign_hr_department_head(
    department_id: str,
    body: HrDepartmentHeadBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrDepartment:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.department.head.assign",
        actor=auth.user.username,
        resource=f"Department:{department_id}",
        detail={"employee_id": body.employee_id},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    raw = await _frappe_get_doc(session, "Department", department_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Department not found")
    set_ok = False
    for field in _DEPT_HEAD_FIELD_CANDIDATES:
        try:
            await _frappe_set_value(
                session, "Department", department_id, field, body.employee_id
            )
            set_ok = True
            raw[field] = body.employee_id
            break
        except HTTPException as exc:
            if exc.status_code == 403:
                raise
            continue
        except FrappeError:
            continue
    if not set_ok:
        # TODO: wire real — standard Frappe Department has no department_head;
        # leave_block_list is unrelated. Prefer custom field or reports_to graph.
        logger.info(
            "department head field unavailable on %s; returning department without persist",
            department_id,
        )
    emp = await _frappe_get_doc(session, "Employee", body.employee_id, soft=True)
    head = None
    if emp:
        ename = str(emp.get("employee_name") or emp.get("name") or body.employee_id)
        head = HrEmployeeRef(
            id=str(emp.get("name") or body.employee_id),
            name=ename,
            initials=_hr_initials(ename) or None,
        )
    else:
        head = HrEmployeeRef(id=body.employee_id, name=body.employee_id)
    refreshed = await _frappe_get_doc(session, "Department", department_id) or raw
    return _as_hr_department(refreshed, head=head)


@router.delete("/hr/departments/{department_id}/head", response_model=HrDepartment, tags=["hr"])
async def clear_hr_department_head(
    department_id: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    confirm: bool = False,
) -> HrDepartment:
    _require_confirm(confirm)
    audit_log(
        action="hr.department.head.clear",
        actor=auth.user.username,
        resource=f"Department:{department_id}",
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    raw = await _frappe_get_doc(session, "Department", department_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Department not found")
    for field in _DEPT_HEAD_FIELD_CANDIDATES:
        if field in raw:
            try:
                await _frappe_set_value(session, "Department", department_id, field, "")
                raw[field] = None
            except (HTTPException, FrappeError):
                pass
            break
    refreshed = await _frappe_get_doc(session, "Department", department_id) or raw
    return _as_hr_department(refreshed, head=None)


@router.get("/hr/designations", tags=["hr"])
async def list_hr_designations(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    department_id: str | None = None,
    limit: int = 100,
) -> dict[str, list[HrDesignation]]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        session = auth.frappe(frappe)
        rows = await _frappe_get_list(
            session,
            "Designation",
            fields=["name", "designation_name", "description"],
            limit=limit,
            order_by="designation_name asc",
            soft=True,
        )
        employees = await _frappe_get_list(
            session,
            "Employee",
            fields=["name", "designation", "department"],
            filters=[["status", "=", "Active"]],
            limit=500,
            soft=True,
        )
        filled: dict[str, int] = {}
        dept_hint: dict[str, str] = {}
        for emp in employees:
            des = emp.get("designation")
            if des:
                key = str(des)
                filled[key] = filled.get(key, 0) + 1
                if emp.get("department") and key not in dept_hint:
                    dept_hint[key] = str(emp["department"])
        items: list[HrDesignation] = []
        for r in rows:
            rid = str(r.get("name") or "")
            # Designation has no department field — filter via employee occupancy hint.
            if department_id:
                hinted = dept_hint.get(rid)
                if hinted != department_id:
                    continue
            dept_ref = None
            if rid in dept_hint:
                d = dept_hint[rid]
                dept_ref = HrDepartmentRef(id=d, name=d)
            items.append(
                _as_hr_designation(
                    r,
                    filled=filled.get(rid, 0),
                    department=dept_ref,
                )
            )
        return {"items": items}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/designations",
    response_model=HrDesignation,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_designation(
    body: HrDesignationCreate,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrDesignation:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.designation.create",
        actor=auth.user.username,
        resource="Designation",
        detail={"title": body.title},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    doc: dict[str, Any] = {
        "doctype": "Designation",
        "designation_name": body.title,
    }
    if body.description:
        doc["description"] = body.description
    # TODO: department_id / grade_band_id / approved_headcount need custom fields on Designation
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        dept = (
            HrDepartmentRef(id=body.department_id, name=body.department_id)
            if body.department_id
            else None
        )
        grade = (
            HrGradeBandRef(id=body.grade_band_id, code=body.grade_band_id)
            if body.grade_band_id
            else None
        )
        mapped = _as_hr_designation(raw, department=dept, grade_band=grade)
        if body.approved_headcount is not None:
            mapped = mapped.model_copy(update={"total": body.approved_headcount})
        return mapped
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.patch("/hr/designations/{designation_id}", response_model=HrDesignation, tags=["hr"])
async def patch_hr_designation(
    designation_id: str,
    body: HrDesignationPatch,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrDesignation:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.designation.patch",
        actor=auth.user.username,
        resource=f"Designation:{designation_id}",
        detail={"title": body.title},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    updates: dict[str, Any] = {}
    if body.title is not None:
        updates["designation_name"] = body.title
    if body.description is not None:
        updates["description"] = body.description
    try:
        if updates:
            await _frappe_set_value(session, "Designation", designation_id, updates)
        raw = await _frappe_get_doc(session, "Designation", designation_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Designation not found")
        mapped = _as_hr_designation(raw)
        if body.approved_headcount is not None:
            mapped = mapped.model_copy(update={"total": body.approved_headcount})
        return mapped
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(status_code=404, detail="Designation not found") from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.delete(
    "/hr/designations/{designation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["hr"],
)
async def delete_hr_designation(
    designation_id: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    confirm: bool = False,
) -> None:
    _require_confirm(confirm)
    audit_log(
        action="hr.designation.delete",
        actor=auth.user.username,
        resource=f"Designation:{designation_id}",
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    await _frappe_delete(auth.frappe(frappe), "Designation", designation_id)


@router.get("/hr/grade-bands", tags=["hr"])
async def list_hr_grade_bands(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrGradeBand]]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            _EMPLOYEE_GRADE_DOCTYPE,
            fields=["name", "description"],
            limit=100,
            order_by="name asc",
            soft=True,
        )
        return {"items": [_as_hr_grade_band(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/grade-bands",
    response_model=HrGradeBand,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_grade_band(
    body: HrGradeBandCreate,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrGradeBand:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.grade_band.create",
        actor=auth.user.username,
        resource=_EMPLOYEE_GRADE_DOCTYPE,
        detail={"code": body.code},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    doc: dict[str, Any] = {
        "doctype": _EMPLOYEE_GRADE_DOCTYPE,
        "grade_name": body.code,
        # ERPNext Employee Grade uses `name` as the grade code after insert
    }
    # Prefer setting name via grade if DocType uses autoname by field
    doc["__newname"] = body.code
    if body.name:
        doc["description"] = body.name
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        mapped = _as_hr_grade_band(raw)
        return mapped.model_copy(
            update={
                "code": body.code,
                "name": body.name or mapped.name,
                "level": body.level,
                "min_salary": body.min_salary,
                "max_salary": body.max_salary,
                "currency": body.currency,
            }
        )
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    f"DocType {_EMPLOYEE_GRADE_DOCTYPE} is not installed. "
                    "Enable HRMS Employee Grade before creating grade bands"
                ),
            ) from exc
        if "ValidationError" in text or "mandatory" in text.lower():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not create Employee Grade: {text[:200]}",
            ) from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.patch("/hr/grade-bands/{grade_id}", response_model=HrGradeBand, tags=["hr"])
async def patch_hr_grade_band(
    grade_id: str,
    body: HrGradeBandPatch,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrGradeBand:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.grade_band.patch",
        actor=auth.user.username,
        resource=f"{_EMPLOYEE_GRADE_DOCTYPE}:{grade_id}",
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["description"] = body.name
    try:
        if updates:
            await _frappe_set_value(session, _EMPLOYEE_GRADE_DOCTYPE, grade_id, updates)
        raw = await _frappe_get_doc(session, _EMPLOYEE_GRADE_DOCTYPE, grade_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Grade band not found")
        mapped = _as_hr_grade_band(raw)
        return mapped.model_copy(
            update={
                "level": body.level if body.level is not None else mapped.level,
                "min_salary": body.min_salary
                if body.min_salary is not None
                else mapped.min_salary,
                "max_salary": body.max_salary
                if body.max_salary is not None
                else mapped.max_salary,
                "currency": body.currency if body.currency is not None else mapped.currency,
            }
        )
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"DocType {_EMPLOYEE_GRADE_DOCTYPE} unavailable or grade not found",
            ) from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/locations", tags=["hr"])
async def list_hr_locations(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrLocation]]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        session = auth.frappe(frappe)
        rows = await _frappe_get_list(
            session,
            "Branch",
            fields=["name", "branch", "company"],
            limit=100,
            order_by="name asc",
            soft=True,
        )
        employees = await _frappe_get_list(
            session,
            "Employee",
            fields=["name", "branch"],
            filters=[["status", "=", "Active"]],
            limit=500,
            soft=True,
        )
        counts: dict[str, int] = {}
        for emp in employees:
            b = emp.get("branch")
            if b:
                counts[str(b)] = counts.get(str(b), 0) + 1
        return {
            "items": [
                _as_hr_location(r, employee_count=counts.get(str(r.get("name") or ""), 0))
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/locations",
    response_model=HrLocation,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_location(
    body: HrLocationCreate,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrLocation:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.location.create",
        actor=auth.user.username,
        resource="Branch",
        detail={"name": body.name},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    doc: dict[str, Any] = {"doctype": "Branch", "branch": body.name}
    # address / type — TODO: custom fields on Branch if needed
    try:
        raw = await _frappe_insert(session, doc)
        mapped = _as_hr_location(raw)
        if body.type:
            mapped = mapped.model_copy(update={"type": body.type})
        if body.address:
            mapped = mapped.model_copy(update={"address": body.address})
        if body.code:
            mapped = mapped.model_copy(update={"code": body.code})
        return mapped
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.patch("/hr/locations/{location_id}", response_model=HrLocation, tags=["hr"])
async def patch_hr_location(
    location_id: str,
    body: HrLocationPatch,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrLocation:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.location.patch",
        actor=auth.user.username,
        resource=f"Branch:{location_id}",
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["branch"] = body.name
    try:
        if updates:
            await _frappe_set_value(session, "Branch", location_id, updates)
        raw = await _frappe_get_doc(session, "Branch", location_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Location not found")
        mapped = _as_hr_location(raw)
        extra: dict[str, Any] = {}
        if body.address is not None:
            extra["address"] = body.address
        if body.type is not None:
            extra["type"] = body.type
        if body.code is not None:
            extra["code"] = body.code
        if body.status is not None:
            extra["status"] = body.status
        return mapped.model_copy(update=extra) if extra else mapped
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(status_code=404, detail="Location not found") from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/cost-centres", tags=["hr"])
async def list_hr_cost_centres(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrCostCentre]]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        session = auth.frappe(frappe)
        rows = await _frappe_get_list(
            session,
            "Cost Center",
            fields=[
                "name",
                "cost_center_name",
                "company",
                "disabled",
                "is_group",
                "parent_cost_center",
            ],
            filters=[["is_group", "=", 0]],
            limit=200,
            order_by="name asc",
            soft=True,
        )
        employees = await _frappe_get_list(
            session,
            "Employee",
            fields=["name", "payroll_cost_center"],
            filters=[["status", "=", "Active"]],
            limit=500,
            soft=True,
        )
        counts: dict[str, int] = {}
        for emp in employees:
            cc = emp.get("payroll_cost_center")
            if cc:
                counts[str(cc)] = counts.get(str(cc), 0) + 1
        return {
            "items": [
                _as_hr_cost_centre(
                    r, employee_count=counts.get(str(r.get("name") or ""), 0)
                )
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/cost-centres",
    response_model=HrCostCentre,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_cost_centre(
    body: HrCostCentreCreate,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCostCentre:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.cost_centre.create",
        actor=auth.user.username,
        resource="Cost Center",
        detail={"name": body.name},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    company = await _load_company(session)
    if not company or not company.get("name"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Company required before creating a Cost Center",
        )
    company_name = str(company["name"])
    parent_rows = await _frappe_get_list(
        session,
        "Cost Center",
        fields=["name"],
        filters=[["company", "=", company_name], ["is_group", "=", 1]],
        limit=1,
        soft=True,
    )
    doc: dict[str, Any] = {
        "doctype": "Cost Center",
        "cost_center_name": body.name,
        "company": company_name,
        "is_group": 0,
    }
    if parent_rows:
        doc["parent_cost_center"] = parent_rows[0].get("name")
    try:
        raw = await _frappe_insert(session, doc)
        mapped = _as_hr_cost_centre(raw)
        extra: dict[str, Any] = {}
        if body.code:
            extra["code"] = body.code
        if body.description:
            extra["description"] = body.description
        if body.finance_account_code:
            extra["finance_account_code"] = body.finance_account_code
        if body.status:
            extra["status"] = body.status
        return mapped.model_copy(update=extra) if extra else mapped
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.patch("/hr/cost-centres/{cc_id}", response_model=HrCostCentre, tags=["hr"])
async def patch_hr_cost_centre(
    cc_id: str,
    body: HrCostCentrePatch,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCostCentre:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.cost_centre.patch",
        actor=auth.user.username,
        resource=f"Cost Center:{cc_id}",
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    updates: dict[str, Any] = {}
    if body.status == "archived":
        updates["disabled"] = 1
    elif body.status in ("active", "draft"):
        updates["disabled"] = 0
    try:
        if updates:
            await _frappe_set_value(session, "Cost Center", cc_id, updates)
        raw = await _frappe_get_doc(session, "Cost Center", cc_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Cost centre not found")
        mapped = _as_hr_cost_centre(raw)
        extra: dict[str, Any] = {}
        if body.name is not None:
            extra["name"] = body.name
        if body.code is not None:
            extra["code"] = body.code
        if body.description is not None:
            extra["description"] = body.description
        if body.finance_account_code is not None:
            extra["finance_account_code"] = body.finance_account_code
        if body.status is not None:
            extra["status"] = body.status
        return mapped.model_copy(update=extra) if extra else mapped
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(status_code=404, detail="Cost centre not found") from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover



@router.get("/metrology/jobs", tags=["metrology"])
async def list_metrology_jobs(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 20,
) -> dict[str, list[MetrologyJobSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_metrology.api.list_calibration_jobs",
            params={"status": status_filter, "limit": limit},
        )
        return {"items": _as_metrology_jobs(raw, status_filter, limit)}
    except FrappeError as exc:
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Metrology jobs unavailable")


@router.get("/crm/pipeline", response_model=CrmPipeline, tags=["crm"])
async def get_crm_pipeline(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CrmPipeline:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method("eswasa_governance.api.crm_pipeline")
        return CrmPipeline.model_validate(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="CRM pipeline unavailable")


# --- Thin Institution wires (Finance / HR / CRM / LMS / TBT) -----------------


async def _frappe_get_list(
    session: FrappeClient,
    doctype: str,
    *,
    fields: list[str],
    filters: list[Any] | dict[str, Any] | None = None,
    limit: int = 20,
    order_by: str | None = None,
    soft: bool = False,
) -> list[dict[str, Any]]:
    """Permission-bound list via frappe.client.get_list (acts-as-user).

    When ``soft=True``, a Desk permission denial returns ``[]`` instead of 403 —
    used for org-wide portal modules where not every staff role has full DocPerms.
    """
    payload: dict[str, Any] = {
        "doctype": doctype,
        "fields": fields,
        "limit_page_length": limit,
    }
    if filters is not None:
        payload["filters"] = filters
    if order_by:
        payload["order_by"] = order_by
    try:
        raw = await session.method("frappe.client.get_list", json=payload)
    except FrappeError as exc:
        text = str(exc)
        if soft and (
            "PermissionError" in text
            or "Insufficient Permission" in text
            or "DoesNotExistError" in text
            or "not found" in text.lower()
            or "ValidationError" in text
            or "AttributeError" in text
            or "\"exception\"" in text
            or "Traceback" in text
        ):
            return []
        _raise_from_frappe(exc)
        raise  # pragma: no cover
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    return []


async def _frappe_insert(session: FrappeClient, doc: dict[str, Any]) -> dict[str, Any]:
    try:
        raw = await session.method("frappe.client.insert", json={"doc": doc})
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover
    if isinstance(raw, dict):
        return raw
    return {"name": str(raw)}


async def _frappe_get_doc(
    session: FrappeClient,
    doctype: str,
    name: str,
    *,
    soft: bool = False,
) -> dict[str, Any] | None:
    try:
        raw = await session.method(
            "frappe.client.get",
            json={"doctype": doctype, "name": name},
        )
    except FrappeError as exc:
        text = str(exc)
        if soft and (
            "PermissionError" in text
            or "Insufficient Permission" in text
            or "DoesNotExistError" in text
        ):
            return None
        _raise_from_frappe(exc)
        raise  # pragma: no cover
    return raw if isinstance(raw, dict) else None


async def _frappe_set_value(
    session: FrappeClient,
    doctype: str,
    name: str,
    fieldname: str | dict[str, Any],
    value: Any = None,
) -> Any:
    payload: dict[str, Any] = {
        "doctype": doctype,
        "name": name,
        "fieldname": fieldname,
    }
    if not isinstance(fieldname, dict):
        payload["value"] = value
    try:
        return await session.method("frappe.client.set_value", json=payload)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


def _as_finance_invoice(row: dict[str, Any]) -> FinanceInvoiceSummary:
    status = str(row.get("status") or "")
    overdue = row.get("overdue")
    if overdue is None:
        overdue = status.lower() == "overdue"
    return FinanceInvoiceSummary(
        id=str(row.get("name") or row.get("id") or ""),
        customer=str(row.get("customer") or ""),
        status=status,
        grand_total=float(row.get("grand_total") or 0),
        due_date=row.get("due_date"),
        overdue=bool(overdue),
    )


def _hr_initials(name: str) -> str:
    parts = [p for p in str(name or "").split() if p]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _as_hr_employee(row: dict[str, Any]) -> HrEmployeeSummary:
    emp_name = str(row.get("employee_name") or row.get("name") or "")
    email = row.get("company_email") or row.get("prefered_email") or row.get("user_id")
    emp_id = str(row.get("name") or row.get("id") or "")
    return HrEmployeeSummary(
        id=emp_id,
        employee_name=emp_name,
        department=row.get("department"),
        designation=row.get("designation"),
        status=row.get("status"),
        date_of_joining=row.get("date_of_joining"),
        email=str(email) if email else None,
        initials=_hr_initials(emp_name) or None,
        reports_to=row.get("reports_to"),
        user_id=row.get("user_id"),
        desk_path=f"/app/employee/{emp_id}" if emp_id else None,
    )


def _as_hr_leave(row: dict[str, Any]) -> HrLeaveSummary:
    return HrLeaveSummary(
        id=str(row.get("name") or row.get("id") or ""),
        employee=str(row.get("employee_name") or row.get("employee") or ""),
        leave_type=str(row.get("leave_type") or ""),
        from_date=row.get("from_date"),
        to_date=row.get("to_date"),
        status=str(row.get("status") or ""),
    )


def _as_hr_out_today(row: dict[str, Any]) -> HrOutTodayItem:
    leave_type = row.get("leave_type")
    return HrOutTodayItem(
        id=str(row.get("name") or row.get("id") or "") or None,
        employee=str(row.get("employee") or ""),
        employee_name=row.get("employee_name"),
        reason=row.get("reason") or leave_type,
        leave_type=leave_type,
        from_date=row.get("from_date"),
        to_date=row.get("to_date"),
        status=row.get("status"),
    )


def _as_hr_appraisal(row: dict[str, Any]) -> HrAppraisalSummary:
    # HRMS Appraisal is submittable — no Select "status"; map docstatus
    raw_status = row.get("status")
    if raw_status is None:
        ds = row.get("docstatus")
        try:
            ds_i = int(ds) if ds is not None else 0
        except (TypeError, ValueError):
            ds_i = 0
        raw_status = {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(ds_i, "Draft")
    return HrAppraisalSummary(
        id=str(row.get("name") or row.get("id") or ""),
        employee=str(row.get("employee_name") or row.get("employee") or ""),
        cycle=row.get("appraisal_cycle") or row.get("cycle"),
        status=str(raw_status),
    )


def _quarter_start(today: date | None = None) -> date:
    d = today or date.today()
    month = ((d.month - 1) // 3) * 3 + 1
    return date(d.year, month, 1)


def _today_iso() -> str:
    return date.today().isoformat()


async def _aggregate_hr_summary(session: FrappeClient) -> HrSummary:
    """Build overview KPIs from HRMS DocTypes (soft-empty on permission / missing)."""
    today = _today_iso()
    q_start = _quarter_start().isoformat()

    employees = await _frappe_get_list(
        session,
        "Employee",
        fields=["name", "status", "date_of_joining", "employee_name", "modified"],
        filters=[["status", "=", "Active"]],
        limit=500,
        order_by="modified desc",
        soft=True,
    )
    headcount = len(employees)
    new_hires_q = sum(
        1
        for e in employees
        if e.get("date_of_joining") and str(e["date_of_joining"])[:10] >= q_start
    )

    leave_open = await _frappe_get_list(
        session,
        "Leave Application",
        fields=[
            "name",
            "employee",
            "employee_name",
            "leave_type",
            "from_date",
            "to_date",
            "status",
            "modified",
        ],
        filters=[["status", "=", "Open"]],
        limit=200,
        order_by="modified desc",
        soft=True,
    )
    leave_pending = len(leave_open)

    out_rows = await _frappe_get_list(
        session,
        "Leave Application",
        fields=[
            "name",
            "employee",
            "employee_name",
            "leave_type",
            "from_date",
            "to_date",
            "status",
        ],
        filters=[
            ["status", "in", ["Open", "Approved"]],
            ["from_date", "<=", today],
            ["to_date", ">=", today],
        ],
        limit=100,
        soft=True,
    )
    on_leave_today = len(out_rows)

    appraisals = await _frappe_get_list(
        session,
        "Appraisal",
        fields=["name", "docstatus", "employee_name", "modified"],
        limit=500,
        order_by="modified desc",
        soft=True,
    )
    if appraisals:
        submitted = sum(1 for a in appraisals if int(a.get("docstatus") or 0) == 1)
        appraisal_pct = round(100.0 * submitted / len(appraisals), 1)
    else:
        appraisal_pct = 0.0

    jobs = await _frappe_get_list(
        session,
        "Job Opening",
        fields=["name", "status"],
        filters=[["status", "=", "Open"]],
        limit=100,
        soft=True,
    )
    open_positions = len(jobs)

    activity: list[HrActivityItem] = []
    for row in leave_open[:5]:
        activity.append(
            HrActivityItem(
                id=str(row.get("name") or ""),
                kind="leave",
                title=f"Leave pending: {row.get('employee_name') or row.get('employee') or ''}",
                at=str(row.get("modified")) if row.get("modified") else None,
            )
        )
    for row in employees[:3]:
        if row.get("date_of_joining") and str(row["date_of_joining"])[:10] >= q_start:
            activity.append(
                HrActivityItem(
                    id=str(row.get("name") or ""),
                    kind="hire",
                    title=f"New hire: {row.get('employee_name') or row.get('name')}",
                    at=str(row.get("date_of_joining")),
                )
            )

    return HrSummary(
        headcount=headcount,
        appraisal_completion_pct=appraisal_pct,
        open_leave=leave_pending,
        new_hires_q=new_hires_q,
        on_leave_today=on_leave_today,
        leave_pending=leave_pending,
        open_positions=open_positions,
        out_today=[_as_hr_out_today(r) for r in out_rows],
        activity=activity[:8] or None,
    )


# Back-compat name used in earlier Phase 1 drafts.
_aggregate_hr_overview = _aggregate_hr_summary


def _as_marketing_campaign(row: dict[str, Any]) -> MarketingCampaignSummary:
    return MarketingCampaignSummary(
        id=str(row.get("name") or row.get("id") or ""),
        title=str(row.get("campaign_name") or row.get("title") or row.get("name") or ""),
        status=str(row.get("status") or "Active"),
    )


def _as_crm_lead(row: dict[str, Any]) -> CrmLeadSummary:
    return CrmLeadSummary(
        id=str(row.get("name") or row.get("id") or ""),
        title=str(row.get("lead_name") or row.get("title") or row.get("name") or ""),
        organization=row.get("organization") or row.get("company_name"),
        status=str(row.get("status") or ""),
    )


def _as_crm_deal(row: dict[str, Any]) -> CrmDealSummary:
    amount = row.get("deal_value")
    if amount is None:
        amount = row.get("expected_deal_value")
    if amount is None:
        amount = row.get("amount") or row.get("opportunity_amount") or row.get("net_total")
    title = (
        row.get("organization_name")
        or row.get("organization")
        or row.get("lead_name")
        or row.get("deal_name")
        or row.get("title")
        or row.get("name")
        or ""
    )
    if not title or str(title) == str(row.get("name") or ""):
        first = str(row.get("first_name") or "").strip()
        last = str(row.get("last_name") or "").strip()
        person = f"{first} {last}".strip()
        if person:
            title = person
    return CrmDealSummary(
        id=str(row.get("name") or row.get("id") or ""),
        title=str(title),
        amount=float(amount) if amount is not None else None,
        status=str(row.get("status") or row.get("stage") or ""),
    )


def _as_training_course(row: dict[str, Any]) -> TrainingCourseSummary:
    published = row.get("published")
    if published is None:
        published = str(row.get("status") or "").lower() in ("approved", "published")
    return TrainingCourseSummary(
        id=str(row.get("name") or row.get("id") or ""),
        title=str(row.get("title") or row.get("name") or ""),
        published=bool(published),
    )


def _as_training_enrolment(row: dict[str, Any]) -> TrainingEnrolmentSummary:
    progress = row.get("progress")
    if progress is not None:
        status = f"{progress}%"
    else:
        status = str(row.get("status") or "Enrolled")
    return TrainingEnrolmentSummary(
        id=str(row.get("name") or row.get("id") or ""),
        course=str(row.get("course") or ""),
        member=row.get("member"),
        status=status,
    )


def _require_confirm(confirm: bool) -> None:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm=true required before commit",
        )


@router.get("/finance/invoices", tags=["finance"])
async def list_finance_invoices(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 20,
) -> dict[str, list[FinanceInvoiceSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] | None = None
    if status_filter:
        filters = [["status", "=", status_filter]]
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Sales Invoice",
            fields=["name", "customer", "status", "grand_total", "due_date", "outstanding_amount"],
            filters=filters,
            limit=limit,
            order_by="posting_date desc",
            soft=True,
        )
        return {"items": [_as_finance_invoice(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/finance/invoices",
    response_model=FinanceInvoiceSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["finance"],
)
async def create_finance_invoice(
    body: CreateFinanceInvoiceBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> FinanceInvoiceSummary:
    _require_confirm(body.confirm)
    audit_log(
        action="finance.invoice.create",
        actor=auth.user.username,
        resource="Sales Invoice",
        detail={"customer": body.customer, "items": body.items},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    doc: dict[str, Any] = {
        "doctype": "Sales Invoice",
        "customer": body.customer,
    }
    if body.items:
        doc["items"] = body.items
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        return _as_finance_invoice(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/finance/revenue", tags=["finance"])
async def get_finance_revenue(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Sales Invoice",
            fields=["name", "customer", "grand_total", "posting_date", "status", "cost_center"],
            filters=[["docstatus", "=", 1]],
            limit=200,
            order_by="posting_date desc",
            soft=True,
        )
        return {"items": rows}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/finance/budget", tags=["finance"])
async def get_finance_budget(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Budget",
            fields=["name", "cost_center", "from_fiscal_year", "to_fiscal_year", "company", "budget_amount"],
            limit=100,
            order_by="modified desc",
            soft=True,
        )
        return {"items": rows}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/employees", tags=["hr"])
async def list_hr_employees(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 50,
    q: str | None = None,
    department: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> dict[str, list[HrEmployeeSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] = []
    if department:
        filters.append(["department", "=", department])
    if status_filter:
        filters.append(["status", "=", status_filter])
    if q:
        filters.append(["employee_name", "like", f"%{q}%"])
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Employee",
            fields=[
                "name",
                "employee_name",
                "department",
                "designation",
                "status",
                "date_of_joining",
                "user_id",
                "company_email",
                "prefered_email",
                "reports_to",
            ],
            filters=filters or None,
            limit=limit,
            order_by="employee_name asc",
            soft=True,
        )
        return {"items": [_as_hr_employee(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/employees/{employee_id}", response_model=HrEmployeeSummary, tags=["hr"])
async def get_hr_employee(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeSummary:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await _frappe_get_doc(auth.frappe(frappe), "Employee", employee_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Employee not found")
        return _as_hr_employee(raw)
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(status_code=404, detail="Employee not found") from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/employees",
    response_model=HrEmployeeSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_employee(
    body: CreateHrEmployeeBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeSummary:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.employee.create",
        actor=auth.user.username,
        resource="Employee",
        detail={
            "employee_name": body.employee_name,
            "invite": body.invite,
            "profile_name": body.profile_name,
        },
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")

    name_parts = body.employee_name.strip().split(None, 1)
    first_name = (body.first_name or (name_parts[0] if name_parts else "")).strip()
    last_name = (
        body.last_name
        or (name_parts[1] if len(name_parts) > 1 else "")
        or ""
    ).strip()
    if not first_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="employee_name or first_name required",
        )

    doc: dict[str, Any] = {
        "doctype": "Employee",
        "first_name": first_name,
        "last_name": last_name,
        "employee_name": body.employee_name.strip() or f"{first_name} {last_name}".strip(),
        "status": "Active",
    }
    for key, val in (
        ("department", body.department),
        ("designation", body.designation),
        ("date_of_joining", body.date_of_joining),
        ("company_email", body.company_email or body.email),
        ("gender", body.gender),
        ("date_of_birth", body.date_of_birth),
        ("company", body.company),
        ("reports_to", body.reports_to),
    ):
        if val:
            doc[key] = val

    session = auth.frappe(frappe)
    try:
        raw = await _frappe_insert(session, doc)
        emp_name = str(raw.get("name") or "")

        invite_email = (body.email or body.company_email or "").strip().lower()
        if body.invite:
            if not invite_email:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="email (or company_email) required when invite=true",
                )
            roles = [r for r in (body.roles or list(_HR_INVITE_DEFAULT_ROLES)) if r in _HR_INVITE_ALLOWED_ROLES]
            if not roles:
                roles = list(_HR_INVITE_DEFAULT_ROLES)
            try:
                await frappe.invite_staff(
                    email=invite_email,
                    full_name=doc["employee_name"],
                    roles=roles,
                )
            except FrappeError as exc:
                detail = str(exc).lower()
                if "already" not in detail and exc.status_code != 409:
                    _raise_from_frappe(exc)
                    raise  # pragma: no cover
            try:
                await _frappe_set_value(session, "Employee", emp_name, "user_id", invite_email)
                raw["user_id"] = invite_email
            except HTTPException:
                logger.warning("link Employee.user_id=%s failed for %s", invite_email, emp_name)

            if body.profile_name:
                from app.admin.router import _apply_job_profile

                try:
                    await _apply_job_profile(
                        session,
                        user=invite_email,
                        profile_name=body.profile_name.strip(),
                    )
                except HTTPException:
                    raise
                except Exception as exc:  # noqa: BLE001 — profile is best-effort after invite
                    logger.warning("apply profile %s on %s: %s", body.profile_name, invite_email, exc)

        return _as_hr_employee(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.patch(
    "/hr/employees/{employee_id}",
    response_model=HrEmployeeSummary,
    tags=["hr"],
)
async def patch_hr_employee(
    employee_id: str,
    body: PatchHrEmployeeBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeSummary:
    _require_confirm(body.confirm)
    updates: dict[str, Any] = {}
    for key in ("employee_name", "department", "designation", "status", "reports_to"):
        val = getattr(body, key)
        if val is not None:
            updates[key] = val
    if body.email is not None:
        updates["company_email"] = body.email
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one of employee_name, department, designation, status, email, reports_to",
        )
    audit_log(
        action="hr.employee.patch",
        actor=auth.user.username,
        resource=f"Employee:{employee_id}",
        detail=updates,
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        await _frappe_set_value(session, "Employee", employee_id, updates)
        raw = await _frappe_get_doc(session, "Employee", employee_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Employee not found")
        return _as_hr_employee(raw)
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(status_code=404, detail="Employee not found") from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/orgchart", tags=["hr"])
async def get_hr_orgchart(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 200,
) -> dict[str, list[HrOrgChartNode]]:
    """Flat org chart nodes (reports_to links). Soft-empty when not permitted."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Employee",
            fields=[
                "name",
                "employee_name",
                "department",
                "designation",
                "reports_to",
                "user_id",
                "company_email",
                "status",
            ],
            filters=[["status", "=", "Active"]],
            limit=limit,
            order_by="employee_name asc",
            soft=True,
        )
        items: list[HrOrgChartNode] = []
        for r in rows:
            emp = _as_hr_employee(r)
            items.append(
                HrOrgChartNode(
                    id=emp.id,
                    employee_name=emp.employee_name,
                    department=emp.department,
                    designation=emp.designation,
                    reports_to=emp.reports_to,
                    email=emp.email,
                    initials=emp.initials,
                )
            )
        return {"nodes": items}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/leave", tags=["hr"])
async def list_hr_leave(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 20,
) -> dict[str, list[HrLeaveSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] | None = None
    if status_filter:
        filters = [["status", "=", status_filter]]
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Leave Application",
            fields=["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "status"],
            filters=filters,
            limit=limit,
            order_by="from_date desc",
            soft=True,
        )
        return {"items": [_as_hr_leave(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/leave/balances", tags=["hr"])
async def list_hr_leave_balances(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    employee: str | None = None,
    limit: int = 50,
) -> dict[str, list[HrLeaveBalance]]:
    """Leave Allocation balances when the DocType is present; soft-empty otherwise."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] = [["docstatus", "=", 1]]
    if employee:
        filters.append(["employee", "=", employee])
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Leave Allocation",
            fields=[
                "name",
                "employee",
                "employee_name",
                "leave_type",
                "total_leaves_allocated",
                "unused_leaves",
                "new_leaves_allocated",
            ],
            filters=filters,
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        items: list[HrLeaveBalance] = []
        for r in rows:
            allocated = float(r.get("total_leaves_allocated") or r.get("new_leaves_allocated") or 0)
            balance = float(r.get("unused_leaves") if r.get("unused_leaves") is not None else allocated)
            used = max(0.0, allocated - balance)
            items.append(
                HrLeaveBalance(
                    leave_type=str(r.get("leave_type") or ""),
                    allocated=allocated,
                    used=used,
                    balance=balance,
                    employee=str(r.get("employee_name") or r.get("employee") or "") or None,
                )
            )
        return {"items": items}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/leave",
    response_model=HrLeaveSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_leave(
    body: CreateHrLeaveBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrLeaveSummary:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.leave.create",
        actor=auth.user.username,
        resource="Leave Application",
        detail={
            "leave_type": body.leave_type,
            "from_date": body.from_date,
            "to_date": body.to_date,
        },
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    doc: dict[str, Any] = {
        "doctype": "Leave Application",
        "leave_type": body.leave_type,
        "from_date": body.from_date,
        "to_date": body.to_date,
    }
    if body.reason:
        doc["description"] = body.reason
    try:
        # Bind to caller Employee when HRMS links user_id (permission inheritance).
        employees = await _frappe_get_list(
            session,
            "Employee",
            fields=["name"],
            filters={"user_id": auth.user.username},
            limit=1,
            soft=True,
        )
        if employees:
            doc["employee"] = employees[0]["name"]
        raw = await _frappe_insert(session, doc)
        return _as_hr_leave(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/leave/{leave_id}/act",
    response_model=HrLeaveSummary,
    tags=["hr"],
)
async def act_hr_leave(
    leave_id: str,
    body: HrLeaveActBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrLeaveSummary:
    _require_confirm(body.confirm)
    decision = body.decision.strip().lower()
    if decision not in ("approve", "reject"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="decision must be approve or reject",
        )
    new_status = "Approved" if decision == "approve" else "Rejected"
    audit_log(
        action="hr.leave.act",
        actor=auth.user.username,
        resource=f"Leave Application:{leave_id}",
        detail={"decision": decision, "reason": body.reason},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        workflow_ok = False
        try:
            leave_doc = await _frappe_get_doc(session, "Leave Application", leave_id)
            if leave_doc:
                action_label = "Approve" if decision == "approve" else "Reject"
                await session.method(
                    "frappe.model.workflow.apply_workflow",
                    json={"doc": leave_doc, "action": action_label},
                )
                workflow_ok = True
        except FrappeError:
            workflow_ok = False

        if not workflow_ok:
            await _frappe_set_value(session, "Leave Application", leave_id, "status", new_status)

        if body.reason:
            try:
                await session.method(
                    "frappe.client.insert",
                    json={
                        "doc": {
                            "doctype": "Comment",
                            "comment_type": "Comment",
                            "reference_doctype": "Leave Application",
                            "reference_name": leave_id,
                            "content": f"[{auth.user.username}] {decision}: {body.reason}",
                        }
                    },
                )
            except FrappeError:
                pass

        raw = await _frappe_get_doc(session, "Leave Application", leave_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Leave application not found")
        return _as_hr_leave(raw)
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text or "not found" in text.lower():
            raise HTTPException(status_code=404, detail="Leave application not found") from exc
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/holidays", tags=["hr"])
async def list_hr_holidays(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 50,
    from_date: str | None = None,
) -> dict[str, list[HrHoliday]]:
    """Upcoming holidays from Holiday List child rows (soft-empty if missing)."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    start = (from_date or _today_iso())[:10]
    try:
        lists = await _frappe_get_list(
            session,
            "Holiday List",
            fields=["name"],
            limit=20,
            soft=True,
        )
        items: list[HrHoliday] = []
        for hl in lists:
            name = str(hl.get("name") or "")
            if not name:
                continue
            doc = await _frappe_get_doc(session, "Holiday List", name, soft=True)
            if not doc:
                continue
            for row in doc.get("holidays") or []:
                if not isinstance(row, dict):
                    continue
                hd = str(row.get("holiday_date") or "")[:10]
                if not hd or hd < start:
                    continue
                items.append(
                    HrHoliday(
                        id=str(row.get("name") or f"{name}:{hd}"),
                        date=hd,
                        description=row.get("description"),
                        holiday_list=name,
                    )
                )
        items.sort(key=lambda h: h.date)
        return {"items": items[:limit]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/attendance", response_model=HrAttendanceSnapshot, tags=["hr"])
async def list_hr_attendance(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    date_param: Annotated[str | None, Query(alias="date")] = None,
) -> HrAttendanceSnapshot:
    """Who is out on a given date (Open/Approved leave overlapping)."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    day = (date_param or _today_iso())[:10]
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Leave Application",
            fields=[
                "name",
                "employee",
                "employee_name",
                "leave_type",
                "from_date",
                "to_date",
                "status",
            ],
            filters=[
                ["status", "in", ["Open", "Approved"]],
                ["from_date", "<=", day],
                ["to_date", ">=", day],
            ],
            limit=100,
            order_by="employee_name asc",
            soft=True,
        )
        out = [_as_hr_out_today(r) for r in rows]
        return HrAttendanceSnapshot(
            date=day,
            out_today=out,
            absent_count=len(out),
            present_count=None,
        )
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/out-today", tags=["hr"])
async def list_hr_out_today(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 50,
) -> dict[str, list[HrOutTodayItem]]:
    """Alias of attendance out list — staff on leave today."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    today = _today_iso()
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Leave Application",
            fields=[
                "name",
                "employee",
                "employee_name",
                "leave_type",
                "from_date",
                "to_date",
                "status",
            ],
            filters=[
                ["status", "in", ["Open", "Approved"]],
                ["from_date", "<=", today],
                ["to_date", ">=", today],
            ],
            limit=limit,
            order_by="employee_name asc",
            soft=True,
        )
        return {"items": [_as_hr_out_today(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/appraisals", tags=["hr"])
async def list_hr_appraisals(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[HrAppraisalSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Appraisal",
            fields=[
                "name",
                "employee",
                "employee_name",
                "appraisal_cycle",
                "docstatus",
                "final_score",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {"items": [_as_hr_appraisal(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


_APPLICANT_STAGES = (
    "Open",
    "Applied",
    "Screening",
    "Interview",
    "Offer",
    "Accepted",
    "Hired",
)


def _as_hr_job(row: dict[str, Any]) -> HrJobOpening:
    vacancies = row.get("planned_no_of_positions") or row.get("vacancies") or row.get("no_of_positions")
    try:
        vac_i = int(vacancies) if vacancies is not None else None
    except (TypeError, ValueError):
        vac_i = None
    return HrJobOpening(
        id=str(row.get("name") or ""),
        job_title=str(row.get("job_title") or row.get("name") or ""),
        status=str(row.get("status") or "Open"),
        department=str(row["department"]) if row.get("department") else None,
        designation=str(row["designation"]) if row.get("designation") else None,
        vacancies=vac_i,
    )


def _as_hr_applicant(row: dict[str, Any]) -> HrApplicant:
    status = str(row.get("status") or "Open")
    return HrApplicant(
        id=str(row.get("name") or ""),
        applicant_name=str(row.get("applicant_name") or row.get("name") or ""),
        status=status,
        job=str(row.get("job_title") or row.get("job_opening") or "") or None,
        stage=status,
    )


def _as_hr_payslip(row: dict[str, Any]) -> HrPayslip:
    net = row.get("net_pay")
    try:
        net_f = float(net) if net is not None else None
    except (TypeError, ValueError):
        net_f = None
    period = row.get("posting_date") or row.get("start_date") or row.get("payroll_frequency")
    return HrPayslip(
        id=str(row.get("name") or ""),
        employee=str(row.get("employee_name") or row.get("employee") or ""),
        status=str(row.get("status") or ("Paid" if row.get("docstatus") == 1 else "Draft")),
        period=str(period) if period else None,
        net_pay=net_f,
    )


def _next_applicant_stage(current: str) -> str | None:
    cur = (current or "Open").strip()
    # Normalize common HRMS values into pipeline
    aliases = {"Replied": "Screening", "Hold": "Screening"}
    cur = aliases.get(cur, cur)
    try:
        idx = _APPLICANT_STAGES.index(cur)
    except ValueError:
        return "Screening"
    if idx >= len(_APPLICANT_STAGES) - 1:
        return None
    return _APPLICANT_STAGES[idx + 1]


@router.get("/hr/jobs", tags=["hr"])
async def list_hr_jobs(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> dict[str, list[HrJobOpening]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] | None = [["status", "=", status_filter]] if status_filter else None
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Job Opening",
            fields=[
                "name",
                "job_title",
                "department",
                "designation",
                "status",
                "planned_no_of_positions",
            ],
            filters=filters,
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {"items": [_as_hr_job(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/jobs",
    response_model=HrJobOpening,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def create_hr_job(
    body: CreateHrJobBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrJobOpening:
    _require_confirm(body.confirm)
    audit_log(
        action="hr.jobs.create",
        actor=auth.user.username,
        resource="Job Opening",
        detail={"job_title": body.job_title, "department": body.department},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    doc: dict[str, Any] = {
        "doctype": "Job Opening",
        "job_title": body.job_title.strip(),
        "status": "Open",
    }
    if body.department:
        doc["department"] = body.department
    if body.designation:
        doc["designation"] = body.designation
    if body.vacancies is not None:
        doc["planned_no_of_positions"] = body.vacancies
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        return _as_hr_job(raw if isinstance(raw, dict) else {"name": body.job_title, **doc})
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/applicants", tags=["hr"])
async def list_hr_applicants(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    job: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 40,
) -> dict[str, list[HrApplicant]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] = []
    if job:
        filters.append(["job_title", "=", job])
    if status_filter:
        filters.append(["status", "=", status_filter])
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Job Applicant",
            fields=["name", "applicant_name", "job_title", "status"],
            filters=filters or None,
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {"items": [_as_hr_applicant(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/hr/applicants/{applicant_id}/advance",
    response_model=HrApplicant,
    tags=["hr"],
)
async def advance_hr_applicant(
    applicant_id: str,
    body: AdvanceHrApplicantBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrApplicant:
    _require_confirm(body.confirm)
    target = body.stage.strip()
    audit_log(
        action="hr.applicants.advance",
        actor=auth.user.username,
        resource=f"Job Applicant:{applicant_id}",
        detail={"stage": target, "note": body.note},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        doc = await _frappe_get_doc(session, "Job Applicant", applicant_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Applicant not found")
        current = str(doc.get("status") or "Open")
        # Allow explicit stage, else next legal
        new_status = target or _next_applicant_stage(current) or current
        await _frappe_set_value(session, "Job Applicant", applicant_id, "status", new_status)
        refreshed = await _frappe_get_doc(session, "Job Applicant", applicant_id) or {
            **doc,
            "status": new_status,
        }
        return _as_hr_applicant(refreshed)
    except HTTPException:
        raise
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/slips", tags=["hr"])
async def list_hr_slips(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[HrPayslip]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Salary Slip",
            fields=[
                "name",
                "employee",
                "employee_name",
                "net_pay",
                "status",
                "posting_date",
                "start_date",
                "docstatus",
            ],
            limit=limit,
            order_by="posting_date desc",
            soft=True,
        )
        return {"items": [_as_hr_payslip(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/hr/payroll/status", response_model=HrPayrollStatus, tags=["hr"])
async def get_hr_payroll_status(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrPayrollStatus:
    """Latest Payroll Entry status — run itself stays desk-linked."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Payroll Entry",
            fields=["name", "status", "posting_date", "end_date", "docstatus"],
            limit=1,
            order_by="modified desc",
            soft=True,
        )
        if not rows:
            return HrPayrollStatus(
                status="none",
                message="No payroll entry yet. HR can create one when payroll is due",
            )
        row = rows[0]
        st = str(row.get("status") or "")
        if not st:
            st = "Submitted" if row.get("docstatus") == 1 else "Draft"
        period = str(row.get("end_date") or row.get("posting_date") or row.get("name") or "")
        return HrPayrollStatus(
            status=st,
            period=period or None,
            employees_processed=None,
            message=str(row.get("name")),
        )
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/crm/leads", tags=["crm"])
async def list_crm_leads(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[CrmLeadSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "CRM Lead",
            fields=["name", "lead_name", "organization", "status"],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {"items": [_as_crm_lead(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/crm/leads",
    response_model=CrmLeadSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["crm"],
)
async def create_crm_lead(
    body: CreateCrmLeadBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CrmLeadSummary:
    _require_confirm(body.confirm)
    audit_log(
        action="crm.lead.create",
        actor=auth.user.username,
        resource="CRM Lead",
        detail={"title": body.title, "organization": body.organization},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    doc: dict[str, Any] = {
        "doctype": "CRM Lead",
        "lead_name": body.title,
    }
    if body.organization:
        doc["organization"] = body.organization
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        return _as_crm_lead(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/crm/deals", tags=["crm"])
async def list_crm_deals(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[CrmDealSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "CRM Deal",
            fields=[
                "name",
                "organization",
                "organization_name",
                "lead_name",
                "first_name",
                "last_name",
                "deal_value",
                "expected_deal_value",
                "status",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {"items": [_as_crm_deal(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/crm/deals",
    response_model=CrmDealSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["crm"],
)
async def create_crm_deal(
    body: CreateCrmDealBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CrmDealSummary:
    _require_confirm(body.confirm)
    audit_log(
        action="crm.deal.create",
        actor=auth.user.username,
        resource="CRM Deal",
        detail={"title": body.title, "amount": body.amount},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    # Frappe CRM Deal: no deal_name/amount — use organization_name + deal_value
    doc: dict[str, Any] = {
        "doctype": "CRM Deal",
        "organization_name": body.title,
    }
    if body.amount is not None:
        doc["deal_value"] = body.amount
        doc["expected_deal_value"] = body.amount
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        return _as_crm_deal(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/training/courses", tags=["training"])
async def list_training_courses(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[TrainingCourseSummary]]:
    """Published LMS catalogue for all staff.

    Desk ``frappe.client.get_list`` on LMS Course is limited to Course Creator /
    Moderator / System Manager. Staff browse via the LMS whitelist
    ``lms.lms.utils.get_courses`` (published courses).
    """
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        raw = await session.method(
            "lms.lms.utils.get_courses",
            json={
                "filters": {"published": 1},
                "start": 0,
                "limit_page_length": limit,
            },
        )
        rows = raw if isinstance(raw, list) else []
        return {"items": [_as_training_course(r) for r in rows if isinstance(r, dict)]}
    except FrappeError:
        # Moderators / creators can still list via Desk get_list
        try:
            rows = await _frappe_get_list(
                session,
                "LMS Course",
                fields=["name", "title", "published", "status"],
                limit=limit,
                order_by="modified desc",
            )
            return {"items": [_as_training_course(r) for r in rows]}
        except FrappeError as exc:
            _raise_from_frappe(exc)
            raise  # pragma: no cover


@router.get("/training/enrolments", tags=["training"])
async def list_training_enrolments(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[TrainingEnrolmentSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "LMS Enrollment",
            fields=["name", "course", "member", "progress"],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {"items": [_as_training_enrolment(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/training/enrol",
    response_model=TrainingEnrolmentSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["training"],
)
async def enrol_training(
    body: EnrolTrainingBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> TrainingEnrolmentSummary:
    _require_confirm(body.confirm)
    audit_log(
        action="training.enrol",
        actor=auth.user.username,
        resource="LMS Enrollment",
        detail={"course": body.course, "batch": body.batch},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    member = auth.user.email or auth.user.username
    doc: dict[str, Any] = {
        "doctype": "LMS Enrollment",
        "course": body.course,
        "member": member,
        "member_type": "Student",
    }
    if body.batch:
        doc["batch_name"] = body.batch
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        return _as_training_enrolment(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post("/tbt/subscribe", tags=["tbt"])
async def subscribe_tbt(
    body: TbtSubscribeBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    _require_confirm(body.confirm)
    audit_log(
        action="tbt.subscribe",
        actor=auth.user.username,
        resource="Subscription",
        detail={
            "sector": body.sector,
            "hs_code": body.hs_code,
            "jurisdiction": body.jurisdiction,
        },
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    sectors = ",".join(p for p in [body.sector, body.hs_code] if p)
    sub_id = f"SUB-{uuid.uuid4().hex[:10].upper()}"
    email = auth.user.email or f"{auth.user.username}@eswasaone.local"
    doc: dict[str, Any] = {
        "doctype": "Subscription",
        "subscription_id": sub_id,
        "subscriber_email": email,
        "subscriber_user": auth.user.username,
        "sectors": sectors,
        "countries": body.jurisdiction or "",
        "channel": "email",
        "active": 1,
    }
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        return {
            "ok": True,
            "id": str(raw.get("name") or raw.get("subscription_id") or sub_id),
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


class CreateMarketingCampaignBody(BaseModel):
    title: str
    confirm: bool


@router.get("/marketing/campaigns", tags=["marketing"])
async def list_marketing_campaigns(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[MarketingCampaignSummary]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Campaign",
            fields=["name", "campaign_name", "description"],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {"items": [_as_marketing_campaign(r) for r in rows]}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/marketing/campaigns",
    response_model=MarketingCampaignSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["marketing"],
)
async def create_marketing_campaign(
    body: CreateMarketingCampaignBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> MarketingCampaignSummary:
    _require_confirm(body.confirm)
    audit_log(
        action="marketing.campaign.create",
        actor=auth.user.username,
        resource="Campaign",
        detail={"title": body.title},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    doc: dict[str, Any] = {
        "doctype": "Campaign",
        "campaign_name": body.title,
    }
    try:
        raw = await _frappe_insert(auth.frappe(frappe), doc)
        return _as_marketing_campaign(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


# --- Analytics (S10) — NL → Frappe bridge; no Insights dependency ----------


@router.post("/analytics/ask", response_model=AnalyticsAskResponse, tags=["analytics"])
async def analytics_ask(
    body: AnalyticsAskBody,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AnalyticsAskResponse:
    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="question is required")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable: analytics requires live data")
    try:
        raw = await analytics_bridge.ask_analytics(auth.frappe(frappe), body.question.strip())
        return AnalyticsAskResponse.model_validate(raw)
    except FrappeError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Analytics ask unavailable")


@router.get("/analytics/reports", tags=["analytics"])
async def list_analytics_reports(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[AnalyticsReportSummary]]:
    """Catalogue of Core-backed reports. Requires live Frappe (no mock KPIs)."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable: analytics requires live data")
    # Health gate only — catalogue ids map to live GET /analytics/{metric}.
    items = [AnalyticsReportSummary.model_validate(r) for r in analytics_bridge.list_report_summaries()]
    return {"items": items}


@router.get("/analytics/{metric}", tags=["analytics"])
async def get_analytics_metric(
    metric: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable: analytics requires live data")
    try:
        return await analytics_bridge.fetch_metric(auth.frappe(frappe), metric)
    except FrappeError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        _raise_from_frappe(exc)
    raise HTTPException(status_code=502, detail="Analytics metric unavailable")


# --- Institution Portal sub-view lists (A4 / roster v2) ---------------------
# Thin _frappe_get_list wires for sub-views the frontend calls but the
# backend did not yet expose. Shapes match the frontend TS types.


@router.get("/certification/audits", tags=["certification"])
async def list_certification_audits(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] | None = None
    if status_filter:
        filters = [["status", "=", status_filter]]
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Audit",
            fields=[
                "name",
                "application",
                "scheme",
                "audit_type",
                "status",
                "outcome",
                "due_date",
                "planned_date",
            ],
            filters=filters,
            limit=limit,
            order_by="due_date desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("name"),
                    "application_id": r.get("application"),
                    "auditor": None,
                    "scheme": r.get("scheme"),
                    "due_date": r.get("due_date"),
                    "status": r.get("status"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/certification/certificates", tags=["certification"])
async def list_certification_certificates(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    filters: list[Any] | None = None
    if status_filter:
        filters = [["status", "=", status_filter]]
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Certificate",
            fields=[
                "name",
                "certificate_number",
                "application",
                "scheme",
                "holder_name",
                "status",
                "issued_on",
                "valid_until",
            ],
            filters=filters,
            limit=limit,
            order_by="issued_on desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("certificate_number") or r.get("name"),
                    "holder": r.get("holder_name"),
                    "scheme": r.get("scheme"),
                    "issued": r.get("issued_on"),
                    "expires": r.get("valid_until"),
                    "status": r.get("status"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/workitems", tags=["standards"])
async def list_standards_workitems(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Work Item",
            fields=[
                "name",
                "work_item_code",
                "title",
                "sector",
                "proposer",
                "workflow_state",
                "technical_committee",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("work_item_code") or r.get("name"),
                    "title": r.get("title"),
                    "status": r.get("workflow_state"),
                    "assignee": r.get("proposer"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/drafts", tags=["standards"])
async def list_standards_drafts(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Draft",
            fields=[
                "name",
                "draft_code",
                "work_item",
                "stage",
                "version_label",
                "summary",
                "workflow_state",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("draft_code") or r.get("name"),
                    "title": r.get("summary") or r.get("work_item"),
                    "status": r.get("workflow_state"),
                    "stage": r.get("stage"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/comments", tags=["standards"])
async def list_standards_comments(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Public Comment",
            fields=[
                "name",
                "comment_id",
                "draft",
                "commenter_name",
                "commenter_email",
                "organisation",
                "comment_text",
                "status",
                "response",
            ],
            limit=limit,
            order_by="creation desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("comment_id") or r.get("name"),
                    "author": r.get("commenter_name"),
                    "body": r.get("comment_text"),
                    "standard": r.get("draft"),
                    "date": None,
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/ballots", tags=["standards"])
async def list_standards_ballots(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Ballot",
            fields=[
                "name",
                "ballot_code",
                "work_item",
                "draft",
                "opened_on",
                "closes_on",
                "votes_for",
                "votes_against",
                "votes_abstain",
                "outcome",
                "workflow_state",
            ],
            limit=limit,
            order_by="closes_on desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("ballot_code") or r.get("name"),
                    "title": r.get("draft") or r.get("work_item"),
                    "status": r.get("workflow_state") or r.get("outcome"),
                    "opens": r.get("opened_on"),
                    "closes": r.get("closes_on"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/metrology/instruments", tags=["metrology"])
async def list_metrology_instruments(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Instrument",
            fields=[
                "name",
                "instrument_id",
                "instrument_name",
                "manufacturer",
                "model",
                "serial_number",
                "measurement_range",
                "accuracy_class",
                "status",
                "calibration_due_on",
            ],
            limit=limit,
            order_by="calibration_due_on desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("instrument_id") or r.get("name"),
                    "name": r.get("instrument_name"),
                    "serial": r.get("serial_number"),
                    "status": r.get("status"),
                    "last_calibrated": None,
                    "next_calibration": r.get("calibration_due_on"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/metrology/results", tags=["metrology"])
async def list_metrology_results(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Result",
            fields=[
                "name",
                "result_id",
                "calibration_job",
                "parameter",
                "measured_value",
                "unit",
                "uncertainty",
                "pass_fail",
                "reviewed",
            ],
            limit=limit,
            order_by="creation desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("result_id") or r.get("name"),
                    "job": r.get("calibration_job"),
                    "instrument": None,
                    "result": r.get("measured_value"),
                    "status": r.get("pass_fail"),
                    "date": None,
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/tbt/alerts/list", tags=["tbt"])
async def list_tbt_alerts_raw(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, Any]:
    """Raw TBT Notification doctype list for the portal sub-view.

    Note: GET /tbt/alerts already exists returning TbtNotificationsResponse via
    eswasa_tbt.api.list_notifications. This list endpoint exposes the raw
    doctype rows (with rights/source_url) on a distinct path to avoid clobbering
    the contract-shaped endpoint.
    """
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "TBT Notification",
            fields=[
                "name",
                "notification_id",
                "title",
                "country",
                "symbol",
                "published_on",
                "source_url",
                "summary",
                "workflow_state",
                "rights",
            ],
            limit=limit,
            order_by="published_on desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("notification_id") or r.get("name"),
                    "title": r.get("title"),
                    "country": r.get("country"),
                    "symbol": r.get("symbol"),
                    "published_on": r.get("published_on"),
                    "summary": r.get("summary"),
                    "status": r.get("workflow_state"),
                    "source_url": r.get("source_url"),
                    "rights": r.get("rights"),
                }
                for r in rows
            ],
            "new_count": 0,
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/tbt/subscriptions", tags=["tbt"])
async def list_tbt_subscriptions(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Subscription",
            fields=[
                "name",
                "subscription_id",
                "subscriber_email",
                "subscriber_user",
                "sectors",
                "countries",
                "channel",
                "active",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("subscription_id") or r.get("name"),
                    "email": r.get("subscriber_email"),
                    "countries": r.get("countries"),
                    "sectors": r.get("sectors"),
                    "active": r.get("active"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


# --- Institution Portal sub-view endpoints (loose-schema list shims) --------


@router.get("/certification/audits", tags=["certification"])
async def list_certification_audits(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Audit",
            fields=[
                "name",
                "application",
                "scheme",
                "audit_type",
                "status",
                "outcome",
                "due_date",
                "planned_date",
            ],
            limit=limit,
            order_by="due_date desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("name"),
                    "application_id": r.get("application"),
                    "auditor": None,
                    "scheme": r.get("scheme"),
                    "due_date": r.get("due_date"),
                    "status": r.get("status"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/certification/certificates", tags=["certification"])
async def list_certification_certificates(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Certificate",
            fields=[
                "name",
                "certificate_number",
                "application",
                "scheme",
                "holder_name",
                "status",
                "issued_on",
                "valid_until",
            ],
            limit=limit,
            order_by="issued_on desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("certificate_number") or r.get("name"),
                    "holder": r.get("holder_name"),
                    "scheme": r.get("scheme"),
                    "issued": r.get("issued_on"),
                    "expires": r.get("valid_until"),
                    "status": r.get("status"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/workitems", tags=["standards"])
async def list_standards_workitems(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Work Item",
            fields=[
                "name",
                "work_item_code",
                "title",
                "sector",
                "proposer",
                "workflow_state",
                "technical_committee",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("work_item_code") or r.get("name"),
                    "title": r.get("title"),
                    "status": r.get("workflow_state"),
                    "assignee": r.get("proposer"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/drafts", tags=["standards"])
async def list_standards_drafts(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Draft",
            fields=[
                "name",
                "draft_code",
                "work_item",
                "stage",
                "version_label",
                "summary",
                "workflow_state",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("draft_code") or r.get("name"),
                    "title": r.get("summary") or r.get("work_item"),
                    "status": r.get("workflow_state"),
                    "stage": r.get("stage"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/comments", tags=["standards"])
async def list_standards_comments(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Public Comment",
            fields=[
                "name",
                "comment_id",
                "draft",
                "commenter_name",
                "commenter_email",
                "organisation",
                "comment_text",
                "status",
                "response",
            ],
            limit=limit,
            order_by="creation desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("comment_id") or r.get("name"),
                    "author": r.get("commenter_name"),
                    "body": r.get("comment_text"),
                    "standard": r.get("draft"),
                    "date": None,
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/standards/ballots", tags=["standards"])
async def list_standards_ballots(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Ballot",
            fields=[
                "name",
                "ballot_code",
                "work_item",
                "draft",
                "opened_on",
                "closes_on",
                "votes_for",
                "votes_against",
                "votes_abstain",
                "outcome",
                "workflow_state",
            ],
            limit=limit,
            order_by="closes_on desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("ballot_code") or r.get("name"),
                    "title": r.get("draft") or r.get("work_item"),
                    "status": r.get("workflow_state") or r.get("outcome"),
                    "opens": r.get("opened_on"),
                    "closes": r.get("closes_on"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/metrology/instruments", tags=["metrology"])
async def list_metrology_instruments(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Instrument",
            fields=[
                "name",
                "instrument_id",
                "instrument_name",
                "manufacturer",
                "model",
                "serial_number",
                "measurement_range",
                "accuracy_class",
                "status",
                "calibration_due_on",
            ],
            limit=limit,
            order_by="calibration_due_on asc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("instrument_id") or r.get("name"),
                    "name": r.get("instrument_name"),
                    "serial": r.get("serial_number"),
                    "status": r.get("status"),
                    "last_calibrated": None,
                    "next_calibration": r.get("calibration_due_on"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/metrology/results", tags=["metrology"])
async def list_metrology_results(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Result",
            fields=[
                "name",
                "result_id",
                "calibration_job",
                "parameter",
                "measured_value",
                "unit",
                "uncertainty",
                "pass_fail",
                "reviewed",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("result_id") or r.get("name"),
                    "job": r.get("calibration_job"),
                    "instrument": None,
                    "result": r.get("measured_value"),
                    "status": r.get("pass_fail"),
                    "date": None,
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/tbt/alerts/list", tags=["tbt"])
async def list_tbt_alerts_list(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, Any]:
    """Raw TBT Notification list with extended fields.

    GET /tbt/alerts already exists as a response_model=TbtNotificationsResponse
    endpoint. This raw list shim is mounted at /tbt/alerts/list to avoid a
    FastAPI route collision while exposing the extra frontend fields.
    """
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "TBT Notification",
            fields=[
                "name",
                "notification_id",
                "title",
                "country",
                "symbol",
                "published_on",
                "source_url",
                "summary",
                "workflow_state",
                "rights",
            ],
            limit=limit,
            order_by="published_on desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("notification_id") or r.get("name"),
                    "title": r.get("title"),
                    "country": r.get("country"),
                    "symbol": r.get("symbol"),
                    "published_on": r.get("published_on"),
                    "summary": r.get("summary"),
                    "status": r.get("workflow_state"),
                    "source_url": r.get("source_url"),
                    "rights": r.get("rights"),
                }
                for r in rows
            ],
            "new_count": 0,
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/tbt/subscriptions", tags=["tbt"])
async def list_tbt_subscriptions(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        rows = await _frappe_get_list(
            auth.frappe(frappe),
            "Subscription",
            fields=[
                "name",
                "subscription_id",
                "subscriber_email",
                "subscriber_user",
                "sectors",
                "countries",
                "channel",
                "active",
            ],
            limit=limit,
            order_by="modified desc",
            soft=True,
        )
        return {
            "items": [
                {
                    "id": r.get("subscription_id") or r.get("name"),
                    "email": r.get("subscriber_email"),
                    "countries": r.get("countries"),
                    "sectors": r.get("sectors"),
                    "active": r.get("active"),
                }
                for r in rows
            ]
        }
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover
