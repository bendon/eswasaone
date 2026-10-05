"""Citizen account workspace routes — /api/account/*."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.adapters.messaging import EmailRequest, get_messaging
from app.audit import audit_log
from app.frappe_client import FrappeClient, FrappeError, get_frappe_client
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.schemas import SessionUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/account", tags=["identity"])

TeamRole = Literal["owner", "admin", "member", "viewer"]
InviteRole = Literal["admin", "member", "viewer"]

_ROLE_LABELS: dict[str, str] = {
    "owner": "Owner",
    "admin": "Admin",
    "member": "Member",
    "viewer": "Viewer",
}
_AVATAR_CYCLE = ("default", "alt", "teal")


# --- Local response shapes (mirror OpenAPI Account* schemas) -----------------


class AccountEntity(BaseModel):
    id: str
    name: str
    short_name: str | None = None
    kind: str  # personal | business
    role: str
    initials: str | None = None
    member_since: str | None = None
    verified: bool = False


class AccountEntitiesResponse(BaseModel):
    items: list[AccountEntity]
    active: str


class AccountStatItem(BaseModel):
    label: str
    value: int
    accent: bool | None = None


class AccountStats(BaseModel):
    items: list[AccountStatItem]


class AccountAlert(BaseModel):
    id: str
    tone: str = "info"
    tint: str | None = None
    border_tint: str | None = None
    icon: str | None = None
    title: str
    body: str
    cta: str | None = None
    href: str | None = None


class AccountActivityItem(BaseModel):
    id: str
    tint: str | None = None
    tone: str | None = None
    icon: str | None = None
    title: str
    subtitle: str | None = None
    time: str | None = None
    href: str | None = None


class AccountSummaryCard(BaseModel):
    id: str
    tint: str
    tone: str
    icon: str
    title: str
    subtitle: str


class AccountOverview(BaseModel):
    stats: AccountStats
    alerts: list[AccountAlert]
    feed: list[AccountActivityItem]
    summary: list[AccountSummaryCard]


class TeamMember(BaseModel):
    id: str
    initials: str | None = None
    name: str
    email: str
    role: str
    role_label: str
    when: str | None = None
    avatar_variant: str | None = "default"


class InviteTeamBody(BaseModel):
    email: str
    role: InviteRole
    confirm: bool


class UpdateMeBody(BaseModel):
    confirm: bool
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None


class NotificationPrefs(BaseModel):
    application_updates: bool = True
    order_confirmations: bool = True
    certificate_expiry: bool = True
    training_announcements: bool = False
    two_factor: bool = False


# --- Helpers -----------------------------------------------------------------


def _initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _role_label(roles: list[str] | None) -> str:
    roles = roles or []
    priority = (
        "System Manager",
        "Administrator",
        "ESWASA Staff",
        "Desk User",
        "Citizen",
    )
    for p in priority:
        if p in roles:
            return p
    # Skip Frappe base roles that every user inherits
    for r in roles:
        if r and r not in ("Guest", "All"):
            return r
    return "Citizen"


def _fmt_when(raw: Any) -> str | None:
    if not raw:
        return None
    s = str(raw)
    try:
        # Frappe often returns "YYYY-MM-DD HH:MM:SS.micro"
        dt = datetime.fromisoformat(s.replace(" ", "T").split(".")[0])
        return dt.strftime("%b %Y")
    except Exception:  # noqa: BLE001
        return s[:16]


def _designation_to_role(designation: str | None) -> tuple[TeamRole, str]:
    raw = (designation or "").strip()
    key = raw.lower()
    if key in _ROLE_LABELS:
        return key, _ROLE_LABELS[key]  # type: ignore[return-value]
    if "owner" in key:
        return "owner", raw or "Owner"
    if "admin" in key:
        return "admin", raw or "Admin"
    if "view" in key or "audit" in key:
        return "viewer", raw or "Viewer"
    return "member", raw or "Member"


def _contact_display_name(row: dict[str, Any]) -> str:
    name = " ".join(
        p for p in [str(row.get("first_name") or ""), str(row.get("last_name") or "")] if p
    ).strip()
    return name or str(row.get("email_id") or row.get("name") or "Member")


async def _safe_count(
    session: FrappeClient,
    doctype: str,
    filters: list[Any] | None = None,
) -> int:
    try:
        payload: dict[str, Any] = {
            "doctype": doctype,
            "fields": ["name"],
            "limit_page_length": 500,
        }
        if filters:
            payload["filters"] = filters
        raw = await session.method("frappe.client.get_list", json=payload)
        if isinstance(raw, list):
            return len(raw)
    except FrappeError as exc:
        logger.debug("count %s failed: %s", doctype, exc)
    return 0


async def _safe_list(
    session: FrappeClient,
    doctype: str,
    *,
    fields: list[str],
    filters: list[Any] | None = None,
    limit: int = 10,
    order_by: str | None = None,
) -> list[dict[str, Any]]:
    try:
        payload: dict[str, Any] = {
            "doctype": doctype,
            "fields": fields,
            "limit_page_length": limit,
        }
        if filters:
            payload["filters"] = filters
        if order_by:
            payload["order_by"] = order_by
        raw = await session.method("frappe.client.get_list", json=payload)
        if isinstance(raw, list):
            return [r for r in raw if isinstance(r, dict)]
    except FrappeError as exc:
        logger.debug("list %s failed: %s", doctype, exc)
    return []


async def _admin_acting(frappe: FrappeClient) -> FrappeClient:
    """Admin SID for Contact / User writes that citizens may lack DocPerm for."""
    admin = FrappeClient(frappe.settings)
    try:
        login = await admin.login(
            frappe.settings.frappe_admin_user,
            frappe.settings.frappe_admin_password,
        )
    except FrappeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Admin session unavailable: {exc}",
        ) from exc
    sid = login.get("sid")
    if not sid:
        raise HTTPException(status_code=503, detail="Admin session missing sid")
    return admin.with_session(str(sid))


async def _resolve_owned_customer(
    session: FrappeClient,
    *,
    email: str,
) -> dict[str, Any] | None:
    """Customer owned by this email (email_id), else first Customer via Contact link."""
    if not email:
        return None
    customers = await _safe_list(
        session,
        "Customer",
        fields=["name", "customer_name", "email_id", "creation", "modified"],
        filters=[["email_id", "=", email]],
        limit=5,
        order_by="modified desc",
    )
    if customers:
        return customers[0]

    contacts = await _safe_list(
        session,
        "Contact",
        fields=["name", "email_id", "company_name"],
        filters=[["email_id", "=", email]],
        limit=10,
    )
    for c in contacts:
        links = await _safe_list(
            session,
            "Dynamic Link",
            fields=["link_name", "parent"],
            filters=[
                ["parent", "=", c.get("name")],
                ["parenttype", "=", "Contact"],
                ["link_doctype", "=", "Customer"],
            ],
            limit=5,
        )
        for link in links:
            cust_name = link.get("link_name")
            if not cust_name:
                continue
            rows = await _safe_list(
                session,
                "Customer",
                fields=["name", "customer_name", "email_id", "creation", "modified"],
                filters=[["name", "=", cust_name]],
                limit=1,
            )
            if rows:
                return rows[0]
        company = c.get("company_name")
        if company:
            rows = await _safe_list(
                session,
                "Customer",
                fields=["name", "customer_name", "email_id", "creation", "modified"],
                filters=[["customer_name", "=", company]],
                limit=1,
            )
            if rows:
                return rows[0]
    return None


async def _customer_contacts(
    session: FrappeClient,
    customer_name: str,
) -> list[dict[str, Any]]:
    return await _safe_list(
        session,
        "Contact",
        fields=[
            "name",
            "first_name",
            "last_name",
            "email_id",
            "designation",
            "modified",
            "creation",
        ],
        filters=[
            ["Dynamic Link", "link_doctype", "=", "Customer"],
            ["Dynamic Link", "link_name", "=", customer_name],
        ],
        limit=50,
        order_by="modified desc",
    )


async def _caller_team_role(
    session: FrappeClient,
    *,
    customer: dict[str, Any],
    email: str,
) -> TeamRole | None:
    """Owner (Customer.email_id) or Contact designation Admin/Owner may manage team."""
    owner_email = str(customer.get("email_id") or "").strip().lower()
    if email and owner_email and email.lower() == owner_email:
        return "owner"
    for c in await _customer_contacts(session, str(customer["name"])):
        cem = str(c.get("email_id") or "").strip().lower()
        if cem and cem == email.lower():
            role, _ = _designation_to_role(str(c.get("designation") or ""))
            return role
    return None


def _build_team_items(
    *,
    customer: dict[str, Any],
    contacts: list[dict[str, Any]],
    owner_fallback_name: str,
    owner_fallback_email: str,
) -> list[TeamMember]:
    items: list[TeamMember] = []
    seen_emails: set[str] = set()
    owner_email = str(customer.get("email_id") or owner_fallback_email or "").strip().lower()
    owner_name = str(customer.get("customer_name") or owner_fallback_name or "Owner")

    if owner_email:
        seen_emails.add(owner_email)
        items.append(
            TeamMember(
                id=f"owner-{customer.get('name')}",
                initials=_initials(owner_fallback_name or owner_name),
                name=owner_fallback_name or owner_name,
                email=owner_email,
                role="owner",
                role_label="Owner",
                when=_fmt_when(customer.get("creation")),
                avatar_variant="alt",
            )
        )

    for i, c in enumerate(contacts):
        em = str(c.get("email_id") or "").strip().lower()
        if em and em in seen_emails:
            continue
        if em:
            seen_emails.add(em)
        role, role_label = _designation_to_role(str(c.get("designation") or ""))
        if role == "owner" and em and owner_email and em == owner_email:
            continue
        name = _contact_display_name(c)
        items.append(
            TeamMember(
                id=str(c.get("name")),
                initials=_initials(name),
                name=name,
                email=em or str(c.get("email_id") or ""),
                role=role,
                role_label=role_label,
                when=_fmt_when(c.get("modified") or c.get("creation")),
                avatar_variant=_AVATAR_CYCLE[i % len(_AVATAR_CYCLE)],
            )
        )
    return items


async def _ensure_citizen_user(
    frappe: FrappeClient,
    *,
    email: str,
    full_name: str,
) -> bool:
    """Ensure a Citizen User exists. Returns True if newly created."""
    acting = await _admin_acting(frappe)
    try:
        existing = await acting.method(
            "frappe.client.get",
            json={"doctype": "User", "name": email},
        )
        if isinstance(existing, dict) and existing.get("name"):
            # Keep existing roles — never elevate Institution via business invite
            try:
                await acting.add_user_role(email, "Citizen")
            except FrappeError:
                pass
            return False
    except FrappeError:
        pass

    body: dict[str, Any] = {
        "doctype": "User",
        "email": email,
        "first_name": full_name.split()[0] if full_name else email.split("@")[0],
        "last_name": (" ".join(full_name.split()[1:]) if full_name and " " in full_name else ""),
        "send_welcome_email": 1,
        "roles": [{"role": "Citizen"}],
    }
    try:
        await acting.post("/api/resource/User", json=body)
    except FrappeError as exc:
        detail = str(exc).lower()
        if "already" in detail or "duplicate" in detail or exc.status_code == 409:
            return False
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail=str(exc) or "Could not create invitee account",
        ) from exc

    try:
        await acting.add_user_role(email, "Citizen")
    except FrappeError:
        pass
    return True


async def _find_contact_for_customer(
    session: FrappeClient,
    *,
    customer_name: str,
    email: str,
) -> dict[str, Any] | None:
    email_l = email.strip().lower()
    for c in await _customer_contacts(session, customer_name):
        if str(c.get("email_id") or "").strip().lower() == email_l:
            return c
    return None


async def _create_team_contact(
    frappe: FrappeClient,
    *,
    customer_name: str,
    email: str,
    full_name: str,
    role: InviteRole,
) -> dict[str, Any]:
    acting = await _admin_acting(frappe)
    parts = full_name.strip().split(None, 1)
    first = parts[0] if parts else email.split("@")[0]
    last = parts[1] if len(parts) > 1 else ""
    designation = _ROLE_LABELS[role]
    body: dict[str, Any] = {
        "doctype": "Contact",
        "first_name": first,
        "last_name": last,
        "email_id": email,
        "designation": designation,
        "status": "Open",
        "email_ids": [{"email_id": email, "is_primary": 1}],
        "links": [{"link_doctype": "Customer", "link_name": customer_name}],
    }
    try:
        created = await acting.post("/api/resource/Contact", json=body)
    except FrappeError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail=str(exc) or "Could not link colleague to business",
        ) from exc

    if isinstance(created, dict):
        data = created.get("data") if isinstance(created.get("data"), dict) else created
        if isinstance(data, dict) and data.get("name"):
            return data
    # Fallback fetch
    found = await _find_contact_for_customer(acting, customer_name=customer_name, email=email)
    if found:
        return found
    return {
        "name": f"contact-{email}",
        "first_name": first,
        "last_name": last,
        "email_id": email,
        "designation": designation,
    }


# --- Routes ------------------------------------------------------------------


@router.get("/entities", response_model=AccountEntitiesResponse)
async def list_account_entities(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> AccountEntitiesResponse:
    """Workspaces: personal (always) + business orgs linked to the user."""
    user = auth.user
    role = _role_label(user.roles)
    personal = AccountEntity(
        id="personal",
        name=user.full_name or user.username,
        short_name=(user.full_name or user.username).split()[0],
        kind="personal",
        role=role,
        initials=_initials(user.full_name or user.username),
        member_since=None,
        verified=bool(user.email),
    )

    items: list[AccountEntity] = [personal]

    # Try to find Customer records linked by email / user
    if not auth.mock and await frappe.health():
        session = auth.frappe(frappe)
        email = user.email or user.username
        # Prefer Customer where email_id matches
        customers = await _safe_list(
            session,
            "Customer",
            fields=["name", "customer_name", "customer_type", "creation"],
            filters=[["email_id", "=", email]] if email else None,
            limit=10,
            order_by="modified desc",
        )
        if not customers and email:
            # Fallback: Contact email → customer link
            contacts = await _safe_list(
                session,
                "Contact",
                fields=["name", "email_id", "company_name"],
                filters=[["email_id", "=", email]],
                limit=5,
            )
            for c in contacts:
                company = c.get("company_name")
                if company:
                    customers.append(
                        {
                            "name": str(company),
                            "customer_name": str(company),
                            "creation": None,
                        }
                    )

        # Contract allows only personal | business ids — surface primary Customer
        if customers:
            cust = customers[0]
            cname = str(cust.get("customer_name") or cust.get("name") or "Business")
            items.append(
                AccountEntity(
                    id="business",
                    name=cname,
                    short_name=cname.split()[0] if cname else "Biz",
                    kind="business",
                    role="Owner",
                    initials=_initials(cname),
                    member_since=_fmt_when(cust.get("creation")),
                    verified=True,
                )
            )

        # Enrich personal member_since from User creation
        try:
            udoc = await session.method(
                "frappe.client.get",
                json={
                    "doctype": "User",
                    "name": (
                        user.username if "@" not in user.username else (user.email or user.username)
                    ),
                },
            )
            if isinstance(udoc, dict):
                personal.member_since = _fmt_when(udoc.get("creation"))
                # Prefer name from User doc if richer
                if udoc.get("full_name"):
                    personal.name = str(udoc["full_name"])
                    personal.short_name = personal.name.split()[0]
                    personal.initials = _initials(personal.name)
        except FrappeError:
            pass

    return AccountEntitiesResponse(items=items, active="personal")


@router.get("/overview", response_model=AccountOverview)
async def get_account_overview(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    entity: Annotated[str | None, Query()] = "personal",
) -> AccountOverview:
    """Unified overview — live counts from Sales Invoice, Certificate, LMS, Certification."""
    entity = entity or "personal"
    is_biz = entity == "business"

    orders = 0
    certs = 0
    courses = 0
    open_apps = 0
    team_count = 0
    feed: list[AccountActivityItem] = []
    alerts: list[AccountAlert] = []

    if not auth.mock and await frappe.health():
        session = auth.frappe(frappe)

        orders = await _safe_count(session, "Sales Invoice", [["docstatus", "=", 1]])
        certs = await _safe_count(session, "Certificate")
        courses = await _safe_count(session, "LMS Enrollment")
        if courses == 0:
            courses = await _safe_count(session, "Course")

        open_issued = await _safe_count(
            session, "Certification Application", [["status", "=", "Issued"]]
        )
        open_rejected = await _safe_count(
            session, "Certification Application", [["status", "=", "Rejected"]]
        )
        open_withdrawn = await _safe_count(
            session, "Certification Application", [["status", "=", "Withdrawn"]]
        )
        total_apps = await _safe_count(session, "Certification Application")
        open_apps = max(0, total_apps - open_issued - open_rejected - open_withdrawn)

        if is_biz:
            email = (auth.user.email or auth.user.username or "").strip()
            cust = await _resolve_owned_customer(session, email=email)
            if cust:
                contacts = await _customer_contacts(session, str(cust["name"]))
                team_count = len(
                    _build_team_items(
                        customer=cust,
                        contacts=contacts,
                        owner_fallback_name=auth.user.full_name or auth.user.username,
                        owner_fallback_email=email,
                    )
                )

        recent_inv = await _safe_list(
            session,
            "Sales Invoice",
            fields=["name", "customer", "grand_total", "posting_date", "status"],
            filters=[["docstatus", "=", 1]],
            limit=5,
            order_by="posting_date desc",
        )
        for inv in recent_inv:
            feed.append(
                AccountActivityItem(
                    id=str(inv.get("name")),
                    tint="#ECEEFC",
                    tone="#313391",
                    icon="i-book",
                    title=f"Order {inv.get('name')}",
                    subtitle=f"{inv.get('customer') or '—'} · SZL {inv.get('grand_total') or 0}",
                    time=str(inv.get("posting_date") or ""),
                    href="/account/orders",
                )
            )

        recent_certs = await _safe_list(
            session,
            "Certificate",
            fields=[
                "name",
                "certificate_number",
                "holder_name",
                "scheme",
                "status",
                "issued_on",
            ],
            limit=3,
            order_by="modified desc",
        )
        for c in recent_certs:
            feed.append(
                AccountActivityItem(
                    id=str(c.get("name")),
                    tint="#E3F4E9",
                    tone="#15803D",
                    icon="i-badge",
                    title=f"Certificate {c.get('certificate_number') or c.get('name')}",
                    subtitle=f"{c.get('holder_name') or '—'} · {c.get('scheme') or ''}",
                    time=str(c.get("issued_on") or ""),
                    href="/account/certificates",
                )
            )

        open_app_rows = await _safe_list(
            session,
            "Certification Application",
            fields=["name", "applicant_name", "scheme", "status", "modified"],
            filters=[["status", "!=", "Issued"]],
            limit=5,
            order_by="modified desc",
        )
        open_app_rows = [
            a
            for a in open_app_rows
            if str(a.get("status") or "") not in ("Issued", "Rejected", "Withdrawn")
        ][:3]
        for app in open_app_rows:
            alerts.append(
                AccountAlert(
                    id=str(app.get("name")),
                    tone="pending",
                    tint="#FEF6DC",
                    border_tint="#F1E2A5",
                    icon="i-clock",
                    title=f"Application {app.get('name')}: {app.get('status')}",
                    body=f"{app.get('scheme') or 'Scheme'} · {app.get('applicant_name') or ''}",
                    cta="Track application",
                    href=f"/certification/{app.get('name')}",
                )
            )

        expiring = await _safe_list(
            session,
            "Certificate",
            fields=["name", "certificate_number", "holder_name", "valid_until", "scheme"],
            filters=[["status", "=", "Active"]],
            limit=5,
            order_by="valid_until asc",
        )
        today = datetime.utcnow().date()
        for c in expiring:
            vu = c.get("valid_until")
            if not vu:
                continue
            try:
                expiry = datetime.fromisoformat(str(vu)[:10]).date()
            except Exception:  # noqa: BLE001
                continue
            days = (expiry - today).days
            if 0 <= days <= 90:
                alerts.append(
                    AccountAlert(
                        id=f"exp-{c.get('name')}",
                        tone="alert",
                        tint="#FDECEC",
                        border_tint="#F9C4C4",
                        icon="i-warn",
                        title=f"Certificate expires in {days} days",
                        body=(
                            f"{c.get('scheme') or c.get('certificate_number')} · "
                            f"{c.get('holder_name') or ''}"
                        ),
                        cta="View certificates",
                        href="/account/certificates",
                    )
                )

    stats = AccountStats(
        items=[
            AccountStatItem(label="Orders placed", value=orders),
            AccountStatItem(label="Certificates held", value=certs),
            AccountStatItem(
                label="Team members" if is_biz else "Course in progress",
                value=team_count if is_biz else courses,
            ),
            AccountStatItem(label="Open applications", value=open_apps, accent=open_apps > 0),
        ]
    )

    summary = [
        AccountSummaryCard(
            id="s1",
            tint="#ECEEFC",
            tone="#313391",
            icon="i-book",
            title="Standards library",
            subtitle=f"{orders} order(s) on record",
        ),
        AccountSummaryCard(
            id="s2",
            tint="#E3F4E9",
            tone="#15803D",
            icon="i-badge",
            title="Certificate portfolio",
            subtitle=f"{certs} certificate(s)",
        ),
        AccountSummaryCard(
            id="s3",
            tint="#F0E9FB",
            tone="#7C3AED",
            icon="i-clipboard",
            title="Open applications",
            subtitle=f"{open_apps} in progress" if open_apps else "None open",
        ),
    ]

    return AccountOverview(stats=stats, alerts=alerts, feed=feed[:8], summary=summary)


@router.get("/team")
async def list_account_team(
    auth: Annotated[AuthContext, Depends(require_auth)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
    entity: Annotated[str | None, Query()] = "personal",
) -> dict[str, list[TeamMember]]:
    """Colleagues on the caller's Customer — org membership, not Institution elevation."""
    if not entity or entity == "personal":
        return {"items": []}
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")

    session = auth.frappe(frappe)
    email = (auth.user.email or auth.user.username or "").strip()
    customer = await _resolve_owned_customer(session, email=email)
    if not customer:
        return {"items": []}

    contacts = await _customer_contacts(session, str(customer["name"]))
    items = _build_team_items(
        customer=customer,
        contacts=contacts,
        owner_fallback_name=auth.user.full_name or auth.user.username,
        owner_fallback_email=email,
    )
    return {"items": items}


@router.post("/team/invite", status_code=status.HTTP_201_CREATED)
async def invite_team_member(
    body: InviteTeamBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> TeamMember:
    """Invite a colleague onto the owner's Customer as Contact + Citizen user.

    Does **not** assign Institution Desk roles — invitee stays on the Service Portal.
    """
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm must be true")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")

    invite_email = body.email.strip().lower()
    if "@" not in invite_email or "." not in invite_email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Valid email required")

    session = auth.frappe(frappe)
    caller_email = (auth.user.email or auth.user.username or "").strip().lower()
    customer = await _resolve_owned_customer(session, email=caller_email)
    if not customer:
        raise HTTPException(
            status_code=400,
            detail="Create a business profile first before inviting colleagues",
        )

    caller_role = await _caller_team_role(session, customer=customer, email=caller_email)
    if caller_role not in ("owner", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only the business owner or an admin may invite colleagues",
        )

    owner_email = str(customer.get("email_id") or "").strip().lower()
    if invite_email == caller_email or (owner_email and invite_email == owner_email):
        raise HTTPException(status_code=400, detail="That email is already the owner")

    existing = await _find_contact_for_customer(
        session, customer_name=str(customer["name"]), email=invite_email
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Colleague is already on this business team",
        )

    local = invite_email.split("@")[0].replace(".", " ").replace("_", " ").title()
    full_name = local or invite_email

    created_user = await _ensure_citizen_user(frappe, email=invite_email, full_name=full_name)
    contact = await _create_team_contact(
        frappe,
        customer_name=str(customer["name"]),
        email=invite_email,
        full_name=full_name,
        role=body.role,
    )

    biz_name = str(customer.get("customer_name") or customer.get("name") or "your business")
    role_label = _ROLE_LABELS[body.role]
    messaging = get_messaging()
    try:
        await messaging.send_email(
            EmailRequest(
                to=invite_email,
                subject=f"You're invited to {biz_name} on EswasaOne",
                body=(
                    f"Hi {full_name},\n\n"
                    f"{auth.user.full_name or auth.user.username} invited you to join "
                    f"{biz_name} as {role_label} on the EswasaOne Service Portal.\n\n"
                    "Sign in (or complete the welcome email if this is a new account) "
                    "and switch to the business workspace to collaborate on applications, "
                    "orders and certificates.\n\n"
                    "EswasaOne\n"
                ),
            )
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("team invite email failed: %s", exc)

    audit_log(
        action="account.team.invite",
        actor=caller_email or auth.user.username,
        resource=str(customer.get("name")),
        confirmed=True,
        detail={
            "email": invite_email,
            "role": body.role,
            "contact": contact.get("name"),
            "user_created": created_user,
        },
    )

    name = _contact_display_name(contact)
    return TeamMember(
        id=str(contact.get("name") or invite_email),
        initials=_initials(name),
        name=name,
        email=invite_email,
        role=body.role,
        role_label=role_label,
        when="Just invited",
        avatar_variant="default",
    )


@router.put("/me", response_model=SessionUser)
async def update_account_me(
    body: UpdateMeBody,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    frappe: Annotated[FrappeClient, Depends(get_frappe_client)],
) -> SessionUser:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm must be true")
    if auth.mock or not await frappe.health():
        raise HTTPException(status_code=503, detail="Frappe unavailable")
    session = auth.frappe(frappe)
    user_name = auth.user.email or auth.user.username
    updates: dict[str, Any] = {}
    if body.full_name:
        parts = body.full_name.strip().split(None, 1)
        updates["first_name"] = parts[0]
        if len(parts) > 1:
            updates["last_name"] = parts[1]
    if body.phone:
        updates["phone"] = body.phone
    if body.email:
        updates["email"] = body.email
    if not updates:
        return auth.user
    try:
        for field, value in updates.items():
            await session.method(
                "frappe.client.set_value",
                json={"doctype": "User", "name": user_name, "fieldname": field, "value": value},
            )
    except FrappeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SessionUser(
        username=auth.user.username,
        full_name=body.full_name or auth.user.full_name,
        email=body.email or auth.user.email,
        roles=auth.user.roles,
    )


# In-memory prefs until User Preference doctype exists
_PREFS: dict[str, NotificationPrefs] = {}


@router.get("/notifications", response_model=NotificationPrefs)
async def get_notification_prefs(
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> NotificationPrefs:
    key = auth.user.username
    return _PREFS.get(key, NotificationPrefs())


@router.put("/notifications", response_model=NotificationPrefs)
async def update_notification_prefs(
    body: NotificationPrefs,
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
) -> NotificationPrefs:
    _PREFS[auth.user.username] = body
    return body
