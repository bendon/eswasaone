"""Composed BFF routes — home, certification, standards, analytics, estore, verify."""

from __future__ import annotations

import base64
import binascii
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError

from app.adapters import RequestToPayRequest, request_to_pay
from app.agent.guardrails import enforce_licence
from app.agent.rag import search_sources
from app.audit import audit_log
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.gateway import analytics as analytics_bridge
from app.gateway import mocks
from app.identity.deps import SYSTEM_MANAGER_ROLES, AuthContext, get_actor, require_auth, require_auth_csrf, require_staff
from app.media.store import MediaStore, get_media_store
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
    CreateCertificationQuote,
    IssueCertificationQuote,
    CheckoutResult,
    Citation,
    CreateCertificationApplication,
    CreateCrmDealBody,
    CreateCrmLeadBody,
    CreateFinanceInvoiceBody,
    CreateHrEmployeeBody,
    CreateHrLeaveBody,
    CrmDealSummary,
    CrmLeadSummary,
    CrmPipeline,
    EnrolTrainingBody,
    FinanceDashboard,
    FinanceInvoiceSummary,
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
    HrLeaveActBody,
    HrLeaveBalance,
    CareerApplicationReceipt,
    CareerOpening,
    HrApplicantDetail,
    HrApplicantStatusBody,
    HrCreateEmployeeBody,
    HrFeedbackBody,
    HrInterviewResultBody,
    HrMyInterview,
    HrOfferAnswerBody,
    HrOfferBody,
    HrPipeline,
    HrScheduleInterviewBody,
    HrConfirmBody,
    HrOnboarding,
    HrOnboardingDefaults,
    HrStartOnboardingBody,
    HrProbationBody,
    HrTeam,
    HrTeamCalendar,
    HrTeamMemberDetail,
    HrAccessRequestBody,
    HrAccessReviewBody,
    HrChanges,
    HrCaseActBody,
    HrCaseBoard,
    HrCaseDetail,
    HrCaseNoteBody,
    HrCaseOpenBody,
    HrCaseOwnerBody,
    HrCaseRegister,
    HrConcernBody,
    HrConcernReceipt,
    HrMyConcerns,
    HrAppraisalDetail,
    HrAppraisalHolder,
    HrGoalBody,
    HrPerfCycleBody,
    HrPerfCycleDetail,
    HrPerfCycles,
    HrPerfDefaults,
    HrPerfRemindBody,
    HrPerfRemindResult,
    HrReviewBody,
    HrSelfAssessmentBody,
    HrContractBody,
    HrModuleAccessRequest,
    HrAccessLog,
    HrBoardPack,
    HrLiveOverview,
    HrSetupStatus,
    HrEstablishment,
    HrSensitive,
    HrSensitiveBody,
    HrEstChangeBody,
    HrEstChangeDetail,
    HrEstDepartment,
    HrContractDefaults,
    HrPromotionBody,
    HrSeparationBody,
    HrSeparationDefaults,
    HrTransferBody,
    HrAuthorisationDetail,
    HrAuthorisationRequestBody,
    HrAuthorisationRow,
    HrEvidencePackBody,
    HrEvidencePackJob,
    HrExternalPeople,
    HrExternalPerson,
    HrExternalPersonBody,
    HrTrainingEvidence,
    HrCompetenceMatrix,
    HrDeclarationRegister,
    HrLeavePreview,
    HrLeavePreviewBody,
    HrMe,
    HrMyDeclaration,
    HrRemindBody,
    HrPublishBody,
    HrRemindResult,
    HrRenewalBody,
    HrRequisition,
    HrRequisitionBody,
    HrVacancy,
    HrSignDeclarationBody,
    HrPersonRef,
    HrWorkConflict,
    HrLeaveSummary,
    HrLeaveBalances,
    HrLeaveCalendar,
    HrExpenseClaim,
    HrExpenseClaimBody,
    HrEmployeeDocuments,
    HrEmployeeRecord,
    HrProfileChange,
    HrProfileChangeBody,
    HrProfileChanges,
    HrProfileChangeField,
    HrExpenseOptions,
    HrEmployeeOptions,
    HrExpenseClaims,
    HrImportJob,
    HrImportResult,
    HrImportRun,
    HrImportRuns,
    HrMasterDataResult,
    HrLeaveCancelBody,
    HrLeavePolicy,
    HrLeaveRequest,
    HrLeaveRequests,
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

# Invitation roles for POST /hr/employees live in eswasa_hr.employees (INVITE_ALLOWED_ROLES).

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
    quote = None
    quote_raw = data.get("quote")
    if isinstance(quote_raw, dict) and quote_raw.get("id"):
        try:
            from app.schemas import CertificationQuote

            quote = CertificationQuote.model_validate(quote_raw)
        except Exception:
            quote = None
    return CertificationApplication(
        id=str(data.get("id") or data.get("name") or ""),
        scheme=str(data.get("scheme") or ""),
        applicant=str(data.get("applicant") or data.get("applicant_name") or ""),
        status=str(data.get("status") or data.get("workflow_state") or ""),
        created_at=data.get("created_at") or data.get("creation"),
        updated_at=data.get("updated_at") or data.get("modified"),
        quote=quote,
    )


async def _ensure_quote_pdf(
    *,
    session: Any,
    quote: dict[str, Any],
) -> dict[str, Any]:
    """Render quotation PDF → S3; persist key/url on the Certification Application."""
    from app.gateway.quote_pdf import store_quote_pdf
    from app.media.store import get_media_store

    app_id = quote.get("application_id")
    existing_url = quote.get("pdf_url")
    existing_key = quote.get("pdf_key")
    if existing_url and existing_key:
        return {"pdf_url": existing_url, "pdf_key": existing_key, "cached": True}

    stored = store_quote_pdf(quote, store=get_media_store(), application_id=app_id)
    if app_id:
        try:
            await session.method(
                "eswasa_certification.api.set_quotation_pdf",
                params={
                    "name": app_id,
                    "media_key": stored["media_key"],
                    "pdf_url": stored["pdf_url"],
                },
            )
        except Exception:
            logging.getLogger(__name__).exception("set_quotation_pdf failed for %s", app_id)
    quote = {**quote, "pdf_url": stored["pdf_url"], "pdf_key": stored["media_key"]}
    return {**stored, "quote": quote, "cached": False}


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
    session = auth.frappe(frappe)
    try:
        raw = await session.method(
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
        app = _as_app(raw)
        action_key = (body.action or "").lower().replace("-", "_").replace(" ", "_")
        if action_key in ("issue_quotation",) or (
            isinstance(raw, dict) and (raw.get("status") or "").lower() in ("quote ready", "quoted")
        ):
            try:
                detail = await session.method(
                    "eswasa_certification.api.get_application",
                    params={"name": id},
                )
                quote = (detail or {}).get("quote") if isinstance(detail, dict) else None
                if quote:
                    pdf = await _ensure_quote_pdf(session=session, quote=quote)
                    if pdf.get("quote"):
                        from app.schemas import CertificationQuote

                        try:
                            app.quote = CertificationQuote.model_validate(pdf["quote"])
                        except Exception:
                            pass
            except Exception:
                logging.getLogger(__name__).exception("quote PDF after act failed for %s", id)
        return app
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


@router.get("/certification/quotes", tags=["certification"])
async def list_certification_quotes(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    limit: int = 100,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        return {"items": []}
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.list_quotes",
            params={"limit": limit},
        )
        items_raw = raw.get("items", raw) if isinstance(raw, dict) else raw
        return {"items": list(items_raw or [])}
    except FrappeError as exc:
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
    "/certification/quotes",
    status_code=status.HTTP_201_CREATED,
    tags=["certification"],
)
async def create_certification_quote(
    body: CreateCertificationQuote,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm=true required before commit")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            "eswasa_certification.api.create_quote_request",
            params=body.model_dump(exclude_none=True),
        )
        return raw if isinstance(raw, dict) else {"id": str(raw)}
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post(
    "/certification/quotes/{id}/issue",
    tags=["certification"],
)
async def issue_certification_quote(
    id: str,
    body: IssueCertificationQuote,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm=true required before commit")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    params: dict[str, Any] = {
        "name": id,
        "confirm": True,
        "valid_days": body.valid_days,
        "notes": body.notes,
    }
    if body.lines is not None:
        params["lines"] = [ln.model_dump() for ln in body.lines]
    session = auth.frappe(frappe)
    try:
        raw = await session.method(
            "eswasa_certification.api.issue_quote",
            params=params,
        )
        quote = raw if isinstance(raw, dict) else {"id": id}
        if quote.get("status") in ("issued", "accepted") or quote.get("lines"):
            try:
                pdf = await _ensure_quote_pdf(session=session, quote=quote)
                if pdf.get("quote"):
                    quote = pdf["quote"]
                else:
                    quote["pdf_url"] = pdf.get("pdf_url")
                    quote["pdf_key"] = pdf.get("media_key") or pdf.get("pdf_key")
            except Exception:
                logging.getLogger(__name__).exception("quote PDF upload failed for %s", id)
        return quote
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.get("/certification/quotes/{id}/pdf", tags=["certification"])
async def get_certification_quote_pdf(
    id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Ensure quotation PDF is in S3 and return a citizen-accessible URL."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        raw = await session.method(
            "eswasa_certification.api.list_quotes",
            params={"limit": 200},
        )
        items = (raw.get("items") if isinstance(raw, dict) else None) or []
        quote = next(
            (
                q
                for q in items
                if isinstance(q, dict)
                and (
                    q.get("id") == id
                    or q.get("quotation") == id
                    or q.get("application_id") == id
                )
            ),
            None,
        )
        if not quote:
            # Fall back: treat id as application name
            app = await session.method(
                "eswasa_certification.api.get_application",
                params={"name": id},
            )
            quote = (app or {}).get("quote") if isinstance(app, dict) else None
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        pdf = await _ensure_quote_pdf(session=session, quote=quote)
        return {
            "id": quote.get("id") or id,
            "application_id": quote.get("application_id"),
            "download_url": pdf.get("pdf_url") or (pdf.get("quote") or {}).get("pdf_url"),
            "media_key": pdf.get("media_key") or pdf.get("pdf_key"),
            "backend": pdf.get("backend"),
            "cached": pdf.get("cached", False),
        }
    except HTTPException:
        raise
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


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
        # Optional chrome widget: staff without TBT DocPerm get an empty inbox,
        # not a global permission modal on every Institution page load.
        text = str(exc)
        if (
            "PermissionError" in text
            or "Insufficient Permission" in text
            or "Not permitted" in text
        ):
            return TbtNotificationsResponse(items=[], new_count=0)
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


# --- HR organisation / structure --------------------------------------------

_EMPLOYEE_GRADE_DOCTYPE = "Employee Grade"
# Prefer brief §1 custom_head; keep legacy candidates for older sites.
_DEPT_HEAD_FIELD_CANDIDATES = ("custom_head", "department_head", "custom_department_head")

# ERPNext install fixtures — never list as live ESWASA departments (brief §14.1).
_ERPNEXT_DEPT_STEMS = frozenset(
    {
        "Accounts",
        "Marketing",
        "Sales",
        "Purchase",
        "Operations",
        "Production",
        "Dispatch",
        "Customer Service",
        "Human Resources",
        "Management",
        "Quality Management",
        "Research & Development",
        "Legal",
        "All Departments",
    }
)


def _dept_stem(row: dict[str, Any]) -> str:
    name = str(row.get("department_name") or row.get("name") or "")
    return name.split(" - ")[0].strip()


def _is_live_department(row: dict[str, Any]) -> bool:
    """Leaf, enabled, and not an ERPNext install fixture / tree root."""
    if row.get("is_group") in (1, True, "1"):
        return False
    if row.get("disabled") in (1, True, "1"):
        return False
    return _dept_stem(row) not in _ERPNEXT_DEPT_STEMS


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
            "is_group",
            "payroll_cost_center",
            "custom_head",
        ],
        filters=[["is_group", "=", 0], ["disabled", "=", 0]],
        limit=200,
        order_by="department_name asc",
        soft=True,
    )
    dept_rows = [r for r in dept_rows if _is_live_department(r)]
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
    _require_system_manager(auth)
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
    _require_system_manager(auth)
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
                "is_group",
                "payroll_cost_center",
                "custom_head",
            ],
            filters=[["is_group", "=", 0], ["disabled", "=", 0]],
            limit=limit,
            order_by="department_name asc",
            soft=True,
        )
        rows = [r for r in rows if _is_live_department(r)]
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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.create_department",
        json={"name": body.name, "parent_department_id": body.parent_department_id, "cost_centre_id": body.cost_centre_id, "confirm": 1},
    )
    return _as_hr_department(raw)


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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.update_department",
        json={
            "department": department_id,
            "title": body.name,
            "parent_department": body.parent_department_id,
            "payroll_cost_center": body.cost_centre_id,
            "status": body.status,
            "confirm": 1,
        },
    )
    return _as_hr_department(raw)


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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.create_designation",
        json={"title": body.title, "description": body.description, "grade_band_id": body.grade_band_id, "confirm": 1},
    )
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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.update_designation",
        json={
            "designation": designation_id,
            "title": body.title,
            "description": body.description,
            "grade_band_id": body.grade_band_id,
            "confirm": 1,
        },
    )
    mapped = _as_hr_designation(raw)
    if body.approved_headcount is not None:
        mapped = mapped.model_copy(update={"total": body.approved_headcount})
    return mapped


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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.create_grade_band",
        json={"code": body.code, "label": body.name, "confirm": 1},
    )
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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.update_grade_band",
        json={"grade_band": grade_id, "description": body.name, "confirm": 1},
    )
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
    raw = await _hr_write(auth, frappe, "eswasa_hr.master_data.create_location", json={"name": body.name, "confirm": 1})
    mapped = _as_hr_location(raw)
    if body.type:
        mapped = mapped.model_copy(update={"type": body.type})
    if body.address:
        mapped = mapped.model_copy(update={"address": body.address})
    if body.code:
        mapped = mapped.model_copy(update={"code": body.code})
    return mapped


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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.update_location",
        json={"location": location_id, "title": body.name, "confirm": 1},
    )
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
    raw = await _hr_write(auth, frappe, "eswasa_hr.master_data.create_cost_centre", json={"name": body.name, "confirm": 1})
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
    raw = await _hr_write(
        auth,
        frappe,
        "eswasa_hr.master_data.update_cost_centre",
        json={"cost_centre": cc_id, "status": body.status, "confirm": 1},
    )
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


def _quarter_start(today: date | None = None) -> date:
    d = today or date.today()
    month = ((d.month - 1) // 3) * 3 + 1
    return date(d.year, month, 1)


def _today_iso() -> str:
    return date.today().isoformat()


# Back-compat name used in earlier Phase 1 drafts.
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


def _require_system_manager(auth: AuthContext) -> None:
    """The company profile is a System Manager setting, not an HR one."""
    if not set(auth.user.roles or []) & SYSTEM_MANAGER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a System Manager can change the company profile.")


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


def _as_hr_record(raw: dict[str, Any]) -> HrEmployeeRecord:
    """The record keeps HrEmployeeSummary's fields (email, initials, desk_path) as a subset (plan 06)."""
    return HrEmployeeRecord.model_validate({**raw, **_as_hr_employee(raw).model_dump()})


@router.get("/hr/employees/{employee_id}", response_model=HrEmployeeRecord, tags=["hr"])
async def get_hr_employee(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeRecord:
    """The full person record (H1b, brief §12.2), scoped and job fields only, from eswasa_hr.record."""
    return _as_hr_record(await _hr_call(auth, frappe, f"{_RECORD}.record", params={"employee": employee_id}))


@router.get("/hr/employee-options", response_model=HrEmployeeOptions, tags=["hr"])
async def get_hr_employee_options(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeOptions:
    """Add person choices read from HRMS (genders), so the form never hard-codes them."""
    return HrEmployeeOptions.model_validate(await _hr_call(auth, frappe, "eswasa_hr.employees.form_options") or {})


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
    """Add a person. eswasa_hr.employees.create checks the HRMS-required fields, the department and the
    invitation; a missing field comes back as a plain 422 the form shows."""
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
    payload = body.model_dump(exclude={"confirm", "company", "profile_name"})
    raw = await _hr_write(auth, frappe, "eswasa_hr.employees.create", json={**payload, "confirm": 1})
    invited = str((raw or {}).get("user_id") or "")
    if body.invite and body.profile_name and invited:
        from app.admin.router import _apply_job_profile

        try:
            await _apply_job_profile(auth.frappe(frappe), user=invited, profile_name=body.profile_name.strip())
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 — profile is best-effort after invite
            logger.warning("apply profile %s on %s: %s", body.profile_name, invited, exc)
    return _as_hr_employee(raw or {})


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
    """Correct job fields. Moves, leaving and protected details are refused in eswasa_hr.employees.update."""
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
    raw = await _hr_write(auth, frappe, "eswasa_hr.employees.update", json={"employee": employee_id, "changes": updates, "confirm": 1})
    return _as_hr_employee(raw or {})


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


_LEAVE = "eswasa_hr.leave"


@router.get("/hr/leave", tags=["hr"])
async def list_hr_leave(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: int = 20,
) -> dict[str, list[HrLeaveSummary]]:
    """Time off queue (H4). Scoped in eswasa_hr.leave.requests: HR all, a manager their reports, else own."""
    params = {"status": status_filter} if status_filter else None
    rows = await _hr_call(auth, frappe, f"{_LEAVE}.requests", params=params) or []
    return {"items": [_as_hr_leave({**r, "name": r.get("id")}) for r in rows[: max(0, limit)]]}


@router.get("/hr/leave/requests", response_model=HrLeaveRequests, tags=["hr"])
async def list_hr_leave_requests(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    department: str | None = None,
    from_date: Annotated[str | None, Query(alias="from")] = None,
    to_date: Annotated[str | None, Query(alias="to")] = None,
) -> HrLeaveRequests:
    """Read-only request list with approver, SLA date and overdue/escalated flags (plan 03)."""
    params = {k: v for k, v in {"status": status_filter, "department": department, "from_date": from_date, "to_date": to_date}.items() if v}
    rows = await _hr_call(auth, frappe, f"{_LEAVE}.requests", params=params or None) or []
    return HrLeaveRequests(items=[HrLeaveRequest.model_validate(r) for r in rows])


@router.get("/hr/leave/calendar", response_model=HrLeaveCalendar, tags=["hr"])
async def get_hr_leave_calendar(
    start: str,
    end: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    department: str | None = None,
) -> HrLeaveCalendar:
    """Approved leave (solid), open requests (dashed) and Field Visits ("F"), up to 62 days, scoped."""
    params = {"start": start, "end": end, **({"department": department} if department else {})}
    return HrLeaveCalendar.model_validate(await _hr_call(auth, frappe, f"{_LEAVE}.calendar", params=params))


@router.get("/hr/leave/balances", response_model=HrLeaveBalances, tags=["hr"])
async def list_hr_leave_balances(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    employee: str | None = None,
) -> HrLeaveBalances:
    """Leave Ledger balances (own by default). Rows keep {leave_type, allocated, used, balance};
    no Leave Period or allocation gives an empty list and ``awaiting: "H14"``."""
    params = {"employee": employee} if employee else None
    return HrLeaveBalances.model_validate(await _hr_call(auth, frappe, f"{_LEAVE}.balances", params=params))


@router.get("/hr/leave/policy", response_model=HrLeavePolicy, tags=["hr"])
async def get_hr_leave_policy(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrLeavePolicy:
    """Configured Leave Types and their policy fields, read-only (brief §5.2; H14 until ESWASA sets them)."""
    return HrLeavePolicy.model_validate(await _hr_call(auth, frappe, f"{_LEAVE}.policy"))


@router.post("/hr/leave/{leave_id}/cancel", tags=["hr"])
async def cancel_hr_leave(
    leave_id: str,
    body: HrLeaveCancelBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """The applicant cancels an Open request or Approved leave that hasn't started (rules in eswasa_hr.leave)."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.leave.cancel",
        actor=auth.user.username,
        resource=f"Leave Application:{leave_id}",
        detail={"reason": body.reason},
        confirmed=True,
    )
    return await _hr_write(auth, frappe, f"{_LEAVE}.cancel", json={"name": leave_id, "reason": body.reason, "confirm": True})


_EXPENSES = "eswasa_hr.expenses"


def _absolute_attachment(url: str, request: Request) -> str:
    """Core's local media fallback returns ``/api/media/<key>``; Frappe's File needs an absolute link."""
    return f"{str(request.base_url).rstrip('/')}{url}" if url.startswith("/api/media/") else url


@router.get("/hr/expense-claims", response_model=HrExpenseClaims, tags=["hr"])
async def list_expense_claims(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    employee: str | None = None,
    department: str | None = None,
) -> HrExpenseClaims:
    """Expense claims (plan 05). HR and Finance see all; others their own and the ones routed to them."""
    params = {k: v for k, v in {"status": status_filter, "employee": employee, "department": department}.items() if v}
    rows = await _hr_call(auth, frappe, f"{_EXPENSES}.claims", params=params or None) or []
    return HrExpenseClaims(items=[HrExpenseClaim.model_validate(r) for r in rows])


@router.get("/hr/expense-claims/{claim_id}", response_model=HrExpenseClaim, tags=["hr"])
async def get_expense_claim(
    claim_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrExpenseClaim:
    """One claim with its lines and receipts, scoped like the list."""
    return HrExpenseClaim.model_validate(await _hr_call(auth, frappe, f"{_EXPENSES}.detail", params={"name": claim_id}))


@router.get("/hr/me/expense-claims", response_model=HrExpenseClaims, tags=["hr"])
async def list_my_expense_claims(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrExpenseClaims:
    """The caller's own claims, with where each one is and who decides it."""
    rows = await _hr_call(auth, frappe, f"{_EXPENSES}.mine") or []
    return HrExpenseClaims(items=[HrExpenseClaim.model_validate(r) for r in rows])


@router.get("/hr/me/expense-claims/options", response_model=HrExpenseOptions, tags=["hr"])
async def get_my_expense_options(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrExpenseOptions:
    """The claim form's expense types and receipt threshold (set by ESWASA Finance; nothing invented)."""
    return HrExpenseOptions.model_validate(await _hr_call(auth, frappe, f"{_EXPENSES}.options") or {})


@router.post("/hr/me/expense-claims", tags=["hr"])
async def submit_my_expense_claim(
    body: HrExpenseClaimBody,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """Send a claim to your expense approver. Decisions happen in Approvals; rules live in eswasa_hr.expenses."""
    _require_confirm(body.confirm)
    lines = [line.model_dump(exclude={"sanctioned"}, exclude_none=True) for line in body.lines]
    attachments = [{"file_name": a.file_name, "url": _absolute_attachment(a.url, request)} for a in body.attachments]
    audit_log(
        action="hr.expense_claim.submit",
        actor=auth.user.username,
        resource="Expense Claim",
        detail={"lines": len(lines), "total": round(sum(line["amount"] for line in lines), 2), "attachments": len(attachments)},
        confirmed=True,
    )
    return await _hr_write(auth, frappe, f"{_EXPENSES}.submit",
                           json={"lines": lines, "description": body.description, "attachments": attachments, "confirm": True})


_RECORD = "eswasa_hr.record"
_DOCS = "eswasa_hr.documents"
_PROFILE = "eswasa_hr.profile_changes"
_DOC_TYPES = {"application/pdf", "image/jpeg", "image/png"}
_DOC_MAX_BYTES = 5 * 1024 * 1024  # as the careers CV


@router.get("/hr/me/record", response_model=HrEmployeeRecord, tags=["hr"])
async def get_my_hr_record(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeRecord:
    """E5 My details: the caller's own record (job fields only)."""
    return _as_hr_record(await _hr_call(auth, frappe, f"{_RECORD}.my_record"))


async def _store_document(file: UploadFile, store: MediaStore, prefix: str = "hr/documents") -> str:
    """Plan 06 upload pattern (S8 reuses it): PDF or image, 5 MB, kept privately; Frappe keeps the media key."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Attach the file.")
    if len(data) > _DOC_MAX_BYTES:
        raise HTTPException(status_code=413, detail="The file must be 5 MB or smaller.")
    if (file.content_type or "") not in _DOC_TYPES:
        raise HTTPException(status_code=415, detail="Send the document as a PDF or an image (JPEG or PNG).")
    try:
        return store.put_bytes(data, filename=file.filename, content_type=file.content_type, prefix=prefix).key
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/hr/employees/{employee_id}/documents", response_model=HrEmployeeDocuments, tags=["hr"])
async def list_employee_documents(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeDocuments:
    """A person's documents and the required ones missing. File links only for HR and the person."""
    return HrEmployeeDocuments.model_validate(await _hr_call(auth, frappe, f"{_DOCS}.documents", params={"employee": employee_id}))


@router.post("/hr/employees/{employee_id}/documents", response_model=HrEmployeeDocuments, tags=["hr"])
async def upload_employee_document(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
    document_type: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    confirm: Annotated[bool, Form()] = False,
    expires_on: Annotated[str | None, Form()] = None,
) -> HrEmployeeDocuments:
    """HR adds a document to someone's record (or the person to their own). Rules live in eswasa_hr.documents."""
    _require_confirm(confirm)
    key = await _store_document(file, store)
    audit_log(action="hr.document.upload", actor=auth.user.username, resource=f"Employee:{employee_id}",
              detail={"document_type": document_type, "file": key}, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_DOCS}.upload",
                          json={"employee": employee_id, "document_type": document_type, "file": key, "expires_on": expires_on or None, "confirm": True})
    return HrEmployeeDocuments.model_validate(raw)


@router.get("/hr/me/documents", response_model=HrEmployeeDocuments, tags=["hr"])
async def list_my_documents(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeDocuments:
    return HrEmployeeDocuments.model_validate(await _hr_call(auth, frappe, f"{_DOCS}.my_documents"))


@router.post("/hr/me/documents", response_model=HrEmployeeDocuments, tags=["hr"])
async def upload_my_document(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
    document_type: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    confirm: Annotated[bool, Form()] = False,
    expires_on: Annotated[str | None, Form()] = None,
) -> HrEmployeeDocuments:
    """Add a document to your own record. It shows as "To check" until someone else in HR verifies it."""
    _require_confirm(confirm)
    key = await _store_document(file, store)
    audit_log(action="hr.document.upload_own", actor=auth.user.username, resource="Employee Document",
              detail={"document_type": document_type, "file": key}, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_DOCS}.upload_mine",
                          json={"document_type": document_type, "file": key, "expires_on": expires_on or None, "confirm": True})
    return HrEmployeeDocuments.model_validate(raw)


@router.post("/hr/documents/{name}/verify", response_model=HrEmployeeDocuments, tags=["hr"])
async def verify_employee_document(
    name: str,
    body: HrConfirmBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEmployeeDocuments:
    """HR verifies a document someone else uploaded (four-eyes in eswasa_hr.documents)."""
    _require_confirm(body.confirm)
    audit_log(action="hr.document.verify", actor=auth.user.username, resource=f"Employee Document:{name}", detail={}, confirmed=True)
    return HrEmployeeDocuments.model_validate(await _hr_write(auth, frappe, f"{_DOCS}.verify", json={"name": name, "confirm": True}))


@router.get("/hr/documents/{name}/file", tags=["hr"])
async def download_employee_document(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
) -> Response:
    """The stored file. HR and the person only: eswasa_hr refuses anyone else before the file is read. Audited."""
    raw = await _hr_call(auth, frappe, f"{_DOCS}.file_link", params={"name": name}) or {}
    key = str(raw.get("file") or "")
    if not key:
        raise HTTPException(status_code=404, detail="No file on this document")
    if key.startswith(("http://", "https://", "/files/", "/private/")):
        return Response(status_code=307, headers={"Location": key})
    try:
        body, ctype = store.get_bytes(key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document file not found") from exc
    audit_log(action="hr.document.viewed", actor=auth.user.username, resource=f"Employee Document:{name}",
              detail={"employee": raw.get("employee")}, confirmed=True)
    return Response(content=body, media_type=ctype,
                    headers={"Content-Disposition": f'inline; filename="{quote(name)}"', "Cache-Control": "private, no-store"})


@router.get("/hr/me/profile-changes", response_model=HrProfileChanges, tags=["hr"])
async def list_my_profile_changes(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrProfileChanges:
    """E5: your correction requests and where each one is, plus the details you may ask to correct.
    HR decides them in Approvals."""
    rows = await _hr_call(auth, frappe, f"{_PROFILE}.mine") or []
    fields = await _hr_call(auth, frappe, f"{_PROFILE}.fields") or []
    return HrProfileChanges(items=[HrProfileChange.model_validate(r) for r in rows], fields=[HrProfileChangeField.model_validate(f) for f in fields])


@router.post("/hr/me/profile-changes", response_model=HrProfileChange, tags=["hr"])
async def request_profile_change(
    body: HrProfileChangeBody,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrProfileChange:
    """Ask HR to correct a personal detail or the spelling of your name. Job and pay fields are refused in eswasa_hr."""
    _require_confirm(body.confirm)
    evidence = _absolute_attachment(body.evidence, request) if body.evidence else None
    audit_log(action="hr.profile_change.request", actor=auth.user.username, resource="Profile Change Request",
              detail={"field": body.field, "evidence": bool(evidence)}, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_PROFILE}.submit",
                          json={"field": body.field, "requested_value": body.requested_value, "reason": body.reason, "evidence": evidence, "confirm": True})
    return HrProfileChange.model_validate(raw)


@router.get("/hr/employees/{employee_id}/certificate-of-service", tags=["hr"])
async def get_certificate_of_service(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> Response:
    """The certificate of service PDF (print format Certificate of Service). HR only, enforced in eswasa_hr; audited."""
    raw = await _hr_call(auth, frappe, "eswasa_hr.certificate.certificate", params={"employee": employee_id}) or {}
    try:
        pdf = base64.b64decode(str(raw.get("content") or ""), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=502, detail="The certificate couldn't be printed.") from exc
    if not pdf:
        raise HTTPException(status_code=502, detail="The certificate couldn't be printed.")
    audit_log(action="hr.certificate_of_service", actor=auth.user.username, resource=f"Employee:{employee_id}", detail={"bytes": len(pdf)}, confirmed=True)
    filename = str(raw.get("file_name") or f"Certificate of service {employee_id}.pdf")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{quote(filename)}"', "Cache-Control": "private, no-store"})


_LEAVE_APP = "hrms.hr.doctype.leave_application.leave_application"
_EMPLOYEE_SELF_FIELDS = [
    "name",
    "employee_name",
    "department",
    "designation",
    "status",
    "date_of_joining",
    "user_id",
    "company_email",
    "reports_to",
    "leave_approver",
]


async def _my_employee(session: FrappeClient, username: str) -> dict[str, Any] | None:
    """The Employee linked to this login through user_id, or None."""
    rows = await _frappe_get_list(
        session,
        "Employee",
        fields=_EMPLOYEE_SELF_FIELDS,
        filters={"user_id": username},
        limit=1,
        soft=True,
    )
    return rows[0] if rows else None


async def _leave_details(session: FrappeClient, employee: str, on_date: str) -> dict[str, Any]:
    """HRMS get_leave_details: allocations per leave type plus the leave approver."""
    try:
        raw = await session.method(
            f"{_LEAVE_APP}.get_leave_details", json={"employee": employee, "date": on_date}
        )
    except FrappeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def _balances_from_details(details: dict[str, Any]) -> list[HrLeaveBalance]:
    out: list[HrLeaveBalance] = []
    for leave_type, v in (details.get("leave_allocation") or {}).items():
        if not isinstance(v, dict):
            continue
        out.append(
            HrLeaveBalance(
                leave_type=str(leave_type),
                allocated=float(v.get("total_leaves") or 0),
                used=float(v.get("leaves_taken") or 0),
                balance=float(v.get("remaining_leaves") or 0),
            )
        )
    return out


async def _person_ref(session: FrappeClient, user: str | None) -> HrPersonRef | None:
    if not user:
        return None
    rows = await _frappe_get_list(
        session, "User", fields=["full_name"], filters={"name": user}, limit=1, soft=True
    )
    name = rows[0].get("full_name") if rows else None
    return HrPersonRef(user=user, name=name or user)


def _weekdays_between(start: date, end: date) -> int:
    days = 0
    d = start
    while d <= end:
        if d.weekday() < 5:
            days += 1
        d += timedelta(days=1)
    return days


@router.get("/hr/me", response_model=HrMe, tags=["hr"])
async def get_hr_me(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrMe:
    """The caller's own record, line manager, leave approver, balances and recent leave."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        emp = await _my_employee(session, auth.user.username)
        if not emp:
            return HrMe(linked=False)
        manager: str | None = None
        if emp.get("reports_to"):
            mgr = await _frappe_get_list(
                session,
                "Employee",
                fields=["employee_name"],
                filters={"name": emp["reports_to"]},
                limit=1,
                soft=True,
            )
            manager = mgr[0].get("employee_name") if mgr else None
        details = await _leave_details(session, emp["name"], _today_iso())
        approver = await _person_ref(
            session, emp.get("leave_approver") or details.get("leave_approver")
        )
        rows = await _frappe_get_list(
            session,
            "Leave Application",
            fields=["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "status"],
            filters={"employee": emp["name"]},
            limit=20,
            order_by="from_date desc",
            soft=True,
        )
        return HrMe(
            linked=True,
            employee=_as_hr_employee(emp),
            line_manager=manager,
            leave_approver=approver,
            balances=_balances_from_details(details),
            leave=[_as_hr_leave(r) for r in rows],
        )
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


@router.post("/hr/leave/preview", response_model=HrLeavePreview, tags=["hr"])
async def preview_hr_leave(
    body: HrLeavePreviewBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrLeavePreview:
    """Working days, balance after, who decides, and work in those dates. Writes nothing."""
    try:
        start = date.fromisoformat(body.from_date[:10])
        end = date.fromisoformat(body.to_date[:10])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD") from exc
    if end < start:
        raise HTTPException(status_code=422, detail="The end date is before the start date")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    try:
        emp = await _my_employee(session, auth.user.username)
        if not emp:
            raise HTTPException(
                status_code=409,
                detail="Your login isn't linked to an employee record. Ask HR to link it.",
            )
        try:
            raw_days = await session.method(
                f"{_LEAVE_APP}.get_number_of_leave_days",
                json={
                    "employee": emp["name"],
                    "leave_type": body.leave_type,
                    "from_date": start.isoformat(),
                    "to_date": end.isoformat(),
                },
            )
            days = float(raw_days)
        except (FrappeError, TypeError, ValueError):
            days = float(_weekdays_between(start, end))

        details = await _leave_details(session, emp["name"], start.isoformat())
        alloc = (details.get("leave_allocation") or {}).get(body.leave_type)
        balance = float(alloc.get("remaining_leaves") or 0) if isinstance(alloc, dict) else None
        approver = await _person_ref(
            session, emp.get("leave_approver") or details.get("leave_approver")
        )
        visits = await _frappe_get_list(
            session,
            "Field Visit",
            fields=["name", "title", "planned_date", "customer"],
            filters=[
                ["lead_auditor", "=", auth.user.username],
                ["planned_date", "between", [start.isoformat(), end.isoformat()]],
            ],
            limit=20,
            order_by="planned_date asc",
            soft=True,
        )
        conflicts = [
            HrWorkConflict(
                id=str(v.get("name") or ""),
                title=str(v.get("title") or v.get("customer") or v.get("name") or "Field visit"),
                date=v.get("planned_date"),
            )
            for v in visits
        ]
        warnings: list[str] = []
        if balance is not None and days > balance:
            warnings.append(f"This is more than your balance of {balance:g} days.")
        if alloc is None and details.get("leave_allocation") is not None:
            warnings.append(f"You have no {body.leave_type} allocated this leave year.")
        if approver is None:
            warnings.append("You have no leave approver yet. HR needs to set one before you can apply.")
        return HrLeavePreview(
            days=days,
            balance=balance,
            balance_after=(balance - days) if balance is not None else None,
            approver=approver,
            conflicts=conflicts,
            warnings=warnings,
        )
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


_DECL = "eswasa_hr.declarations"


@router.get("/hr/me/declaration", response_model=HrMyDeclaration, tags=["hr"])
async def get_my_declaration(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrMyDeclaration:
    """This year's impartiality and confidentiality declaration for the caller (E6)."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(f"{_DECL}.my_declaration")
        return HrMyDeclaration.model_validate(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="Declaration unavailable")  # pragma: no cover


@router.post("/hr/me/declaration", response_model=HrMyDeclaration, tags=["hr"])
async def sign_my_declaration(
    body: HrSignDeclarationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrMyDeclaration:
    """Sign this year's declaration. Rules (own record, confidentiality, signature) live in eswasa_hr."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.declaration.sign",
        actor=auth.user.username,
        resource="Impartiality Declaration",
        detail={"interests": len(body.interests), "nothing_else": body.nothing_else},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            f"{_DECL}.sign",
            json={
                "interests": [i.model_dump() for i in body.interests],
                "nothing_else": int(body.nothing_else),
                "confidentiality_accepted": int(body.confidentiality_accepted),
                "signed_name": body.signed_name,
                "confirm": 1,
            },
        )
        return HrMyDeclaration.model_validate(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="Declaration not saved")  # pragma: no cover


@router.get("/hr/impartiality", response_model=HrDeclarationRegister, tags=["hr"])
async def get_declaration_register(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    year: int | None = None,
) -> HrDeclarationRegister:
    """Signed and outstanding declarations for the year (H5c). HR roles only (enforced in Frappe)."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(
            f"{_DECL}.register", params={"year": year} if year else None
        )
        return HrDeclarationRegister.model_validate(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="Register unavailable")  # pragma: no cover


@router.post("/hr/impartiality/remind", response_model=HrRemindResult, tags=["hr"])
async def remind_declarations(
    body: HrRemindBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrRemindResult:
    """Open a task for everyone who hasn't signed (idempotent; same as R-H5)."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.declaration.remind",
        actor=auth.user.username,
        resource="Impartiality Declaration",
        detail={},
        confirmed=True,
    )
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        raw = await auth.frappe(frappe).method(f"{_DECL}.remind", json={"confirm": 1})
        return HrRemindResult.model_validate(raw)
    except FrappeError as exc:
        _raise_from_frappe(exc)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="Reminders not sent")  # pragma: no cover


_AUTH = "eswasa_hr.authorisations"


async def _hr_call(
    auth: AuthContext,
    frappe: FrappeClient,
    method: str,
    *,
    json: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> Any:
    """Call an eswasa_hr whitelisted method as the user; rules and permissions live there."""
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    try:
        return await auth.frappe(frappe).method(method, json=json, params=params)
    except FrappeError as exc:
        _raise_from_frappe(exc)
        raise  # pragma: no cover


async def _hr_write(
    auth: AuthContext,
    frappe: FrappeClient,
    method: str,
    *,
    json: dict[str, Any],
) -> Any:
    """``_hr_call`` for forms: a rule the input breaks comes back as 422 with eswasa_hr's plain text."""
    try:
        return await _hr_call(auth, frappe, method, json=json)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_400_BAD_REQUEST:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail) from exc
        raise


@router.get("/hr/competence/matrix", response_model=HrCompetenceMatrix, tags=["hr"])
async def get_competence_matrix(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCompetenceMatrix:
    """People × competences with cover per competence (H5). HR roles only (enforced in eswasa_hr)."""
    return HrCompetenceMatrix.model_validate(await _hr_call(auth, frappe, f"{_AUTH}.matrix"))


@router.get("/hr/competence/expiring", tags=["hr"])
async def list_expiring_authorisations(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    days: int = 60,
) -> dict[str, list[HrAuthorisationRow]]:
    raw = await _hr_call(auth, frappe, f"{_AUTH}.expiring", params={"days": days})
    return {"items": [HrAuthorisationRow.model_validate(r) for r in (raw or [])]}


@router.get("/hr/competence/authorisations/{name}", response_model=HrAuthorisationDetail, tags=["hr"])
async def get_authorisation(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAuthorisationDetail:
    return HrAuthorisationDetail.model_validate(await _hr_call(auth, frappe, f"{_AUTH}.detail", params={"name": name}))


@router.post(
    "/hr/competence/authorisations",
    response_model=HrAuthorisationDetail,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def request_authorisation(
    body: HrAuthorisationRequestBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAuthorisationDetail:
    """HR records an authorisation; it goes to the head of the person's department in Approvals."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.authorisation.request",
        actor=auth.user.username,
        resource="Staff Authorisation",
        detail={"employee": body.employee or body.external_person, "skill": body.skill, "valid_from": body.valid_from},
        confirmed=True,
    )
    raw = await _hr_call(
        auth,
        frappe,
        f"{_AUTH}.request",
        json={
            "employee": body.employee,
            "external_person": body.external_person,
            "department": body.department,
            "skill": body.skill,
            "valid_from": body.valid_from,
            "valid_to": body.valid_to,
            "evidence": [e.model_dump(include={"evidence_type", "reference", "notes", "file"}, exclude_none=True) for e in body.evidence],
            "confirm": 1,
        },
    )
    return HrAuthorisationDetail.model_validate(raw)


@router.get("/hr/me/competence", tags=["hr"])
async def list_my_authorisations(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrAuthorisationRow]]:
    raw = await _hr_call(auth, frappe, f"{_AUTH}.mine")
    return {"items": [HrAuthorisationRow.model_validate(r) for r in (raw or [])]}


@router.post("/hr/me/competence/renewal", tags=["hr"])
async def ask_for_renewal(
    body: HrRenewalBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, int]:
    """Employee asks HR to renew an authorisation; each HR Manager gets a task."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.authorisation.renewal_requested",
        actor=auth.user.username,
        resource="Staff Authorisation",
        detail={"skill": body.skill},
        confirmed=True,
    )
    raw = await _hr_call(
        auth, frappe, f"{_AUTH}.ask_renewal", json={"skill": body.skill, "note": body.note, "confirm": 1}
    )
    return {"sent_to": int((raw or {}).get("sent_to", 0))}


_TRAINING = "eswasa_hr.training"
_EXTERNAL = "eswasa_hr.external"
_PACK = "eswasa_hr.evidence_pack"


async def _stream_stored(store: MediaStore, key: str, name: str, action: str, actor: str, detail: dict[str, Any]) -> Response:
    """Plan 06/07: a privately stored file (or a redirect to Frappe's own), after eswasa_hr has allowed it. Audited."""
    if key.startswith(("http://", "https://", "/files/", "/private/")):
        return Response(status_code=307, headers={"Location": key})
    try:
        body, ctype = store.get_bytes(key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc
    audit_log(action=action, actor=actor, resource=name, detail=detail, confirmed=True)
    return Response(content=body, media_type=ctype,
                    headers={"Content-Disposition": f'inline; filename="{quote(name)}"', "Cache-Control": "private, no-store"})


@router.post("/hr/competence/authorisations/{name}/evidence", response_model=HrAuthorisationDetail, tags=["hr"])
async def add_authorisation_evidence(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
    evidence_type: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    confirm: Annotated[bool, Form()] = False,
    reference: Annotated[str | None, Form()] = None,
    notes: Annotated[str | None, Form()] = None,
) -> HrAuthorisationDetail:
    """Plan 07 step 5: HR attaches a file to an authorisation still being prepared (rules in eswasa_hr)."""
    _require_confirm(confirm)
    key = await _store_document(file, store, prefix="hr/evidence")
    audit_log(action="hr.authorisation.evidence", actor=auth.user.username, resource=f"Staff Authorisation:{name}",
              detail={"evidence_type": evidence_type, "file": key}, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_AUTH}.add_evidence",
                          json={"name": name, "evidence_type": evidence_type, "file": key, "reference": reference or None,
                                "notes": notes or None, "confirm": True})
    return HrAuthorisationDetail.model_validate(raw)


@router.get("/hr/competence/evidence/{row}/file", tags=["hr"])
async def download_authorisation_evidence(
    row: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
) -> Response:
    """An evidence file. HR and the person only: eswasa_hr refuses anyone else before the file is read."""
    raw = await _hr_call(auth, frappe, f"{_AUTH}.evidence_file", params={"row": row}) or {}
    key = str(raw.get("file") or "")
    if not key:
        raise HTTPException(status_code=404, detail="No file on this evidence")
    return await _stream_stored(store, key, row, "hr.authorisation.evidence_viewed", auth.user.username,
                                {"authorisation": raw.get("authorisation"), "employee": raw.get("employee")})


@router.get("/hr/competence/training", response_model=HrTrainingEvidence, tags=["hr"])
async def get_training_evidence(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    employee: str,
    skill: str | None = None,
) -> HrTrainingEvidence:
    """Plan 07 step 6: Training Results (and LMS completions, if installed) that can back an authorisation."""
    params = {"employee": employee, **({"skill": skill} if skill else {})}
    return HrTrainingEvidence.model_validate(await _hr_call(auth, frappe, f"{_TRAINING}.evidence", params=params))


@router.get("/hr/external-people", response_model=HrExternalPeople, tags=["hr"])
async def list_external_people(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrExternalPeople:
    """Plan 07 step 7 (H10): the external personnel register. ``enabled: false`` while the flag is off."""
    return HrExternalPeople.model_validate(await _hr_call(auth, frappe, f"{_EXTERNAL}.list_people"))


@router.post("/hr/external-people", response_model=HrExternalPerson, status_code=status.HTTP_201_CREATED, tags=["hr"])
async def create_external_person(
    body: HrExternalPersonBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrExternalPerson:
    """Add a contract auditor or expert. 404 with reason "disabled" until ESWASA turns the register on (H10)."""
    _require_confirm(body.confirm)
    audit_log(action="hr.external_person.create", actor=auth.user.username, resource="External Person",
              detail={"role": body.role}, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_EXTERNAL}.create", json={**body.model_dump(exclude={"confirm"}), "confirm": True}) or {}
    if raw.get("disabled"):
        raise HTTPException(status_code=404, detail={"reason": "disabled", "message": raw.get("message")})
    return HrExternalPerson.model_validate(raw)


def _pack_job(raw: dict[str, Any]) -> HrEvidencePackJob:
    job = HrEvidencePackJob.model_validate(raw)
    if job.ready:
        job.download = f"/api/hr/evidence-pack/{quote(job.id)}/download"
    return job


@router.post("/hr/evidence-pack", response_model=HrEvidencePackJob, status_code=status.HTTP_202_ACCEPTED, tags=["hr"])
async def request_evidence_pack(
    body: HrEvidencePackBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEvidencePackJob:
    """Plan 07 step 8 (H11): build the accreditation evidence pack in the background. HR Manager / Quality Manager."""
    _require_confirm(body.confirm)
    scope = body.model_dump(include={"employee", "external_person", "scheme", "discipline"}, exclude_none=True)
    audit_log(action="hr.evidence_pack.request", actor=auth.user.username, resource="HR Evidence Pack",
              detail=scope, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_PACK}.request", json={**scope, "sections": body.sections, "confirm": True})
    return _pack_job(raw)


@router.get("/hr/evidence-pack/{job}", response_model=HrEvidencePackJob, tags=["hr"])
async def get_evidence_pack(
    job: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEvidencePackJob:
    """Where the pack is, and its download link once it's ready."""
    return _pack_job(await _hr_call(auth, frappe, f"{_PACK}.status", params={"pack": job}))


@router.get("/hr/evidence-pack/{job}/download", tags=["hr"])
async def download_evidence_pack(
    job: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
) -> Response:
    """The ZIP Frappe built, plus the evidence files kept in Core's media store. Audited."""
    import io
    import zipfile

    raw = await _hr_call(auth, frappe, f"{_PACK}.download", params={"pack": job}) or {}
    buf = io.BytesIO(base64.b64decode(raw.get("content") or ""))
    missing = []
    with zipfile.ZipFile(buf, "a", zipfile.ZIP_DEFLATED) as z:
        for f in raw.get("media_files") or []:
            try:
                data, _ = store.get_bytes(str(f.get("key")))
            except FileNotFoundError:
                missing.append(f.get("key"))
                continue
            z.writestr(str(f.get("path")), data)
        if missing:
            z.writestr("MISSING_FILES.txt", "These evidence files weren't found in the media store:\n" + "\n".join(map(str, missing)))
    audit_log(action="hr.evidence_pack.downloaded", actor=auth.user.username, resource=f"HR Evidence Pack:{job}",
              detail={"files": len(raw.get("media_files") or []), "missing": len(missing)}, confirmed=True)
    name = str(raw.get("file_name") or f"evidence-pack-{job}.zip")
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{quote(name)}"', "Cache-Control": "private, no-store"})


_REC = "eswasa_hr.recruitment"


@router.get("/hr/recruitment/vacancies", tags=["hr"])
async def list_vacancies(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrVacancy]]:
    """Approved posts with a vacancy (Staffing Plan − active employees − open requisitions)."""
    raw = await _hr_call(auth, frappe, f"{_REC}.vacancies")
    return {"items": [HrVacancy.model_validate(r) for r in (raw or [])]}


@router.get("/hr/recruitment", tags=["hr"])
async def list_requisitions(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrRequisition]]:
    """Requisitions with their opening and applicant counts by status (HR only)."""
    raw = await _hr_call(auth, frappe, f"{_REC}.requisitions")
    return {"items": [HrRequisition.model_validate(r) for r in (raw or [])]}


@router.post(
    "/hr/recruitment/requisitions",
    response_model=HrRequisition,
    status_code=status.HTTP_201_CREATED,
    tags=["hr"],
)
async def raise_requisition(
    body: HrRequisitionBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrRequisition:
    """Head of department or HR asks to fill a vacant, approved post. HR Managers decide in Approvals."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.requisition.raise",
        actor=auth.user.username,
        resource="Job Requisition",
        detail={"designation": body.designation, "department": body.department},
        confirmed=True,
    )
    payload = body.model_dump(exclude={"confirm"})
    raw = await _hr_call(auth, frappe, f"{_REC}.raise_requisition", json={**payload, "confirm": 1})
    return HrRequisition.model_validate(raw)


@router.get("/hr/recruitment/requisitions/{name}", response_model=HrRequisition, tags=["hr"])
async def get_requisition(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrRequisition:
    """One requisition with ``stage`` (Head, then HR) and ``waiting_on`` (named people), plan 08."""
    return HrRequisition.model_validate(await _hr_call(auth, frappe, f"{_REC}.requisition", params={"name": name}))


@router.post("/hr/recruitment/requisitions/{name}/publish", response_model=HrRequisition, tags=["hr"])
async def publish_requisition(
    name: str,
    body: HrPublishBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrRequisition:
    """Advertise an approved requisition on the careers page."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.requisition.publish",
        actor=auth.user.username,
        resource=f"Job Requisition:{name}",
        detail={"closes_on": body.closes_on},
        confirmed=True,
    )
    raw = await _hr_call(
        auth,
        frappe,
        f"{_REC}.publish",
        json={"requisition": name, **body.model_dump(exclude={"confirm"}), "confirm": 1},
    )
    return HrRequisition.model_validate(raw)


# --- Careers (public) -----------------------------------------------------------

_CV_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_CV_MAX_BYTES = 5 * 1024 * 1024
_APPLY_WINDOW_SECONDS = 600
_APPLY_MAX = 10
_APPLY_HITS: dict[str, list[float]] = {}


def _careers_rate_limit(request: Request) -> None:
    """At most 10 applications per connection per 10 minutes (in-memory, like the auth limiter)."""
    import time

    ip = request.client.host if request.client else "unknown"
    now = time.time()
    hits = [t for t in _APPLY_HITS.get(ip, []) if now - t < _APPLY_WINDOW_SECONDS]
    if len(hits) >= _APPLY_MAX:
        _APPLY_HITS[ip] = hits
        raise HTTPException(status_code=429, detail="Too many applications from this connection. Try again later.")
    hits.append(now)
    _APPLY_HITS[ip] = hits


@router.get("/careers/openings", tags=["careers"])
async def list_career_openings(
    auth: Annotated[AuthContext, Depends(get_actor)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[CareerOpening]]:
    """Published, open vacancies. No sample fallback: an empty list is the truth when Frappe is up."""
    raw = await _hr_call(auth, frappe, f"{_REC}.public_openings")
    return {"items": [CareerOpening.model_validate(r) for r in (raw or [])]}


@router.get("/careers/openings/{opening}", response_model=CareerOpening, tags=["careers"])
async def get_career_opening(
    opening: str,
    auth: Annotated[AuthContext, Depends(get_actor)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> CareerOpening:
    raw = await _hr_call(auth, frappe, f"{_REC}.public_opening_detail", params={"opening": opening})
    return CareerOpening.model_validate(raw)


@router.post(
    "/careers/openings/{opening}/apply",
    response_model=CareerApplicationReceipt,
    status_code=status.HTTP_201_CREATED,
    tags=["careers"],
)
async def apply_for_opening(
    opening: str,
    request: Request,
    auth: Annotated[AuthContext, Depends(get_actor)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
    applicant_name: Annotated[str, Form()],
    email: Annotated[str, Form()],
    consent: Annotated[bool, Form()],
    cv: Annotated[UploadFile, File()],
    phone: Annotated[str | None, Form()] = None,
    cover_letter: Annotated[str | None, Form()] = None,
) -> CareerApplicationReceipt:
    """Online application (P3). The CV is stored privately; the applicant record keeps its key."""
    _careers_rate_limit(request)
    if not consent:
        raise HTTPException(status_code=422, detail="Agree to ESWASA keeping your application to consider it.")
    data = await cv.read()
    if not data:
        raise HTTPException(status_code=422, detail="Attach your CV.")
    if len(data) > _CV_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Your CV must be 5 MB or smaller.")
    if (cv.content_type or "") not in _CV_TYPES:
        raise HTTPException(status_code=415, detail="Send your CV as a PDF or Word document.")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Applications are closed for a moment. Try again shortly.")
    try:
        stored = store.put_bytes(data, filename=cv.filename, content_type=cv.content_type, prefix="careers/cv")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    audit_log(
        action="careers.apply",
        actor=auth.user.username,
        resource=f"Job Opening:{opening}",
        detail={"cv": stored.key, "size": stored.size},
        confirmed=True,
    )
    raw = await _hr_call(
        auth,
        frappe,
        f"{_REC}.apply",
        json={
            "opening": opening,
            "applicant_name": applicant_name,
            "email": email,
            "phone": phone,
            "cover_letter": cover_letter,
            "cv_link": stored.key,
            "consent": 1,
        },
    )
    return CareerApplicationReceipt.model_validate(raw)


_HIRE = "eswasa_hr.hiring"


@router.get("/hr/recruitment/openings/{opening}/pipeline", response_model=HrPipeline, tags=["hr"])
async def get_pipeline(
    opening: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrPipeline:
    """One opening's applicants by stage (HR only)."""
    return HrPipeline.model_validate(await _hr_call(auth, frappe, f"{_HIRE}.pipeline", params={"opening": opening}))


@router.get("/hr/recruitment/applicants/{name}", response_model=HrApplicantDetail, tags=["hr"])
async def get_applicant(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrApplicantDetail:
    return HrApplicantDetail.model_validate(await _hr_call(auth, frappe, f"{_HIRE}.applicant", params={"name": name}))


@router.get("/hr/recruitment/applicants/{name}/cv", tags=["hr"])
async def download_applicant_cv(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    store: Annotated[MediaStore, Depends(get_media_store)],
) -> Response:
    """The applicant's CV. HR only: eswasa_hr refuses anyone else before the file is read."""
    key = await _hr_call(auth, frappe, f"{_HIRE}.cv_link", params={"name": name})
    if not key:
        raise HTTPException(status_code=404, detail="No CV on file")
    if str(key).startswith(("http://", "https://", "/files/", "/private/")):
        return Response(status_code=307, headers={"Location": str(key)})
    try:
        body, ctype = store.get_bytes(str(key))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="CV file not found") from exc
    audit_log(action="hr.applicant.cv_viewed", actor=auth.user.username, resource=f"Job Applicant:{name}", detail={}, confirmed=True)
    return Response(
        content=body,
        media_type=ctype,
        headers={"Content-Disposition": f'inline; filename="{name}-cv"', "Cache-Control": "private, no-store"},
    )


@router.post("/hr/recruitment/applicants/{name}/status", response_model=HrApplicantDetail, tags=["hr"])
async def set_applicant_status(
    name: str,
    body: HrApplicantStatusBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrApplicantDetail:
    """Shortlist, hold or decline an applicant (a process step, not an approval)."""
    _require_confirm(body.confirm)
    audit_log(action="hr.applicant.status", actor=auth.user.username, resource=f"Job Applicant:{name}", detail={"status": body.status}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_HIRE}.set_status", json={"name": name, "status": body.status, "note": body.note, "confirm": 1})
    return HrApplicantDetail.model_validate(raw)


@router.get("/hr/recruitment/interview-types", tags=["hr"])
async def list_interview_types(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[str]]:
    return {"items": list(await _hr_call(auth, frappe, f"{_HIRE}.interview_types") or [])}


@router.post("/hr/recruitment/applicants/{name}/interviews", response_model=HrApplicantDetail, tags=["hr"])
async def schedule_interview(
    name: str,
    body: HrScheduleInterviewBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrApplicantDetail:
    """Schedule an interview; each interviewer gets a task to record feedback."""
    _require_confirm(body.confirm)
    audit_log(action="hr.interview.schedule", actor=auth.user.username, resource=f"Job Applicant:{name}", detail={"on": body.scheduled_on, "panel": len(body.interviewers)}, confirmed=True)
    raw = await _hr_call(
        auth, frappe, f"{_HIRE}.schedule", json={"applicant": name, **body.model_dump(exclude={"confirm"}), "confirm": 1}
    )
    return HrApplicantDetail.model_validate(raw)


@router.post("/hr/recruitment/interviews/{name}/result", response_model=HrApplicantDetail, tags=["hr"])
async def record_interview_result(
    name: str,
    body: HrInterviewResultBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrApplicantDetail:
    _require_confirm(body.confirm)
    audit_log(action="hr.interview.result", actor=auth.user.username, resource=f"Interview:{name}", detail={"status": body.status}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_HIRE}.interview_result", json={"interview": name, "status": body.status, "confirm": 1})
    return HrApplicantDetail.model_validate(raw)


@router.get("/hr/me/interviews", tags=["hr"])
async def list_my_interviews(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrMyInterview]]:
    """Interviews where I'm on the panel and still owe feedback."""
    raw = await _hr_call(auth, frappe, f"{_HIRE}.my_interviews")
    return {"items": [HrMyInterview.model_validate(r) for r in (raw or [])]}


@router.post("/hr/me/interviews/{name}/feedback", tags=["hr"])
async def record_my_feedback(
    name: str,
    body: HrFeedbackBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, str]:
    _require_confirm(body.confirm)
    audit_log(action="hr.interview.feedback", actor=auth.user.username, resource=f"Interview:{name}", detail={"result": body.result}, confirmed=True)
    raw = await _hr_call(
        auth,
        frappe,
        f"{_HIRE}.feedback",
        json={"interview": name, "result": body.result, "ratings": [r.model_dump() for r in body.ratings], "feedback": body.feedback, "confirm": 1},
    )
    return {"interview": str((raw or {}).get("interview", name)), "result": str((raw or {}).get("result", body.result))}


@router.post("/hr/recruitment/applicants/{name}/offer", response_model=HrApplicantDetail, tags=["hr"])
async def make_offer(
    name: str,
    body: HrOfferBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrApplicantDetail:
    """Prepare an offer; another HR Manager approves it in Approvals before the letter goes out."""
    _require_confirm(body.confirm)
    audit_log(action="hr.offer.prepare", actor=auth.user.username, resource=f"Job Applicant:{name}", detail={"offer_date": body.offer_date}, confirmed=True)
    raw = await _hr_call(
        auth, frappe, f"{_HIRE}.make_offer", json={"applicant": name, "offer_date": body.offer_date, "terms": body.terms, "confirm": 1}
    )
    return HrApplicantDetail.model_validate(raw)


@router.get("/hr/recruitment/offers/{name}/letter", tags=["hr"])
async def get_offer_letter(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> Response:
    """The offer letter PDF (print format ESWASA Offer Letter). HR only, enforced in eswasa_hr; audited."""
    raw = await _hr_call(auth, frappe, f"{_HIRE}.offer_letter", params={"offer": name}) or {}
    try:
        pdf = base64.b64decode(str(raw.get("content") or ""), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=502, detail="The offer letter couldn't be printed.") from exc
    if not pdf:
        raise HTTPException(status_code=502, detail="The offer letter couldn't be printed.")
    audit_log(action="hr.offer.letter", actor=auth.user.username, resource=f"Job Offer:{name}", detail={"bytes": len(pdf)}, confirmed=True)
    filename = str(raw.get("file_name") or f"Offer letter {name}.pdf")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{quote(filename)}"', "Cache-Control": "private, no-store"})


@router.post("/hr/recruitment/offers/{name}/answer", response_model=HrApplicantDetail, tags=["hr"])
async def record_offer_answer(
    name: str,
    body: HrOfferAnswerBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrApplicantDetail:
    _require_confirm(body.confirm)
    audit_log(action="hr.offer.answer", actor=auth.user.username, resource=f"Job Offer:{name}", detail={"answer": body.answer}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_HIRE}.answer", json={"offer": name, "answer": body.answer, "confirm": 1})
    return HrApplicantDetail.model_validate(raw)


@router.post("/hr/recruitment/offers/{name}/employee", status_code=status.HTTP_201_CREATED, tags=["hr"])
async def create_employee_from_offer(
    name: str,
    body: HrCreateEmployeeBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, str]:
    """Create the Employee from an accepted offer (HRMS make_employee); details carry over."""
    _require_confirm(body.confirm)
    audit_log(action="hr.offer.employee", actor=auth.user.username, resource=f"Job Offer:{name}", detail={"date_of_joining": body.date_of_joining}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_HIRE}.create_employee", json={"offer": name, **body.model_dump(exclude={"confirm"}), "confirm": 1})
    return {"employee": str((raw or {}).get("employee", "")), "employee_name": str((raw or {}).get("employee_name", ""))}


_ONB = "eswasa_hr.onboarding"


@router.get("/hr/onboarding", tags=["hr"])
async def list_onboardings(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, list[HrOnboarding]]:
    """Joiners and their onboarding progress (HR only)."""
    raw = await _hr_call(auth, frappe, f"{_ONB}.onboardings")
    return {"items": [HrOnboarding.model_validate({**r, "activities": []}) for r in (raw or [])]}


@router.get("/hr/onboarding/defaults", response_model=HrOnboardingDefaults, tags=["hr"])
async def onboarding_defaults(
    employee: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOnboardingDefaults:
    """The default checklist for a new employee, with owners filled in where known."""
    return HrOnboardingDefaults.model_validate(await _hr_call(auth, frappe, f"{_ONB}.defaults", params={"employee": employee}))


@router.post("/hr/onboarding", response_model=HrOnboarding, status_code=status.HTTP_201_CREATED, tags=["hr"])
async def start_onboarding(
    body: HrStartOnboardingBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOnboarding:
    """Start onboarding from the accepted offer, or for an employee hired outside Recruitment (the branch is in
    eswasa_hr.onboarding); each activity becomes a task for its named owner."""
    _require_confirm(body.confirm)
    audit_log(action="hr.onboarding.start", actor=auth.user.username, resource=f"Employee:{body.employee}", detail={"activities": len(body.activities)}, confirmed=True)
    raw = await _hr_call(
        auth,
        frappe,
        f"{_ONB}.start",
        json={
            "employee": body.employee,
            "activities": [{"activity_name": a.activity_name, "user": a.user} for a in body.activities],
            "boarding_begins_on": body.boarding_begins_on or body.start_date,
            "confirm": 1,
        },
    )
    return HrOnboarding.model_validate(raw)


@router.get("/hr/onboarding/{name}", response_model=HrOnboarding, tags=["hr"])
async def get_onboarding(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOnboarding:
    return HrOnboarding.model_validate(await _hr_call(auth, frappe, f"{_ONB}.detail", params={"name": name}))


@router.post("/hr/onboarding/tasks/{task}/done", tags=["hr"])
async def complete_onboarding_task(
    task: str,
    body: HrConfirmBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    """The task's owner (or HR) marks it done."""
    _require_confirm(body.confirm)
    audit_log(action="hr.onboarding.task_done", actor=auth.user.username, resource=f"Task:{task}", detail={}, confirmed=True)
    return dict(await _hr_call(auth, frappe, f"{_ONB}.complete_task", json={"task": task, "confirm": 1}) or {})


@router.get("/hr/me/onboarding", tags=["hr"])
async def get_my_onboarding(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, HrOnboarding | None]:
    """The new joiner's own checklist while onboarding is open; null otherwise."""
    raw = await _hr_call(auth, frappe, f"{_ONB}.my_onboarding")
    return {"onboarding": HrOnboarding.model_validate(raw) if raw else None}


_TEAM = "eswasa_hr.team"


@router.get("/hr/team", response_model=HrTeam, tags=["hr"])
async def get_my_team(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrTeam:
    """My direct and indirect reports with what is due. Job fields only, never personal or pay."""
    return HrTeam.model_validate(await _hr_call(auth, frappe, f"{_TEAM}.my_team"))


@router.get("/hr/team/calendar", response_model=HrTeamCalendar, tags=["hr"])
async def get_team_calendar(
    from_date: str,
    to_date: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrTeamCalendar:
    """Leave (approved and requested) and field visits for my team, up to two months."""
    return HrTeamCalendar.model_validate(
        await _hr_call(auth, frappe, f"{_TEAM}.calendar", params={"from_date": from_date, "to_date": to_date})
    )


@router.get("/hr/team/{employee}", response_model=HrTeamMemberDetail, tags=["hr"])
async def get_team_member(
    employee: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrTeamMemberDetail:
    return HrTeamMemberDetail.model_validate(await _hr_call(auth, frappe, f"{_TEAM}.member", params={"employee": employee}))


@router.post("/hr/team/{employee}/probation", response_model=HrTeamMemberDetail, tags=["hr"])
async def review_probation(
    employee: str,
    body: HrProbationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrTeamMemberDetail:
    """The direct line manager confirms, extends, or recommends ending probation (ending goes to HR)."""
    _require_confirm(body.confirm)
    audit_log(action="hr.probation.review", actor=auth.user.username, resource=f"Employee:{employee}", detail={"outcome": body.outcome}, confirmed=True)
    raw = await _hr_call(
        auth,
        frappe,
        f"{_TEAM}.probation_review",
        json={"employee": employee, "outcome": body.outcome, "summary": body.summary, "extend_to": body.extend_to, "confirm": 1},
    )
    return HrTeamMemberDetail.model_validate(raw)


_LIFE = "eswasa_hr.lifecycle"


@router.get("/hr/employees/{employee_id}/changes", response_model=HrChanges, tags=["hr"])
async def get_employee_changes(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrChanges:
    """Pending and past promotions, transfers and separation (HR only)."""
    return HrChanges.model_validate(await _hr_call(auth, frappe, f"{_LIFE}.changes", params={"employee": employee_id}))


@router.post("/hr/employees/{employee_id}/promotion", response_model=HrChanges, tags=["hr"])
async def prepare_promotion(
    employee_id: str,
    body: HrPromotionBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrChanges:
    """Prepare a promotion; another HR Manager approves it in Approvals. It takes effect on its date."""
    _require_confirm(body.confirm)
    audit_log(action="hr.promotion.prepare", actor=auth.user.username, resource=f"Employee:{employee_id}", detail={"effective": body.effective}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_LIFE}.promote", json={"employee": employee_id, **body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrChanges.model_validate(raw)


@router.post("/hr/employees/{employee_id}/transfer", response_model=HrChanges, tags=["hr"])
async def prepare_transfer(
    employee_id: str,
    body: HrTransferBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrChanges:
    _require_confirm(body.confirm)
    audit_log(action="hr.transfer.prepare", actor=auth.user.username, resource=f"Employee:{employee_id}", detail={"effective": body.effective}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_LIFE}.transfer", json={"employee": employee_id, **body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrChanges.model_validate(raw)


@router.get("/hr/employees/{employee_id}/separation-defaults", response_model=HrSeparationDefaults, tags=["hr"])
async def get_separation_defaults(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrSeparationDefaults:
    return HrSeparationDefaults.model_validate(await _hr_call(auth, frappe, f"{_LIFE}.separation_defaults", params={"employee": employee_id}))


@router.post("/hr/employees/{employee_id}/separation", response_model=HrChanges, tags=["hr"])
async def prepare_separation(
    employee_id: str,
    body: HrSeparationBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrChanges:
    """Record a leaver with an offboarding checklist; another HR Manager approves it."""
    _require_confirm(body.confirm)
    audit_log(action="hr.separation.prepare", actor=auth.user.username, resource=f"Employee:{employee_id}", detail={"reason": body.reason, "last_day": body.last_day}, confirmed=True)
    raw = await _hr_call(
        auth,
        frappe,
        f"{_LIFE}.separate",
        json={
            "employee": employee_id,
            "reason": body.reason,
            "last_day": body.last_day,
            "notice_date": body.notice_date,
            "activities": [{"activity_name": a.activity_name, "user": a.user} for a in body.activities],
            "note": body.note,
            "confirm": 1,
        },
    )
    return HrChanges.model_validate(raw)


_CASES = "eswasa_hr.cases"
_CASE_KINDS = ("grievance", "disciplinary")


def _case_kind(kind: str) -> str:
    if kind not in _CASE_KINDS:
        raise HTTPException(status_code=404, detail="Unknown kind of case")
    return kind


@router.get("/hr/cases", response_model=HrCaseRegister, tags=["hr"])
async def list_hr_cases(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCaseRegister:
    """H10 register: cases the caller may read (HR Manager or case owner), without the names of anyone involved."""
    return HrCaseRegister.model_validate(await _hr_call(auth, frappe, f"{_CASES}.register"))


@router.get("/hr/cases/board", response_model=HrCaseBoard, tags=["hr"])
async def get_hr_case_board(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCaseBoard:
    """Counts by kind and time to close, for the Board HR pack. Nothing else."""
    return HrCaseBoard.model_validate(await _hr_call(auth, frappe, f"{_CASES}.board"))


@router.post("/hr/cases", response_model=HrCaseDetail, tags=["hr"])
async def open_hr_case(
    body: HrCaseOpenBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCaseDetail:
    """Open a grievance or disciplinary case (HR Manager). Restricted from the moment it is saved."""
    _require_confirm(body.confirm)
    _case_kind(body.kind)
    audit_log(action="hr.case.open", actor=auth.user.username, resource=f"case:{body.kind}", detail={}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_CASES}.open_case", json={**body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrCaseDetail.model_validate(raw)


@router.get("/hr/cases/{kind}/{name}", response_model=HrCaseDetail, tags=["hr"])
async def get_hr_case(
    kind: str,
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCaseDetail:
    return HrCaseDetail.model_validate(await _hr_call(auth, frappe, f"{_CASES}.detail", params={"kind": _case_kind(kind), "name": name}))


@router.post("/hr/cases/{kind}/{name}/act", response_model=HrCaseDetail, tags=["hr"])
async def act_on_hr_case(
    kind: str,
    name: str,
    body: HrCaseActBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCaseDetail:
    """Move a case one step (owner, appeal owner or HR Manager). An appeal never goes to whoever issued the outcome."""
    _require_confirm(body.confirm)
    audit_log(action="hr.case.act", actor=auth.user.username, resource=f"{_case_kind(kind)}:{name}", detail={"to_stage": body.to_stage}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_CASES}.act", json={"kind": kind, "name": name, **body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrCaseDetail.model_validate(raw)


@router.post("/hr/cases/{kind}/{name}/notes", response_model=HrCaseDetail, tags=["hr"])
async def add_hr_case_note(
    kind: str,
    name: str,
    body: HrCaseNoteBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCaseDetail:
    _require_confirm(body.confirm)
    audit_log(action="hr.case.note", actor=auth.user.username, resource=f"{_case_kind(kind)}:{name}", detail={}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_CASES}.add_note", json={"kind": kind, "name": name, "text": body.text, "confirm": 1})
    return HrCaseDetail.model_validate(raw)


@router.post("/hr/cases/{kind}/{name}/owner", response_model=HrCaseDetail, tags=["hr"])
async def reassign_hr_case(
    kind: str,
    name: str,
    body: HrCaseOwnerBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrCaseDetail:
    """HR Manager hands the case to another named owner (never someone involved)."""
    _require_confirm(body.confirm)
    audit_log(action="hr.case.owner", actor=auth.user.username, resource=f"{_case_kind(kind)}:{name}", detail={"owner": body.owner}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_CASES}.reassign", json={"kind": kind, "name": name, "owner": body.owner, "note": body.note, "confirm": 1})
    return HrCaseDetail.model_validate(raw)


@router.get("/hr/me/concerns", response_model=HrMyConcerns, tags=["hr"])
async def list_my_concerns(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrMyConcerns:
    """Concerns I raised (status only), the categories, and the HR Managers who could handle one."""
    return HrMyConcerns.model_validate(await _hr_call(auth, frappe, f"{_CASES}.my_concerns"))


@router.post("/hr/me/concerns", response_model=HrConcernReceipt, tags=["hr"])
async def raise_my_concern(
    body: HrConcernBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrConcernReceipt:
    """E9: raise a concern in confidence. Only one HR Manager the employee didn't exclude sees it."""
    _require_confirm(body.confirm)
    audit_log(action="hr.case.raise", actor=auth.user.username, resource="case:grievance", detail={}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_CASES}.raise_concern", json={**body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrConcernReceipt.model_validate(raw)


_PERF = "eswasa_hr.performance"


@router.get("/hr/performance", response_model=HrPerfCycles, tags=["hr"])
async def list_performance_cycles(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrPerfCycles:
    """Appraisal cycles with objectives set, self-assessments and manager reviews done (H8; HR only)."""
    return HrPerfCycles.model_validate(await _hr_call(auth, frappe, f"{_PERF}.cycles"))


@router.get("/hr/performance/defaults", response_model=HrPerfDefaults, tags=["hr"])
async def get_performance_defaults(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrPerfDefaults:
    return HrPerfDefaults.model_validate(await _hr_call(auth, frappe, f"{_PERF}.defaults"))


@router.post("/hr/performance/cycles", response_model=HrPerfCycleDetail, tags=["hr"])
async def start_performance_cycle(
    body: HrPerfCycleBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrPerfCycleDetail:
    """Start a cycle: one appraisal per active person in the chosen departments, and their self-assessment tasks."""
    _require_confirm(body.confirm)
    audit_log(action="hr.performance.start", actor=auth.user.username, resource=f"Appraisal Cycle:{body.cycle_name}", detail={"template": body.template, "departments": body.departments}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_PERF}.start_cycle", json={**body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrPerfCycleDetail.model_validate(raw)


@router.get("/hr/performance/cycles/{name}", response_model=HrPerfCycleDetail, tags=["hr"])
async def get_performance_cycle(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    department: str | None = None,
) -> HrPerfCycleDetail:
    params = {"name": name, **({"department": department} if department else {})}
    return HrPerfCycleDetail.model_validate(await _hr_call(auth, frappe, f"{_PERF}.cycle", params=params))


@router.post("/hr/performance/cycles/{name}/remind", response_model=HrPerfRemindResult, tags=["hr"])
async def remind_performance_cycle(
    name: str,
    body: HrPerfRemindBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrPerfRemindResult:
    """Remind everyone with an open step (self-assessment or manager review). Already-open tasks aren't repeated."""
    _require_confirm(body.confirm)
    audit_log(action="hr.performance.remind", actor=auth.user.username, resource=f"Appraisal Cycle:{name}", detail={"department": body.department}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_PERF}.remind", json={"cycle": name, "department": body.department, "confirm": 1})
    return HrPerfRemindResult.model_validate(raw)


@router.get("/hr/performance/appraisals/{name}", response_model=HrAppraisalDetail, tags=["hr"])
async def get_appraisal(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAppraisalDetail:
    """One appraisal: HR, the person, or someone above them (checked in eswasa_hr)."""
    return HrAppraisalDetail.model_validate(await _hr_call(auth, frappe, f"{_PERF}.appraisal", params={"name": name}))


@router.get("/hr/me/appraisal", response_model=HrAppraisalHolder, tags=["hr"])
async def get_my_appraisal(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAppraisalHolder:
    return HrAppraisalHolder(appraisal=await _hr_call(auth, frappe, f"{_PERF}.my_appraisal"))


@router.post("/hr/me/appraisal", response_model=HrAppraisalDetail, tags=["hr"])
async def save_my_self_assessment(
    body: HrSelfAssessmentBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAppraisalDetail:
    """Rate every criterion and add reflections; this hands the review to the line manager."""
    _require_confirm(body.confirm)
    audit_log(action="hr.appraisal.self", actor=auth.user.username, resource="Appraisal:me", detail={"ratings": len(body.ratings)}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_PERF}.save_self", json={"ratings": [r.model_dump() for r in body.ratings], "reflections": body.reflections, "confirm": 1})
    return HrAppraisalDetail.model_validate(raw)


@router.get("/hr/team/{employee}/review", response_model=HrAppraisalHolder, tags=["hr"])
async def get_team_review(
    employee: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAppraisalHolder:
    return HrAppraisalHolder(appraisal=await _hr_call(auth, frappe, f"{_PERF}.team_review", params={"employee": employee}))


@router.post("/hr/team/{employee}/review", response_model=HrAppraisalDetail, tags=["hr"])
async def submit_team_review(
    employee: str,
    body: HrReviewBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAppraisalDetail:
    """The direct line manager rates the criteria and comments (Employee Performance Feedback)."""
    _require_confirm(body.confirm)
    audit_log(action="hr.appraisal.review", actor=auth.user.username, resource=f"Employee:{employee}", detail={"ratings": len(body.ratings)}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_PERF}.submit_review", json={"employee": employee, "ratings": [r.model_dump() for r in body.ratings], "feedback": body.feedback, "confirm": 1})
    return HrAppraisalDetail.model_validate(raw)


@router.post("/hr/team/{employee}/goals", response_model=HrAppraisalDetail, tags=["hr"])
async def add_team_goal(
    employee: str,
    body: HrGoalBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAppraisalDetail:
    """An objective in the current cycle, linked to a strategic plan goal (line manager or HR)."""
    _require_confirm(body.confirm)
    audit_log(action="hr.appraisal.goal", actor=auth.user.username, resource=f"Employee:{employee}", detail={"goal": body.goal_name}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_PERF}.add_goal", json={"employee": employee, **body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrAppraisalDetail.model_validate(raw)


_CONTRACT = "eswasa_hr.contracts"


@router.get("/hr/employees/{employee_id}/contract", response_model=HrContractDefaults, tags=["hr"])
async def get_contract_defaults(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrContractDefaults:
    """Current contract end and employment type, for renewing or making permanent (HR only)."""
    return HrContractDefaults.model_validate(await _hr_call(auth, frappe, f"{_CONTRACT}.defaults", params={"employee": employee_id}))


@router.post("/hr/employees/{employee_id}/contract", response_model=HrChanges, tags=["hr"])
async def prepare_contract_change(
    employee_id: str,
    body: HrContractBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrChanges:
    """Renew a fixed-term contract or make it permanent; another HR Manager approves it in Approvals."""
    _require_confirm(body.confirm)
    audit_log(action="hr.contract.prepare", actor=auth.user.username, resource=f"Employee:{employee_id}", detail={"kind": body.kind, "new_end": body.new_end}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_CONTRACT}.prepare", json={"employee": employee_id, **body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrChanges.model_validate(raw)


_ACCESS = "eswasa_hr.access_requests"


@router.get("/hr/access-requests", response_model=list[HrModuleAccessRequest], response_model_exclude_none=True, tags=["hr"])
async def list_access_requests(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    module: str | None = None,
) -> list[HrModuleAccessRequest]:
    """Module access requests: reviewers (HR, System Manager) get all, everyone else their own."""
    raw = await _hr_call(auth, frappe, f"{_ACCESS}.list_requests", params={k: v for k, v in {"status": status_filter, "module": module}.items() if v} or None)
    return [HrModuleAccessRequest.model_validate(r) for r in raw or []]


@router.post("/hr/access-requests", response_model=HrModuleAccessRequest, response_model_exclude_none=True, tags=["hr"])
async def submit_access_request(
    body: HrAccessRequestBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrModuleAccessRequest:
    """Ask for access to a module; a pending request for the same module is returned, not duplicated."""
    _require_confirm(body.confirm)
    audit_log(action="hr.access_request.submit", actor=auth.user.username, resource=f"Module:{body.moduleId}", detail={"module": body.moduleId}, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_ACCESS}.submit", json={"module_id": body.moduleId, "module_label": body.moduleLabel, "note": body.note, "confirm": 1})
    return HrModuleAccessRequest.model_validate(raw)


@router.patch("/hr/access-requests/{request_id}", response_model=HrModuleAccessRequest, response_model_exclude_none=True, tags=["hr"])
async def review_access_request(
    request_id: str,
    body: HrAccessReviewBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrModuleAccessRequest:
    """Approve (grants the module's role) or reject; the same review as the Approvals card."""
    _require_confirm(body.confirm)
    audit_log(action="hr.access_request.review", actor=auth.user.username, resource=f"Module Access Request:{request_id}", detail={"decision": body.decision}, confirmed=True)
    raw = await _hr_write(auth, frappe, f"{_ACCESS}.review", json={"name": request_id, "decision": body.decision, "note": body.reviewNote, "confirm": 1})
    return HrModuleAccessRequest.model_validate(raw)


_EST = "eswasa_hr.establishment"


@router.get("/hr/establishment", response_model=HrEstablishment, tags=["hr"])
async def get_establishment(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEstablishment:
    """Approved, frozen, filled, in recruitment and vacant posts per department (H3). HR, ED or the head."""
    return HrEstablishment.model_validate(await _hr_call(auth, frappe, f"{_EST}.establishment"))


@router.get("/hr/establishment/departments/{department_id}", response_model=HrEstDepartment, tags=["hr"])
async def get_establishment_department(
    department_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEstDepartment:
    """One department: head, posts, people, cover warnings and establishment changes (H3a)."""
    return HrEstDepartment.model_validate(await _hr_call(auth, frappe, f"{_EST}.department", params={"department": department_id}))


@router.post("/hr/establishment/changes", response_model=HrEstChangeDetail, tags=["hr"])
async def request_establishment_change(
    body: HrEstChangeBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEstChangeDetail:
    """HR or the head asks; the Executive Director decides in Approvals, then Council for new posts or grades."""
    _require_confirm(body.confirm)
    audit_log(
        action="hr.establishment.request",
        actor=auth.user.username,
        resource=f"Department:{body.department}",
        detail={"designation": body.designation, "change": body.change, "count": body.count, "new_grade": body.new_grade},
        confirmed=True,
    )
    raw = await _hr_call(auth, frappe, f"{_EST}.request_change", json={**body.model_dump(exclude={"confirm"}), "confirm": 1})
    return HrEstChangeDetail.model_validate(raw)


@router.get("/hr/establishment/changes/{name}", response_model=HrEstChangeDetail, tags=["hr"])
async def get_establishment_change(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrEstChangeDetail:
    """Where an establishment change is and who decides it."""
    return HrEstChangeDetail.model_validate(await _hr_call(auth, frappe, f"{_EST}.change_detail", params={"name": name}))


_SENSITIVE = "eswasa_hr.sensitive"


@router.post("/hr/employees/{employee_id}/sensitive", response_model=HrSensitive, tags=["hr"])
async def view_sensitive_details(
    employee_id: str,
    body: HrSensitiveBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrSensitive:
    """Personal (level 1) or pay and bank (level 2) details, with a reason; eswasa_hr logs the view first.

    A POST, not a GET, so the reason never appears in URLs or request logs.
    """
    _require_confirm(body.confirm)
    audit_log(action="hr.sensitive.view", actor=auth.user.username, resource=f"Employee:{employee_id}", detail={"level": body.level}, confirmed=True)
    raw = await _hr_call(auth, frappe, f"{_SENSITIVE}.view", json={"employee": employee_id, "level": body.level, "reason": body.reason, "confirm": 1})
    return HrSensitive.model_validate(raw)


@router.get("/hr/employees/{employee_id}/access-log", response_model=HrAccessLog, tags=["hr"])
async def get_employee_access_log(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAccessLog:
    """Who opened this person's protected details, when and why (HR Managers, or the person)."""
    return HrAccessLog.model_validate(await _hr_call(auth, frappe, f"{_SENSITIVE}.access_log", params={"employee": employee_id}))


@router.get("/hr/me/access-log", response_model=HrAccessLog, tags=["hr"])
async def get_my_access_log(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrAccessLog:
    """Who has opened my protected details."""
    return HrAccessLog.model_validate(await _hr_call(auth, frappe, f"{_SENSITIVE}.my_access_log"))


_OVERVIEW = "eswasa_hr.overview"


@router.get("/hr/overview/live", response_model=HrLiveOverview, tags=["hr"])
async def get_hr_live_overview(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrLiveOverview:
    """H0: needs attention (ranked, each with a link), establishment, away today, movements, record quality."""
    return HrLiveOverview.model_validate(await _hr_call(auth, frappe, f"{_OVERVIEW}.overview"))


@router.get("/hr/setup/status", response_model=HrSetupStatus, tags=["hr"])
async def get_hr_setup_status(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrSetupStatus:
    """H14: each HR setup step from live counts; ESWASA inputs show as awaiting, payroll as excluded."""
    return HrSetupStatus.model_validate(await _hr_call(auth, frappe, f"{_OVERVIEW}.setup_status"))


_IMPORT = "eswasa_hr.employee_import"
_IMPORT_TYPES = {".csv", ".xlsx"}


async def _import_file(file: UploadFile) -> dict[str, str]:
    """An uploaded CSV/XLSX as eswasa_hr reads it: {file_name, content (base64)}. Limits follow the media upload."""
    import base64

    from app.media.router import MAX_UPLOAD_BYTES

    name = file.filename or ""
    if not any(name.lower().endswith(ext) for ext in _IMPORT_TYPES):
        raise HTTPException(status_code=415, detail="Send a .csv or .xlsx file. Download the template for the columns.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="The file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The file must be 50 MB or smaller.")
    return {"file_name": name, "content": base64.b64encode(data).decode()}


@router.get("/hr/import/template", tags=["hr"])
async def get_hr_import_template(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    pass_no: Annotated[int, Query(alias="pass", ge=1, le=3)] = 1,
) -> Response:
    """Plan 09: the pass's column template (XLSX), built from the same field list the import validates."""
    import base64

    out = await _hr_call(auth, frappe, f"{_IMPORT}.template", params={"pass_no": pass_no}) or {}
    name = out.get("file_name") or f"eswasa-employee-import-pass-{pass_no}.xlsx"
    return Response(
        content=base64.b64decode(out.get("content") or ""),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/hr/import/dry-run", response_model=HrImportResult, tags=["hr"])
async def dry_run_hr_import(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    file: Annotated[UploadFile, File()],
    pass_no: Annotated[int, Form(alias="pass", ge=1, le=3)] = 1,
    go_live: Annotated[str | None, Form()] = None,
) -> HrImportResult:
    """Plan 09: check an import file and count what a run would do. Writes nothing in HRMS."""
    payload = await _import_file(file)
    audit_log(action="hr.import.dry_run", actor=auth.user.username, resource="HR Import Run",
              detail={"pass": pass_no, "file": payload["file_name"]}, confirmed=False)
    out = await _hr_write(auth, frappe, f"{_IMPORT}.dry_run", json={"file": payload, "pass_no": pass_no, "go_live": go_live})
    return HrImportResult.model_validate(out)


@router.post("/hr/import/run", response_model=HrImportJob, status_code=status.HTTP_202_ACCEPTED, tags=["hr"])
async def run_hr_import(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    file: Annotated[UploadFile, File()],
    pass_no: Annotated[int, Form(alias="pass", ge=1, le=3)] = 1,
    confirm: Annotated[bool, Form()] = False,
    go_live: Annotated[str | None, Form()] = None,
) -> HrImportJob:
    """Plan 09: start the import in a background job (HR Manager). Any error and nothing is written; see /hr/import/runs."""
    _require_confirm(confirm)
    payload = await _import_file(file)
    audit_log(action="hr.import.run", actor=auth.user.username, resource="HR Import Run",
              detail={"pass": pass_no, "file": payload["file_name"]}, confirmed=True)
    out = await _hr_write(auth, frappe, f"{_IMPORT}.run", json={"file": payload, "pass_no": pass_no, "go_live": go_live, "confirm": True})
    return HrImportJob.model_validate(out)


@router.get("/hr/import/runs", response_model=HrImportRuns, tags=["hr"])
async def list_hr_import_runs(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    pass_no: Annotated[int | None, Query(alias="pass", ge=1, le=3)] = None,
) -> HrImportRuns:
    """Plan 09: import runs, newest first."""
    rows = await _hr_call(auth, frappe, f"{_IMPORT}.runs", params={"pass_no": pass_no} if pass_no else None) or []
    return HrImportRuns(items=[HrImportRun.model_validate(r) for r in rows])


@router.get("/hr/import/runs/{name}", response_model=HrImportRun, tags=["hr"])
async def get_hr_import_run(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrImportRun:
    """Plan 09: one run with its per-row errors and warnings."""
    return HrImportRun.model_validate(await _hr_call(auth, frappe, f"{_IMPORT}.run_detail", params={"name": name}))


@router.post("/hr/setup/master-data", response_model=HrMasterDataResult, tags=["hr"])
async def load_hr_master_data(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    file: Annotated[UploadFile, File()],
    dry_run: Annotated[bool, Form()] = True,
    confirm: Annotated[bool, Form()] = False,
) -> HrMasterDataResult:
    """Plan 09: load ESWASA's signed-off master-data JSON (System Manager). The example file is refused; nothing is deleted."""
    import json as _json

    from app.media.router import MAX_UPLOAD_BYTES

    if not set(auth.user.roles or []) & SYSTEM_MANAGER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a System Manager can load master data.")
    if not dry_run:
        _require_confirm(confirm)
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The file must be 50 MB or smaller.")
    try:
        data = _json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="The master-data file must be JSON. See eswasa_master_data.schema.json.") from exc
    audit_log(action="hr.master_data.load", actor=auth.user.username, resource="HR master data",
              detail={"file": file.filename, "dry_run": dry_run}, confirmed=not dry_run)
    out = await _hr_write(auth, frappe, "eswasa_hr.master_data_load.load_file",
                          json={"data": data, "dry_run": dry_run, "confirm": not dry_run})
    return HrMasterDataResult.model_validate(out)


@router.get("/hr/board-pack", response_model=HrBoardPack, tags=["hr"])
async def get_hr_board_pack(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrBoardPack:
    """H15: aggregates for the Council HR & Remuneration Committee. No names, pay or case details."""
    return HrBoardPack.model_validate(await _hr_call(auth, frappe, f"{_OVERVIEW}.board_pack"))


@router.get("/hr/offboarding/{name}", response_model=HrOnboarding, tags=["hr"])
async def get_offboarding(
    name: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> HrOnboarding:
    """A leaver's offboarding checklist (tasks are ticked with /hr/onboarding/tasks/{task}/done)."""
    return HrOnboarding.model_validate(await _hr_call(auth, frappe, f"{_LIFE}.offboarding", params={"name": name}))


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
    # eswasa_hr.leave.apply: always the caller's own Employee and leave approver (no raw insert; plan 01).
    raw = await _hr_write(auth, frappe, f"{_LEAVE}.apply", json={
        "leave_type": body.leave_type, "from_date": body.from_date, "to_date": body.to_date,
        "reason": body.reason, "confirm": True,
    })
    return _as_hr_leave(raw)


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
    """Approve or reject from the Time off page. Same path as Approvals, so eswasa_hr.leave.decide applies:
    the named leave approver or an HR Manager, never the applicant, and a reject needs a note."""
    _require_confirm(body.confirm)
    decision = body.decision.strip().lower()
    if decision not in ("approve", "reject"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="decision must be approve or reject",
        )
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
        await session.method(
            "eswasa_governance.api.act_on_approval",
            json={
                "doctype": "Leave Application",
                "name": leave_id,
                "action": decision,
                "comment": body.reason,
                "confirm": True,
            },
        )
        raw = await _frappe_get_doc(session, "Leave Application", leave_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Leave application not found")
        return _as_hr_leave(raw)
    except FrappeError as exc:
        text = str(exc)
        if "DoesNotExistError" in text:
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


# --- Certification findings (Audit Finding) ---------------------------------
# Desk Findings view: NCs raised by R-C2 / Field audits / desk, plus the
# corrective-action review. Shape matches institution-portal DeskFinding.

_FINDING_SEVERITY = {"Major NC": "major", "Minor NC": "minor", "Observation": "observation", "OFI": "observation"}
_SEVERITY_TO_TYPE = {"major": "Major NC", "minor": "Minor NC", "observation": "Observation"}
_REVIEW_PREFIX = "[finding-review]"


class RaiseFindingBody(BaseModel):
    clause: str
    severity: Literal["major", "minor", "observation"]
    statement: str
    due: str
    org: str | None = None
    confirm: bool = False


class ReviewFindingBody(BaseModel):
    accept: bool
    note: str = ""
    confirm: bool = False


def _finding_status(row: dict[str, Any], review: dict[str, Any] | None) -> str:
    s = str(row.get("status") or "Open")
    if s == "Closed":
        return "accepted"
    if s == "Under Review":
        return "submitted"
    if review and review.get("accept") is False:
        return "rejected"
    return "open"


def _as_desk_finding(row: dict[str, Any], review: dict[str, Any] | None = None) -> dict[str, Any]:
    status_ = _finding_status(row, review)
    ca = (row.get("corrective_action") or "").strip()
    return {
        "id": row.get("name"),
        "application_id": row.get("application") or "",
        "audit_id": row.get("audit"),
        "org": "",
        "clause": row.get("clause_ref") or row.get("finding_type") or "",
        "severity": _FINDING_SEVERITY.get(str(row.get("finding_type") or ""), "observation"),
        "statement": row.get("description") or "",
        "raised_at": str(row.get("creation") or ""),
        "due": str(row.get("due_date") or row.get("creation") or ""),
        "status": status_,
        "response": (
            {"root_cause": "", "correction": "", "corrective_action": ca, "evidence": []}
            if ca and status_ in ("submitted", "accepted")
            else None
        ),
        "review_note": (review or {}).get("note") or None,
    }


async def _finding_reviews(session: FrappeClient, names: list[str]) -> dict[str, dict[str, Any]]:
    """Latest desk review per finding, kept as Comments (no review fields on the doctype)."""
    if not names:
        return {}
    rows = await _frappe_get_list(
        session,
        "Comment",
        fields=["reference_name", "content", "creation"],
        filters=[
            ["reference_doctype", "=", "Audit Finding"],
            ["reference_name", "in", names],
            ["content", "like", f"{_REVIEW_PREFIX}%"],
        ],
        limit=len(names) * 5,
        order_by="creation asc",
        soft=True,
    )
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        text = str(r.get("content") or "")[len(_REVIEW_PREFIX) :].strip()
        verdict, _, note = text.partition(":")
        out[str(r.get("reference_name"))] = {"accept": verdict.strip() == "accepted", "note": note.strip()}
    return out


_FINDING_FIELDS = [
    "name",
    "audit",
    "application",
    "finding_type",
    "status",
    "clause_ref",
    "due_date",
    "description",
    "corrective_action",
    "creation",
]


@router.get("/certification/findings", tags=["certification"])
async def list_certification_findings(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    application_id: str | None = None,
    limit: int = 200,
) -> dict[str, list[dict[str, Any]]]:
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    filters = [["application", "=", application_id]] if application_id else None
    rows = await _frappe_get_list(
        session,
        "Audit Finding",
        fields=_FINDING_FIELDS,
        filters=filters,
        limit=limit,
        order_by="due_date asc",
        soft=True,
    )
    reviews = await _finding_reviews(session, [str(r.get("name")) for r in rows])
    return {"items": [_as_desk_finding(r, reviews.get(str(r.get("name")))) for r in rows]}


@router.post("/certification/applications/{id}/findings", tags=["certification"])
async def raise_certification_finding(
    id: str,
    body: RaiseFindingBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm=true required before commit")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    audits = await _frappe_get_list(
        session,
        "Audit",
        fields=["name"],
        filters=[["application", "=", id]],
        limit=1,
        order_by="creation desc",
    )
    if not audits:
        raise HTTPException(
            status_code=409,
            detail=f"{id} has no audit yet. Schedule an audit before raising a finding.",
        )
    doc = await _frappe_insert(
        session,
        {
            "doctype": "Audit Finding",
            "audit": audits[0]["name"],
            "application": id,
            "finding_type": _SEVERITY_TO_TYPE[body.severity],
            "status": "Open",
            "clause_ref": body.clause,
            "description": body.statement,
            "due_date": body.due[:10],
        },
    )
    audit_log(
        action="certification.findings.raise",
        actor=auth.user.username,
        resource=str(doc.get("name") or id),
        detail={"application": id, "severity": body.severity, "clause": body.clause},
        confirmed=True,
    )
    return _as_desk_finding(doc)


@router.post("/certification/findings/{id}/review", tags=["certification"])
async def review_certification_finding(
    id: str,
    body: ReviewFindingBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> dict[str, Any]:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm=true required before commit")
    if not body.accept and not body.note.strip():
        raise HTTPException(status_code=400, detail="A review note is required when returning a finding")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    # set_value runs doc.save → on_update R-C2 close clears the certificate block.
    fields: dict[str, Any] = (
        {"status": "Closed", "closed_on": date.today().isoformat()}
        if body.accept
        else {"status": "Open"}
    )
    raw = await _frappe_set_value(session, "Audit Finding", id, fields)
    verdict = "accepted" if body.accept else "returned"
    try:
        await session.method(
            "frappe.client.insert",
            json={
                "doc": {
                    "doctype": "Comment",
                    "comment_type": "Comment",
                    "reference_doctype": "Audit Finding",
                    "reference_name": id,
                    "content": f"{_REVIEW_PREFIX} {verdict}: {body.note.strip()}",
                }
            },
        )
    except FrappeError:
        logger.warning("finding review comment not saved for %s", id)
    audit_log(
        action=f"certification.findings.review.{verdict}",
        actor=auth.user.username,
        resource=id,
        detail={"note": body.note},
        confirmed=True,
    )
    row = raw if isinstance(raw, dict) else {"name": id, "status": fields["status"]}
    return _as_desk_finding(row, {"accept": body.accept, "note": body.note.strip()})


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
