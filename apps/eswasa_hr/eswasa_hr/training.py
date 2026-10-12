"""
Training as competence evidence (plan 07 step 6, brief §6.4).

``training_evidence_impl(employee, skill)`` lists what HR can pick as "Training Result" evidence on an
authorisation:
- HRMS ``Training Result`` rows for the person, on submitted results of Training Events tagged to the skill
  (custom field ``Training Event.custom_skill``). A row counts when its result is Pass. PROVISIONAL: HRMS's
  Training Result Employee has no result field in the versions we know, so when the field isn't there every
  row on a submitted result counts and its grade is shown for HR to judge.
- Frappe LMS completions (``LMS Certificate``, else ``LMS Enrollment`` at 100%), only when LMS is installed.
  LMS courses aren't tagged to a competence (ESWASA's catalogue, H7, is still awaited), so they're listed
  as untagged for HR to choose from. Their reference is ``LMS:<certificate>``.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from typing import Any

from eswasa_hr.authorisations import LMS_PREFIX

RESULT = "Training Result"
RESULT_ROW = "Training Result Employee"
EVENT = "Training Event"
SKILL_FIELD = "custom_skill"
HR_ROLES = ("HR Manager", "HR User", "System Manager")


# ---------------------------------------------------------------- pure rules


def _s(v: Any) -> str | None:
    return str(v)[:10] if v not in (None, "") else None


def passed(row: dict[str, Any], has_result_field: bool) -> bool:
    return str(row.get("result") or "").strip().lower() == "pass" if has_result_field else True


def training_items(
    rows: list[dict[str, Any]], results: dict[str, dict[str, Any]], events: dict[str, dict[str, Any]], has_result_field: bool
) -> list[dict[str, Any]]:
    """Training Result Employee rows → evidence choices. ``results`` is Training Result by name (submitted
    only); ``events`` is Training Event by name (already filtered to the skill)."""
    out = []
    for r in rows:
        res = results.get(r.get("parent") or "")
        if not res:
            continue
        ev = events.get(res.get("training_event") or "")
        if not ev or not passed(r, has_result_field):
            continue
        out.append(
            {
                "source": RESULT,
                "evidence_type": "Training Result",
                "reference": res["name"],
                "title": ev.get("event_name") or res.get("training_event"),
                "training_event": res.get("training_event"),
                "date": _s(ev.get("end_time") or ev.get("start_time")),
                "result": r.get("result") or None,
                "grade": r.get("grade") or None,
                "hours": r.get("hours") or None,
                "tagged": True,
            }
        )
    return sorted(out, key=lambda i: i["date"] or "", reverse=True)


def lms_items(certificates: list[dict[str, Any]], enrollments: list[dict[str, Any]], courses: dict[str, str]) -> list[dict[str, Any]]:
    """LMS certificates, plus finished enrolments for courses with no certificate. Never tagged to a skill."""
    out, seen = [], set()
    for c in certificates:
        seen.add(c.get("course"))
        out.append(
            {
                "source": "LMS Certificate",
                "evidence_type": "Training Result",
                "reference": f"{LMS_PREFIX}{c['name']}",
                "title": courses.get(c.get("course") or "") or c.get("course"),
                "training_event": None,
                "date": _s(c.get("issue_date")),
                "result": "Certified",
                "grade": None,
                "hours": None,
                "tagged": False,
            }
        )
    for e in enrollments:
        if e.get("course") in seen or float(e.get("progress") or 0) < 100:
            continue
        out.append(
            {
                "source": "LMS Enrollment",
                "evidence_type": "Training Result",
                "reference": None,  # no certificate to point at: HR describes it in the notes
                "title": courses.get(e.get("course") or "") or e.get("course"),
                "training_event": None,
                "date": _s(e.get("modified")),
                "result": "Completed",
                "grade": None,
                "hours": None,
                "tagged": False,
            }
        )
    return sorted(out, key=lambda i: i["date"] or "", reverse=True)


# ---------------------------------------------------------------- Frappe glue


def _exists(doctype: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", doctype))


def hrms_items(employee: str, skill: str | None) -> list[dict[str, Any]]:
    import frappe

    if not (_exists(RESULT) and _exists(EVENT)):
        return []
    if skill and not frappe.get_meta(EVENT).has_field(SKILL_FIELD):
        return []  # custom field not migrated yet: nothing is tagged
    ev_filters = {SKILL_FIELD: skill} if skill else {}
    events = {
        e["name"]: e
        for e in frappe.get_all(EVENT, filters=ev_filters, fields=["name", "event_name", "start_time", "end_time"], limit=0)
    }
    if not events:
        return []
    results = {
        r["name"]: r
        for r in frappe.get_all(
            RESULT, filters={"training_event": ["in", list(events)], "docstatus": 1}, fields=["name", "training_event"], limit=0
        )
    }
    if not results:
        return []
    has_result = frappe.get_meta(RESULT_ROW).has_field("result")
    fields = ["parent", "employee", "grade", "hours"] + (["result"] if has_result else [])
    rows = frappe.get_all(
        RESULT_ROW, filters={"employee": employee, "parent": ["in", list(results)], "parenttype": RESULT}, fields=fields, limit=0
    )
    return training_items(rows, results, events, has_result)


def lms_for(user: str | None) -> list[dict[str, Any]]:
    import frappe

    if not user or not _exists("LMS Certificate"):
        return []
    certs = frappe.get_all("LMS Certificate", filters={"member": user}, fields=["name", "course", "issue_date"], limit=0)
    enrols = (
        frappe.get_all("LMS Enrollment", filters={"member": user}, fields=["course", "progress", "modified"], limit=0)
        if _exists("LMS Enrollment")
        else []
    )
    ids = sorted({r.get("course") for r in certs + enrols if r.get("course")})
    courses = (
        {c["name"]: c.get("title") for c in frappe.get_all("LMS Course", filters={"name": ["in", ids]}, fields=["name", "title"], limit=0)}
        if ids and _exists("LMS Course")
        else {}
    )
    return lms_items(certs, enrols, courses)


def training_evidence_impl(employee: str, skill: str | None = None) -> dict[str, Any]:
    """HR, or the person, sees the training that can back an authorisation for ``skill``."""
    import frappe

    if not employee:
        frappe.throw("Choose the employee.", frappe.ValidationError)
    user = frappe.db.get_value("Employee", employee, "user_id")
    if not (set(frappe.get_roles()) & set(HR_ROLES)) and (not user or user != frappe.session.user):
        frappe.throw("You can see your own training only.", frappe.PermissionError)
    return {
        "employee": employee,
        "skill": skill or None,
        "items": hrms_items(employee, skill) + lms_for(user),
        "lms_installed": _exists("LMS Certificate"),
    }


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def evidence(employee: str, skill: str | None = None) -> dict[str, Any]:
    return training_evidence_impl(employee, skill or None)
