from __future__ import annotations

# Workflow states for Certification Application (ISO/IEC 17021/17065 CBMS)
STATES = (
    "Application",
    "Assessment",
    "Audit Scheduled",
    "Audit",
    "NC Resolution",
    "Certified",
    "Surveillance",
    "Renewal",
    "Withdraw",
)

# Portal / OpenAPI display labels for the same canonical workflow_state values.
# Keep STATES for Desk + Frappe workflow; map here for Core BFF responses.
DISPLAY_STATUS: dict[str, str] = {
    "Application": "Submitted",
    "Assessment": "In Review",
    "Audit Scheduled": "Audit Scheduled",
    "Audit": "Audit In Progress",
    "NC Resolution": "NC Resolution",
    "Certified": "Certified",
    "Surveillance": "Surveillance",
    "Renewal": "Renewal",
    "Withdraw": "Withdrawn",
}

# Incoming filter / alias → canonical workflow_state
STATUS_ALIASES: dict[str, str] = {
    "application": "Application",
    "submitted": "Application",
    "draft": "Application",
    "assessment": "Assessment",
    "in review": "Assessment",
    "in_review": "Assessment",
    "audit scheduled": "Audit Scheduled",
    "audit_scheduled": "Audit Scheduled",
    "audit": "Audit",
    "audit in progress": "Audit",
    "audit_in_progress": "Audit",
    "nc resolution": "NC Resolution",
    "nc_resolution": "NC Resolution",
    "certified": "Certified",
    "surveillance": "Surveillance",
    "renewal": "Renewal",
    "withdraw": "Withdraw",
    "withdrawn": "Withdraw",
}

# action -> (from_states, to_state)
# Actions accept both API slugs and Workflow Action Master labels.
TRANSITIONS: dict[str, tuple[tuple[str, ...], str]] = {
    "submit_for_assessment": (("Application",), "Assessment"),
    "submit for assessment": (("Application",), "Assessment"),
    "schedule_audit": (("Assessment", "Renewal"), "Audit Scheduled"),
    "schedule audit": (("Assessment", "Renewal"), "Audit Scheduled"),
    "start_audit": (("Audit Scheduled",), "Audit"),
    "start audit": (("Audit Scheduled",), "Audit"),
    "raise_nc": (("Audit",), "NC Resolution"),
    "raise nc": (("Audit",), "NC Resolution"),
    "clear_nc": (("NC Resolution",), "Certified"),
    "clear nc": (("NC Resolution",), "Certified"),
    "certify": (("Audit", "NC Resolution"), "Certified"),
    "start_surveillance": (("Certified",), "Surveillance"),
    "start surveillance": (("Certified",), "Surveillance"),
    "start_renewal": (("Surveillance", "Certified"), "Renewal"),
    "start renewal": (("Surveillance", "Certified"), "Renewal"),
    "reassess": (("Renewal",), "Assessment"),
    "withdraw": (
        (
            "Application",
            "Assessment",
            "Audit Scheduled",
            "Audit",
            "NC Resolution",
            "Certified",
            "Surveillance",
            "Renewal",
        ),
        "Withdraw",
    ),
}


def normalize_action(action: str | None) -> str:
    if not action:
        return ""
    return " ".join(str(action).strip().lower().replace("-", "_").split())


def display_status(workflow_state: str | None) -> str | None:
    """Map canonical workflow_state → portal-facing status label."""
    if not workflow_state:
        return workflow_state
    return DISPLAY_STATUS.get(workflow_state, workflow_state)


def resolve_workflow_state(status: str | None) -> str | None:
    """Map portal/filter alias → canonical workflow_state for queries."""
    if status is None:
        return None
    text = str(status).strip()
    if not text:
        return None
    key = " ".join(text.lower().replace("-", "_").replace("_", " ").split())
    # Also try underscore-collapsed form used in STATUS_ALIASES
    compact = key.replace(" ", "_")
    if key in STATUS_ALIASES:
        return STATUS_ALIASES[key]
    if compact in STATUS_ALIASES:
        return STATUS_ALIASES[compact]
    # Exact canonical match (case-sensitive first, then title-ish)
    if text in STATES:
        return text
    for state in STATES:
        if state.lower() == key:
            return state
    return text


def next_state(current: str, action: str) -> str:
    """Return the target workflow state or raise ValueError."""
    key = normalize_action(action)
    # Prefer underscore form; also try space form
    candidates = [key, key.replace("_", " ")]
    for cand in candidates:
        if cand in TRANSITIONS:
            allowed_from, target = TRANSITIONS[cand]
            if current not in allowed_from:
                raise ValueError(
                    f"Action '{action}' not allowed from state '{current}'. "
                    f"Allowed from: {', '.join(allowed_from)}"
                )
            return target
    raise ValueError(
        f"Unknown action '{action}'. "
        f"Known: submit_for_assessment, schedule_audit, start_audit, raise_nc, "
        f"clear_nc, certify, start_surveillance, start_renewal, reassess, withdraw"
    )


def serialize_application(doc: dict) -> dict:
    """OpenAPI CertificationApplication shape (portal display status)."""
    workflow = doc.get("workflow_state") or doc.get("status")
    return {
        "id": doc.get("name") or doc.get("id"),
        "scheme": doc.get("scheme"),
        "applicant": doc.get("applicant_name") or doc.get("applicant"),
        "status": display_status(workflow) if workflow else workflow,
        "created_at": _iso(doc.get("creation") or doc.get("created_at")),
        "updated_at": _iso(doc.get("modified") or doc.get("updated_at")),
    }


def serialize_audit_summary(doc: dict) -> dict:
    """OpenAPI AuditSummary shape."""
    return {
        "id": doc.get("name") or doc.get("id"),
        "application_id": doc.get("application") or doc.get("application_id"),
        "auditor": doc.get("auditor"),
        "scheme": doc.get("scheme"),
        "due_date": _date(doc.get("due_date")),
        "status": doc.get("status"),
    }


def _iso(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if "T" not in text and " " in text:
        text = text.replace(" ", "T", 1)
    if len(text) == 19:
        text += "Z"
    return text


def _date(value) -> str | None:
    if value is None:
        return None
    return str(value)[:10]
