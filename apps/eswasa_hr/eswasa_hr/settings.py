"""HR rules ESWASA can change, in one place: HR Settings custom fields, each with today's value as its fallback.

Every module reads windows, SLAs and limits through ``get`` instead of keeping its own copy; ``public`` hands the
same values (plus the company currency, working week and HR contact) to the portals so no screen types them in.
"""

from __future__ import annotations

from typing import Any

# key → (HR Settings field, fallback). Fallbacks are the values the app shipped with; HR changes them in HR Settings.
FIELDS: dict[str, tuple[str, Any]] = {
    "leave_sla_days": ("custom_leave_sla_days", 2),
    "expense_sla_days": ("custom_expense_sla_days", 3),
    "decision_sla_days": ("custom_decision_sla_days", 3),
    "head_sla_days": ("custom_head_sla_days", 5),
    "interview_feedback_days": ("custom_interview_feedback_days", 1),
    "offer_reply_days": ("custom_offer_reply_days", 5),
    "contract_notice_days": ("custom_contract_notice_days", 60),
    "probation_notice_days": ("custom_probation_notice_days", 30),
    "expiry_alert_days": ("custom_expiry_alert_days", "60,30,7"),
    "thin_cover": ("custom_thin_cover", 1),
    "declaration_handoff_days": ("custom_declaration_handoff_days", 10),
    "movement_days": ("custom_movement_days", 90),
    "turnover_days": ("custom_turnover_days", 365),
    "cycle_warn_days": ("custom_cycle_warn_days", 14),
    "appraisal_reminder_days": ("custom_appraisal_reminder_days", "10,3"),
    "calendar_max_days": ("custom_calendar_max_days", 62),
    "rating_max": ("custom_rating_max", 5),
    "hr_email": ("custom_hr_email", "info@swasa.co.sz"),
}

_LISTS = {"expiry_alert_days", "appraisal_reminder_days"}


def _raw(field: str) -> Any:
    try:
        import frappe

        return frappe.db.get_single_value("HR Settings", field)
    except Exception:  # noqa: BLE001  (field not migrated yet, or no HR Settings in a bare test site)
        return None


def get(key: str) -> Any:
    """The HR Settings value for ``key``, else its fallback. Day lists come back as sorted-descending int tuples."""
    field, fallback = FIELDS[key]
    value = _raw(field)
    if value in (None, "", 0, "0"):
        value = fallback
    if key in _LISTS:
        return tuple(sorted({int(x) for x in str(value).replace(" ", "").split(",") if x.isdigit()}, reverse=True))
    if isinstance(fallback, int):
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback
    return str(value)


DEMO_FIELD = "custom_is_demo"


def live(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Employee filters that leave out records marked as demo (Employee.custom_is_demo), when the field exists."""
    out = dict(filters or {})
    try:
        import frappe

        if frappe.get_meta("Employee").has_field(DEMO_FIELD):
            out[DEMO_FIELD] = ["!=", 1]
    except Exception:  # noqa: BLE001  (bare test site or field not migrated)
        pass
    return out


def currency() -> str | None:
    """The default company's currency; None when no company is set up."""
    try:
        import frappe

        company = frappe.db.get_single_value("Global Defaults", "default_company")
        return frappe.db.get_value("Company", company, "default_currency") if company else None
    except Exception:  # noqa: BLE001
        return None


def working_week() -> list[int]:
    """ISO weekdays (1 = Monday) that are not weekly offs on the company Holiday List; Mon–Fri when none is set."""
    import frappe

    from eswasa_hr import workdays

    try:
        name = workdays.holiday_list()
        rows = frappe.get_all("Holiday", filters={"parent": name, "weekly_off": 1}, fields=["holiday_date"], limit=0) if name else []
    except Exception:  # noqa: BLE001
        rows = []
    off = {d.isoweekday() for d in (workdays._as_date(r.get("holiday_date")) for r in rows) if d}
    return [d for d in range(1, 8) if d not in off] if off else [1, 2, 3, 4, 5]


def public() -> dict[str, Any]:
    """What the portals show instead of typing rules in: every setting, the currency and the working week."""
    out = {k: list(v) if isinstance(v, tuple) else v for k, v in ((k, get(k)) for k in FIELDS)}
    out["currency"] = currency()
    out["working_week"] = working_week()
    out["lists"] = lists()
    return out


def lists() -> dict[str, Any]:
    """Choice lists the screens offer, from the modules that enforce them (one copy each)."""
    from eswasa_hr import authorisations, cases, contracts, documents, employees, establishment, evidence_pack, external, lifecycle

    return {
        "evidence_types": list(authorisations.EVIDENCE_TYPES),
        "external_roles": list(external.ROLES),
        "document_types": list(documents.TYPES),
        "evidence_sections": list(evidence_pack.SECTIONS),
        "separation_reasons": list(lifecycle.REASONS),
        "contract_changes": list(contracts.KINDS),
        "establishment_changes": list(establishment.CHANGES),
        "council_changes": list(establishment.COUNCIL_CHANGES),
        "invite_roles": sorted(employees.INVITE_ALLOWED_ROLES),
        "invite_default_roles": list(employees.INVITE_DEFAULT_ROLES),
        "case_stages": {k: list(v) for k, v in cases.STAGES.items()},
        "case_closed": {k: sorted(v) for k, v in cases.CLOSED.items()},
    }


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def settings() -> dict[str, Any]:
    """Any signed-in user: the rules and limits the screens show (no personal data)."""
    return public()
