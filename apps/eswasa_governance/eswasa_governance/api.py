# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Whitelisted governance API — approvals / board pack / risks / resolutions.

Discoverable methods (A4 / Core):
  - eswasa_governance.api.list_approvals(limit=20)
  - eswasa_governance.api.act_on_approval(doctype, name, action, comment=None, confirm=False)
  - eswasa_governance.api.get_board_pack_summary()  — BoardPackSummary
  - eswasa_governance.api.list_board_packs(limit=10)
  - eswasa_governance.api.list_resolutions(status=None, limit=20)
  - eswasa_governance.api.list_risks(limit=20)
  - eswasa_governance.api.assemble_board_pack(meeting, confirm=False)  — POST pack/{meeting}
"""

from __future__ import annotations

import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, formatdate, getdate, nowdate

from eswasa_governance.approvals import act_on_approval_item, list_approval_items

SMOKE_METHODS = [
    "list_approvals",
    "act_on_approval",
    "get_board_pack_summary",
    "board_pack_summary",
    "list_resolutions",
    "list_risks",
    "list_board_packs",
    "assemble_board_pack",
    "institution_home",
    "service_home",
    "finance_kpis",
    "hr_summary",
    "crm_pipeline",
]

_SECTION_SPLIT = re.compile(r"[\n\r]+|<br\s*/?>|</p>|<li>", re.I)
_TAG_STRIP = re.compile(r"<[^>]+>")
A10_DEMOSEED = "A10_DEMOSEED"


def _strip_html(text: str | None) -> str:
    if not text:
        return ""
    return _TAG_STRIP.sub(" ", text).replace("&nbsp;", " ").strip()


def _is_demo_seed_pack(pack: Any) -> bool:
    """True when the Board Pack is an A10 DemoSeed stub (not operational)."""
    code = str(getattr(pack, "pack_code", None) or "")
    title = str(getattr(pack, "title", None) or "")
    agenda = str(getattr(pack, "agenda", None) or "")
    blob = f"{code}\n{title}\n{agenda}"
    if A10_DEMOSEED in blob:
        return True
    if code.upper().startswith("BP-DEMO") or title.lower().startswith("demo "):
        return True
    return False


def _agenda_sections(agenda: str | None, workflow_state: str | None) -> list[dict[str, str]]:
    """Parse agenda into BoardPackSummary.sections[{title, status}]."""
    if not agenda:
        return []

    # Prefer structured R-G1 assembly block when present
    marker = "<!-- BOARD-PACK-ASSEMBLY -->"
    if marker in agenda:
        assembled = agenda.split(marker, 1)[1]
        from_assembly: list[dict[str, str]] = []
        for m in re.finditer(
            r"\[(ready|outstanding)\]\s*([^<\]\n]+)",
            assembled,
            re.I,
        ):
            title = _strip_html(m.group(2)).strip(" -•*\t")
            if len(title) >= 3:
                from_assembly.append(
                    {"title": title[:120], "status": m.group(1).lower()}
                )
        if from_assembly:
            return from_assembly[:12]
        # Fall through to prior (pre-marker) agenda only
        agenda = agenda.split(marker, 1)[0]

    plain = _strip_html(agenda)
    if not plain:
        return []

    chunks = [c.strip(" -•*\t") for c in _SECTION_SPLIT.split(agenda or "")]
    titles: list[str] = []
    for chunk in chunks:
        title = _strip_html(chunk)
        if len(title) < 3:
            continue
        # Keep first line / first ~120 chars as section title
        title = title.split("\n")[0][:120]
        # Skip assembly chrome and A10 DemoSeed narrative lines
        if title.lower().startswith(("board pack assembly", "assembled ")):
            continue
        if A10_DEMOSEED in title or title.lower().startswith("a10_"):
            continue
        if title and title not in titles:
            titles.append(title)

    if not titles:
        # Fallback: whole agenda as one section
        titles = [plain[:120]]

    pack_status = (workflow_state or "Draft").strip() or "Draft"
    section_status = "ready" if pack_status == "Adopted" else "outstanding"
    return [{"title": t, "status": section_status} for t in titles[:12]]


def _resolution_sections(resolutions_csv: str | None) -> list[dict[str, str]]:
    if not resolutions_csv:
        return []
    codes = [c.strip() for c in resolutions_csv.replace(";", ",").split(",") if c.strip()]
    sections: list[dict[str, str]] = []
    for code in codes:
        if not frappe.db.exists("Board Resolution", code):
            sections.append({"title": code, "status": "outstanding"})
            continue
        row = frappe.db.get_value(
            "Board Resolution",
            code,
            ["title", "workflow_state"],
            as_dict=True,
        )
        state = (row.workflow_state or "Draft") if row else "Draft"
        status = "ready" if state == "Adopted" else "outstanding"
        title = (row.title if row and row.title else code)
        sections.append({"title": title, "status": status})
    return sections


@frappe.whitelist()
def list_approvals(limit: int = 20) -> dict[str, Any]:
    """Staff approval queue from open Workflow Actions + referenced ToDos.

    OpenAPI ``ApprovalItem`` shape; ``id`` is ``{doctype}::{name}`` (no APR-*).
    """
    return list_approval_items(limit=limit)


@frappe.whitelist()
def act_on_approval(
    doctype: str | None = None,
    name: str | None = None,
    action: str | None = None,
    comment: str | None = None,
    confirm: bool | int | str = False,
) -> dict[str, Any]:
    """Approve, reject, or return a workflow document (confirm-before-commit).

    Maps portal ``approve|reject|return`` onto a permitted Frappe Workflow
    Action for the logged-in user; illegal transitions raise.
    """
    return act_on_approval_item(
        doctype=doctype or "",
        name=name or "",
        action=action or "",
        comment=comment,
        confirm=confirm,
    )


@frappe.whitelist()
def get_board_pack_summary() -> dict[str, Any]:
    """Outstanding board pack sections (OpenAPI BoardPackSummary).

    Picks the soonest upcoming (or most recent Draft/Review) Board Pack and
    derives sections from linked resolutions and/or agenda lines.
    """
    if not frappe.has_permission("Board Pack", "read"):
        frappe.throw(_("Not permitted to read Board Pack"), frappe.PermissionError)

    today = getdate(nowdate())
    packs = frappe.get_all(
        "Board Pack",
        fields=[
            "name",
            "pack_code",
            "title",
            "meeting_date",
            "agenda",
            "resolutions",
            "workflow_state",
            "pack_file",
        ],
        order_by="meeting_date asc, modified desc",
        limit_page_length=20,
    )

    if not packs:
        return {
            "due_label": "No board pack scheduled",
            "outstanding_sections": 0,
            "sections": [],
        }

    # Drop A10 DemoSeed stubs — portals must not surface synthetic pack notes.
    packs = [p for p in packs if not _is_demo_seed_pack(p)]
    if not packs:
        return {
            "due_label": "No board pack scheduled",
            "outstanding_sections": 0,
            "sections": [],
        }

    # Prefer Draft/Review packs; else nearest meeting date.
    open_packs = [p for p in packs if (p.workflow_state or "Draft") in ("Draft", "Review", "")]
    candidates = open_packs or packs

    upcoming = [p for p in candidates if p.meeting_date and getdate(p.meeting_date) >= today]
    pack = (upcoming or candidates)[0]

    sections = _resolution_sections(pack.resolutions)
    if not sections:
        sections = _agenda_sections(pack.agenda, pack.workflow_state)

    # If still empty, synthesise from pack title + workflow
    if not sections:
        state = pack.workflow_state or "Draft"
        sections = [
            {
                "title": pack.title or pack.pack_code or pack.name,
                "status": "ready" if state == "Adopted" else "outstanding",
            }
        ]

    outstanding = sum(1 for s in sections if s.get("status") != "ready")
    if pack.meeting_date:
        due_label = f"Board pack due {formatdate(pack.meeting_date, 'dd MMM yyyy')}"
    else:
        due_label = pack.title or pack.pack_code or "Board pack"

    return {
        "due_label": due_label,
        "outstanding_sections": outstanding,
        "sections": sections,
    }


@frappe.whitelist()
def list_resolutions(status: str | None = None, limit: int = 20) -> dict[str, Any]:
    """List Board Resolutions (permissions-aware)."""
    if not frappe.has_permission("Board Resolution", "read"):
        frappe.throw(_("Not permitted to read Board Resolution"), frappe.PermissionError)

    filters: dict[str, Any] = {}
    if status:
        filters["workflow_state"] = status

    rows = frappe.get_all(
        "Board Resolution",
        filters=filters,
        fields=["name", "resolution_number", "title", "meeting_date", "workflow_state"],
        order_by="meeting_date desc, modified desc",
        limit_page_length=cint(limit) or 20,
    )
    items = [
        {
            "id": r.resolution_number or r.name,
            "title": r.title,
            "status": r.workflow_state or "Draft",
            "meeting_date": str(r.meeting_date) if r.meeting_date else None,
        }
        for r in rows
    ]
    return {"items": items}


@frappe.whitelist()
def list_risks(limit: int = 20) -> dict[str, Any]:
    """List Risk Register Entry rows."""
    if not frappe.has_permission("Risk Register Entry", "read"):
        frappe.throw(_("Not permitted to read Risk Register Entry"), frappe.PermissionError)

    rows = frappe.get_all(
        "Risk Register Entry",
        fields=["name", "risk_id", "title", "likelihood", "impact", "status"],
        order_by="modified desc",
        limit_page_length=cint(limit) or 20,
    )
    items = [
        {
            "id": r.risk_id or r.name,
            "title": r.title,
            "likelihood": r.likelihood,
            "impact": r.impact,
            "status": r.status,
        }
        for r in rows
    ]
    return {"items": items}


@frappe.whitelist()
def list_board_packs(limit: int = 10) -> dict[str, Any]:
    """List Board Pack documents."""
    if not frappe.has_permission("Board Pack", "read"):
        frappe.throw(_("Not permitted to read Board Pack"), frappe.PermissionError)

    rows = frappe.get_all(
        "Board Pack",
        fields=["name", "pack_code", "title", "meeting_date", "workflow_state", "pack_file"],
        order_by="meeting_date desc, modified desc",
        limit_page_length=cint(limit) or 10,
    )
    items = [
        {
            "id": r.pack_code or r.name,
            "title": r.title,
            "meeting_date": str(r.meeting_date) if r.meeting_date else None,
            "status": r.workflow_state or "Draft",
            "has_file": bool(r.pack_file),
        }
        for r in rows
    ]
    return {"items": items}


@frappe.whitelist()
def assemble_board_pack(
    meeting: str | None = None,
    confirm: bool | int | str = False,
) -> dict[str, Any]:
    """Assemble Board Pack from live module reports (OpenAPI assembleBoardPack).

    ``meeting`` is a Board Pack name/pack_code or an ISO meeting date.
    Requires ``confirm=true`` (confirm-before-commit). Writes agenda, feed
    event BOARD, and notifies the Board Secretary of outstanding sections.
    """
    from eswasa_governance.rules import assemble_pack_for_meeting

    if not meeting:
        frappe.throw(_("meeting is required"), frappe.ValidationError)
    if not frappe.has_permission("Board Pack", "write"):
        frappe.throw(_("Not permitted to assemble Board Pack"), frappe.PermissionError)
    if not cint(confirm):
        frappe.throw(
            _("Set confirm=true to assemble the board pack"),
            frappe.ValidationError,
        )

    summary = assemble_pack_for_meeting(meeting, notify=True)
    # Return OpenAPI BoardPackSummary fields only
    return {
        "due_label": summary["due_label"],
        "outstanding_sections": summary["outstanding_sections"],
        "sections": summary["sections"],
    }


def _safe_count(doctype: str, filters: dict[str, Any] | None = None) -> int:
    try:
        if not frappe.db.exists("DocType", doctype):
            return 0
        return int(frappe.db.count(doctype, filters or {}) or 0)
    except Exception:  # noqa: BLE001
        return 0


@frappe.whitelist()
def institution_home() -> dict[str, Any]:
    """Institution portal KPIs, module tiles, and a short feed from live docs."""
    from frappe.utils import now_datetime

    open_apps = _safe_count("Certification Application")
    overdue_audits = _safe_count("Certification Audit", {"status": "Overdue"})
    if overdue_audits == 0:
        overdue_audits = _safe_count("Audit", {"status": "Overdue"})

    standards = _safe_count("Standard", {"workflow_state": "Published"})
    if standards == 0:
        standards = _safe_count("Standard")

    kpis = [
        {
            "key": "open_apps",
            "label": "Open applications",
            "value": open_apps,
            "status": "ok" if open_apps < 50 else "warn",
        },
        {
            "key": "overdue_audits",
            "label": "Overdue audits",
            "value": overdue_audits,
            "status": "warn" if overdue_audits else "ok",
        },
        {
            "key": "standards",
            "label": "Published standards",
            "value": standards,
            "status": "ok",
        },
    ]

    modules = [
        {
            "id": "certification",
            "title": "Certification",
            "status": "active",
            "href": "/institution/certification",
        },
        {
            "id": "standards",
            "title": "Standards",
            "status": "active",
            "href": "/institution/standards",
        },
        {
            "id": "metrology",
            "title": "Metrology",
            "status": "active",
            "href": "/institution/metrology",
        },
        {
            "id": "tbt",
            "title": "TBT / Notifications",
            "status": "active",
            "href": "/institution/tbt",
        },
        {
            "id": "governance",
            "title": "Governance",
            "status": "active",
            "href": "/institution/board",
        },
        {
            "id": "finance",
            "title": "Finance",
            "status": "active",
            "href": "/institution/finance",
        },
    ]

    feed: list[dict[str, Any]] = []
    now = now_datetime().isoformat()
    try:
        if frappe.db.exists("DocType", "Certification Application"):
            for row in frappe.get_all(
                "Certification Application",
                fields=["name", "applicant_name", "workflow_state", "modified"],
                order_by="modified desc",
                limit_page_length=5,
            ):
                feed.append(
                    {
                        "id": row.name,
                        "type": "application",
                        "title": f"{row.name} — {row.workflow_state or 'Updated'}",
                        "severity": "info",
                        "created_at": str(row.modified or now),
                        "href": f"/institution/certification/{row.name}",
                    }
                )
    except Exception:  # noqa: BLE001
        pass

    return {"kpis": kpis, "modules": modules, "feed": feed}


@frappe.whitelist()
def service_home() -> dict[str, Any]:
    """Service portal home — lightweight live counts for the signed-in user."""
    from frappe.utils import now_datetime

    now = now_datetime().isoformat()
    my_apps = 0
    try:
        if frappe.db.exists("DocType", "Certification Application"):
            my_apps = int(
                frappe.db.count(
                    "Certification Application",
                    {"owner": frappe.session.user},
                )
                or 0
            )
    except Exception:  # noqa: BLE001
        my_apps = 0

    return {
        "stats": [
            {
                "key": "my_apps",
                "label": "My applications",
                "value": my_apps,
                "status": "ok",
            }
        ],
        "services": [
            {
                "id": "apply",
                "title": "Apply for certification",
                "description": "Start a product or system certification application",
                "href": "/certification/apply",
            },
            {
                "id": "estore",
                "title": "Standards e-store",
                "description": "Browse and purchase standards",
                "href": "/estore",
            },
            {
                "id": "verify",
                "title": "Verify a mark",
                "description": "Check certificate authenticity",
                "href": "/verify",
            },
        ],
        "recent_activity": [],
        "alerts": [
            {
                "id": "welcome",
                "type": "system",
                "title": "Welcome to EswasaOne",
                "severity": "info",
                "created_at": now,
            }
        ],
    }


@frappe.whitelist()
def finance_kpis() -> dict[str, Any]:
    """YTD revenue vs budget from Sales Invoice / Budget (permissions-aware)."""
    from calendar import month_abbr
    from frappe.utils import getdate, nowdate

    today = getdate(nowdate())
    year_start = getdate(f"{today.year}-01-01")

    revenue_ytd = 0.0
    monthly_actual = [0.0] * 12
    try:
        if frappe.db.exists("DocType", "Sales Invoice"):
            rows = frappe.get_all(
                "Sales Invoice",
                filters={
                    "docstatus": 1,
                    "posting_date": [">=", year_start],
                },
                fields=["grand_total", "posting_date"],
                limit_page_length=5000,
            )
            for r in rows:
                amt = float(r.grand_total or 0)
                revenue_ytd += amt
                if r.posting_date:
                    m = getdate(r.posting_date).month
                    monthly_actual[m - 1] += amt
    except Exception:  # noqa: BLE001
        frappe.log_error(title="finance_kpis revenue")

    budget_ytd = 0.0
    monthly_budget = [0.0] * 12
    try:
        if frappe.db.exists("DocType", "Budget"):
            budgets = frappe.get_all(
                "Budget",
                filters={"docstatus": ["<", 2]},
                fields=["name"],
                limit_page_length=50,
            )
            for b in budgets:
                # Budget Account child rows if present
                if frappe.db.exists("DocType", "Budget Account"):
                    for row in frappe.get_all(
                        "Budget Account",
                        filters={"parent": b.name},
                        fields=["budget_amount"],
                        limit_page_length=500,
                    ):
                        budget_ytd += float(row.budget_amount or 0)
    except Exception:  # noqa: BLE001
        frappe.log_error(title="finance_kpis budget")

    if budget_ytd <= 0:
        # Even split placeholder so variance is defined when no Budget docs
        budget_ytd = max(revenue_ytd, 1.0)
        monthly_budget = [budget_ytd / 12.0] * 12
    else:
        monthly_budget = [budget_ytd / 12.0] * 12

    variance_pct = round(((revenue_ytd - budget_ytd) / budget_ytd) * 100.0, 1)

    labels = [month_abbr[i] for i in range(1, 13)]
    return {
        "revenue_ytd_szl": revenue_ytd,
        "budget_ytd_szl": budget_ytd,
        "variance_pct": variance_pct,
        "months": {
            "labels": labels,
            "budget_thousands": [round(v / 1000.0, 2) for v in monthly_budget],
            "actual_thousands": [round(v / 1000.0, 2) for v in monthly_actual],
        },
        "plan": [
            {
                "key": "revenue_ytd",
                "label": "Revenue YTD",
                "actual": f"SZL {revenue_ytd:,.0f}",
                "target": f"SZL {budget_ytd:,.0f}",
                "status": "green"
                if revenue_ytd >= budget_ytd * 0.9
                else ("amber" if revenue_ytd >= budget_ytd * 0.7 else "red"),
            }
        ],
    }


@frappe.whitelist()
def hr_summary() -> dict[str, Any]:
    """Headcount / appraisal / leave snapshot from HRMS doctypes when present."""
    headcount = _safe_count("Employee", {"status": "Active"}) or _safe_count("Employee")

    appraisals_total = _safe_count("Appraisal")
    appraisals_done = _safe_count("Appraisal", {"status": "Completed"})
    if appraisals_total == 0:
        appraisals_done = _safe_count("Appraisal", {"docstatus": 1})
        appraisals_total = max(appraisals_done, _safe_count("Appraisal"))
    pct = (
        round((appraisals_done / appraisals_total) * 100.0, 1)
        if appraisals_total
        else 0.0
    )

    open_leave = _safe_count(
        "Leave Application", {"status": ["in", ["Open", "Approved"]]}
    )
    if open_leave == 0:
        open_leave = _safe_count("Leave Application", {"docstatus": 0})

    return {
        "headcount": headcount,
        "appraisal_completion_pct": pct,
        "open_leave": open_leave,
    }


@frappe.whitelist()
def crm_pipeline() -> dict[str, Any]:
    """Commercial pipeline stages from CRM Lead / Deal when present."""
    stages: list[dict[str, Any]] = []
    companies = 0

    lead_dt = "CRM Lead" if frappe.db.exists("DocType", "CRM Lead") else "Lead"
    deal_dt = "CRM Deal" if frappe.db.exists("DocType", "CRM Deal") else "Opportunity"

    try:
        if frappe.db.exists("DocType", lead_dt):
            leads = frappe.get_all(
                lead_dt,
                fields=["status"],
                limit_page_length=2000,
            )
            by_status: dict[str, int] = {}
            for row in leads:
                key = str(row.status or "Lead")
                by_status[key] = by_status.get(key, 0) + 1
            for name, count in by_status.items():
                stages.append({"name": name, "count": count})
    except Exception:  # noqa: BLE001
        pass

    try:
        if frappe.db.exists("DocType", deal_dt):
            deals = frappe.get_all(
                deal_dt,
                fields=["status"] if deal_dt == "CRM Deal" else ["status"],
                limit_page_length=2000,
            )
            by_status: dict[str, int] = {}
            for row in deals:
                key = str(getattr(row, "status", None) or "Deal")
                by_status[key] = by_status.get(key, 0) + 1
            for name, count in by_status.items():
                stages.append({"name": name, "count": count})
    except Exception:  # noqa: BLE001
        pass

    companies = _safe_count("Customer") or _safe_count("CRM Organization")

    if not stages:
        stages = [{"name": "Lead", "count": 0}]

    return {"stages": stages, "companies": companies}


# Alias used by older Core callers
@frappe.whitelist()
def board_pack_summary() -> dict[str, Any]:
    return get_board_pack_summary()

