"""
Accreditation evidence pack (plan 07 step 8, brief §6.6, H11): what SADCAS asks to see for the people who
audit, review or calibrate.

``request_impl(scope)`` takes exactly one of ``employee``, ``external_person``, ``scheme`` or ``discipline``
(a calibration discipline: Skill.custom_scheme on Calibration skills). It writes one ``HR Access Log`` row
per person (the pack holds personal records), creates an ``HR Evidence Pack`` and builds it in the background
(``frappe.enqueue``). Per person:
- current authorisations, with their evidence rows and files
- monitoring: witnessed audits and proficiency tests from the evidence rows, plus the Field Visits and Audits
  Certification records for them (read-only; ``monitoring_sources`` lists the DocTypes found)
- signed impartiality declarations for the last two declaration years (H8 look-back, provisional)
- training results (``eswasa_hr.training``)

Output: ``pack.json``, one PDF per person, and the evidence files Frappe holds, in a private ZIP. Evidence
files kept in Core's media store are listed in ``media_files``; Core adds them to the ZIP on download.
No Personal or Pay field is ever read: a person is their name, ID, department and designation only.

Access: HR Manager and Eswasa Quality Manager (new role, PROVISIONAL: no quality role existed). The sections
are a configurable list until ESWASA confirms what SADCAS asks for (H11).
Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from eswasa_hr.declarations import LOOK_BACK_YEARS, declaration_year, year_label
from eswasa_hr.sensitive import protected_labels

DOCTYPE = "HR Evidence Pack"
LOG = "HR Access Log"
LOG_LEVEL = "Evidence pack"
QUALITY_ROLE = "Eswasa Quality Manager"
ROLES = ("HR Manager", QUALITY_ROLE, "System Manager")
SCOPES = ("employee", "external_person", "scheme", "discipline")
SECTIONS = ("authorisations", "monitoring", "declarations", "training")  # H11: provisional, configurable
MONITORING_TYPES = ("Witnessed audit", "Proficiency test")
PERSON_FIELDS = ("type", "id", "name", "department", "designation")
PROTECTED = frozenset(protected_labels())
FRAPPE_FILE = ("/files/", "/private/files/")


# ---------------------------------------------------------------- pure rules


def can_export(roles: list[str] | tuple[str, ...] | set[str]) -> bool:
    return bool(set(roles) & set(ROLES))


def clean_scope(scope: dict[str, Any]) -> tuple[str, str]:
    """(kind, value) for exactly one of the scope keys, else ValueError with the reason."""
    given = [(k, str(scope.get(k)).strip()) for k in SCOPES if str(scope.get(k) or "").strip()]
    if len(given) != 1:
        raise ValueError("Choose one person, one scheme or one discipline for the pack.")
    return given[0]


def clean_sections(sections: list[str] | None) -> list[str]:
    if not sections:
        return list(SECTIONS)
    bad = [s for s in sections if s not in SECTIONS]
    if bad:
        raise ValueError(f"Unknown pack section: {', '.join(bad)}. Choose from {', '.join(SECTIONS)}.")
    return [s for s in SECTIONS if s in sections]


def declaration_years(day: date) -> list[int]:
    """The declaration years in the look-back, newest first (H8: two years, provisional)."""
    now = declaration_year(day)
    return [now - i for i in range(LOOK_BACK_YEARS)]


def is_frappe_file(ref: str | None) -> bool:
    return bool(ref) and str(ref).startswith(FRAPPE_FILE)


def files_of(authorisations: list[dict[str, Any]]) -> list[str]:
    return [e["file"] for a in authorisations for e in a.get("evidence", []) if e.get("file")]


def monitoring_from(authorisations: list[dict[str, Any]], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Witnessed audits and proficiency tests on the evidence rows, then the records found elsewhere."""
    out = [
        {"source": "Staff Authorisation", "kind": e["evidence_type"], "reference": e.get("reference"), "skill": a.get("skill"), "date": None}
        for a in authorisations
        for e in a.get("evidence", [])
        if e.get("evidence_type") in MONITORING_TYPES
    ]
    return out + sorted(records, key=lambda r: r.get("date") or "", reverse=True)


def strip_protected(value: Any) -> Any:
    """Drop any Personal or Pay field, at any depth (defence in depth: the pack never reads them)."""
    if isinstance(value, dict):
        return {k: strip_protected(v) for k, v in value.items() if k not in PROTECTED}
    if isinstance(value, list):
        return [strip_protected(v) for v in value]
    return value


def person_block(
    person: dict[str, Any],
    sections: list[str],
    authorisations: list[dict[str, Any]],
    monitoring: list[dict[str, Any]],
    declarations: list[dict[str, Any]],
    training: list[dict[str, Any]],
) -> dict[str, Any]:
    block: dict[str, Any] = {"person": {k: person.get(k) for k in PERSON_FIELDS}}
    parts = {"authorisations": authorisations, "monitoring": monitoring, "declarations": declarations, "training": training}
    for s in sections:
        block[s] = parts[s]
    return strip_protected(block)


def log_reason(pack: str, kind: str, value: str) -> str:
    return f"Accreditation evidence pack {pack} ({kind.replace('_', ' ')}: {value})"


PERSON_TEMPLATE = """
<h2>{{ p.person.name }}</h2>
<p>{{ p.person.type }} {{ p.person.id }}{% if p.person.designation %} · {{ p.person.designation }}{% endif %}{% if p.person.department %} · {{ p.person.department }}{% endif %}</p>
<p>Evidence pack {{ pack }}, prepared {{ prepared }}.</p>
{% if p.authorisations is defined %}<h3>Authorisations</h3>
{% for a in p.authorisations %}<p><b>{{ a.skill }}</b>: {{ a.status }}, {{ a.valid_from or "" }} to {{ a.valid_to or "open" }}{% if a.approver %}, approved by {{ a.approver }}{% endif %}</p>
<ul>{% for e in a.evidence %}<li>{{ e.evidence_type }}: {{ e.reference or "" }} {{ e.notes or "" }}{% if e.file %} (file in pack){% endif %}</li>{% endfor %}</ul>
{% else %}<p>None current.</p>{% endfor %}{% endif %}
{% if p.monitoring is defined %}<h3>Monitoring</h3><ul>{% for m in p.monitoring %}<li>{{ m.kind }}: {{ m.reference or "" }} {{ m.date or "" }}</li>{% else %}<li>None recorded.</li>{% endfor %}</ul>{% endif %}
{% if p.declarations is defined %}<h3>Impartiality declarations</h3><ul>{% for d in p.declarations %}<li>{{ d.year_label }}: {{ d.status }}{% if d.signed_on %}, signed {{ d.signed_on }}{% endif %}{% for i in d.interests %}; interest in {{ i.organisation }} ({{ i.relationship }}){% endfor %}</li>{% endfor %}</ul>{% endif %}
{% if p.training is defined %}<h3>Training</h3><ul>{% for t in p.training %}<li>{{ t.title }} {{ t.date or "" }} {{ t.result or t.grade or "" }}</li>{% else %}<li>None recorded.</li>{% endfor %}</ul>{% endif %}
"""


# ---------------------------------------------------------------- Frappe glue


def _today() -> date:
    from frappe.utils import getdate, nowdate

    return getdate(nowdate())


def _require_access() -> None:
    import frappe

    if not can_export(frappe.get_roles()):
        frappe.throw("Only HR Managers and the Quality Manager can export the evidence pack.", frappe.PermissionError)


def _exists(doctype: str) -> bool:
    import frappe

    return bool(frappe.db.exists("DocType", doctype))


def _employee(name: str) -> dict[str, Any] | None:
    import frappe

    row = frappe.db.get_value("Employee", name, ["name", "employee_name", "user_id", "department", "designation"], as_dict=True)
    if not row:
        return None
    return {"type": "Employee", "id": row["name"], "name": row.get("employee_name") or row["name"], "user": row.get("user_id"),
            "department": row.get("department"), "designation": row.get("designation")}


def _external(name: str) -> dict[str, Any] | None:
    import frappe

    if not _exists("External Person"):
        return None
    row = frappe.db.get_value("External Person", name, ["name", "full_name", "user", "role"], as_dict=True)
    if not row:
        return None
    return {"type": "External", "id": row["name"], "name": row.get("full_name") or row["name"], "user": row.get("user"),
            "department": None, "designation": row.get("role")}


def people_for(kind: str, value: str) -> list[dict[str, Any]]:
    """The people a scope covers: one person, or everyone with a current or expiring authorisation for a
    competence of the scheme / discipline."""
    import frappe

    if kind == "employee":
        p = _employee(value)
        return [p] if p else []
    if kind == "external_person":
        p = _external(value)
        return [p] if p else []
    filters: dict[str, Any] = {"custom_scheme": value}
    if kind == "discipline":
        from eswasa_hr.competence import CALIBRATION_KIND

        filters["custom_kind"] = CALIBRATION_KIND
    skills = [s["name"] for s in frappe.get_all("Skill", filters=filters, fields=["name"], limit=0)]
    if not skills:
        return []
    rows = frappe.get_all(
        "Staff Authorisation",
        filters={"skill": ["in", skills], "docstatus": 1, "status": ["in", ["Current", "Expiring"]]},
        fields=["employee", "external_person"],
        limit=0,
    )
    out, seen = [], set()
    for r in rows:
        key = ("Employee", r.get("employee")) if r.get("employee") else ("External", r.get("external_person"))
        if not key[1] or key in seen:
            continue
        seen.add(key)
        p = _employee(key[1]) if key[0] == "Employee" else _external(key[1])
        if p:
            out.append(p)
    return sorted(out, key=lambda p: p["name"])


def _authorisations(p: dict[str, Any]) -> list[dict[str, Any]]:
    import frappe

    from eswasa_hr.authorisations import status_on

    field = "employee" if p["type"] == "Employee" else "external_person"
    day = _today()
    rows = frappe.get_all(
        "Staff Authorisation",
        filters={field: p["id"], "docstatus": 1},
        fields=["name", "skill", "valid_from", "valid_to", "status", "docstatus", "approved_by"],
        order_by="skill asc",
        limit=0,
    )
    out = []
    for r in rows:
        status = status_on(r.get("docstatus"), r.get("valid_to"), day, r.get("status") == "Withdrawn")
        if status not in ("Current", "Expiring"):
            continue
        ev = frappe.get_all(
            "Staff Authorisation Evidence",
            filters={"parent": r["name"], "parenttype": "Staff Authorisation"},
            fields=["name", "evidence_type", "reference", "notes", "attachment"],
            order_by="idx asc",
            limit=0,
        )
        out.append(
            {
                "id": r["name"],
                "skill": r["skill"],
                "status": status,
                "valid_from": str(r["valid_from"]) if r.get("valid_from") else None,
                "valid_to": str(r["valid_to"]) if r.get("valid_to") else None,
                "approver": frappe.db.get_value("Employee", r.get("approved_by"), "employee_name") if r.get("approved_by") else None,
                "evidence": [
                    {"id": e["name"], "evidence_type": e.get("evidence_type"), "reference": e.get("reference"),
                     "notes": e.get("notes"), "file": e.get("attachment") or None}
                    for e in ev
                ],
            }
        )
    return out


def monitoring_records(p: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    """Read-only: Field Visits led and Audits done, where Certification records them."""
    import frappe

    rows: list[dict[str, Any]] = []
    found = []
    user = p.get("user")
    if user and _exists("Field Visit"):
        found.append("Field Visit")
        for v in frappe.get_all("Field Visit", filters={"lead_auditor": user}, fields=["name", "title", "planned_date", "scheme"], limit=0):
            rows.append({"source": "Field Visit", "kind": "Led visit", "reference": v["name"], "skill": v.get("scheme"),
                         "date": str(v["planned_date"]) if v.get("planned_date") else None})
    if user and _exists("Auditor") and _exists("Audit"):
        found.append("Audit")
        auditors = [a["name"] for a in frappe.get_all("Auditor", filters={"user": user}, fields=["name"], limit=0)]
        if auditors:
            for a in frappe.get_all(
                "Audit", filters={"auditor": ["in", auditors], "status": "Completed"},
                fields=["name", "audit_type", "scheme", "completed_date"], limit=0,
            ):
                rows.append({"source": "Audit", "kind": a.get("audit_type") or "Audit", "reference": a["name"], "skill": a.get("scheme"),
                             "date": str(a["completed_date"]) if a.get("completed_date") else None})
    return rows, found


def _declarations(p: dict[str, Any]) -> list[dict[str, Any]]:
    import frappe

    field = "employee" if p["type"] == "Employee" else "external_person"
    years = declaration_years(_today())
    out = []
    for y in years:
        doc = frappe.db.get_value(
            "Impartiality Declaration", {field: p["id"], "year": y, "docstatus": 1}, ["name", "signed_on", "nothing_else"], as_dict=True
        )
        interests = (
            frappe.get_all(
                "Impartiality Interest", filters={"parent": doc["name"]},
                fields=["organisation", "relationship", "from_date", "to_date"], limit=0,
            )
            if doc
            else []
        )
        out.append(
            {
                "year": y,
                "year_label": year_label(y),
                "status": "signed" if doc else "not signed",
                "signed_on": str(doc["signed_on"]) if doc and doc.get("signed_on") else None,
                "interests": [{k: (str(v) if v is not None else None) for k, v in dict(i).items()} for i in interests],
            }
        )
    return out


def _training(p: dict[str, Any]) -> list[dict[str, Any]]:
    from eswasa_hr import training

    items = training.hrms_items(p["id"], None) if p["type"] == "Employee" else []
    return items + training.lms_for(p.get("user"))


def gather(people: list[dict[str, Any]], sections: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    blocks, sources = [], set()
    for p in people:
        auths = _authorisations(p) if {"authorisations", "monitoring"} & set(sections) else []
        records, found = monitoring_records(p) if "monitoring" in sections else ([], [])
        sources.update(found)
        blocks.append(
            person_block(
                p, sections, auths, monitoring_from(auths, records),
                _declarations(p) if "declarations" in sections else [],
                _training(p) if "training" in sections else [],
            )
        )
    return blocks, sorted(sources)


def _write_logs(pack: str, kind: str, value: str, people: list[dict[str, Any]]) -> None:
    import frappe
    from frappe.utils import now_datetime

    if not _exists(LOG):
        return
    for p in people:
        frappe.get_doc(
            {
                "doctype": LOG,
                "employee": p["id"] if p["type"] == "Employee" else None,
                "employee_name": p["name"],
                "viewer": frappe.session.user,
                "level": LOG_LEVEL,
                "viewed_on": now_datetime(),
                "fields": ", ".join(SECTIONS),
                "reason": log_reason(pack, kind, value),
            }
        ).insert(ignore_permissions=True)


def job_row(doc: Any) -> dict[str, Any]:
    get = doc.get if isinstance(doc, dict) else lambda k: getattr(doc, k, None)
    return {
        "id": get("name"),
        "status": get("status") or "Queued",
        "scope": {"kind": get("scope_type"), "value": get("scope_value")},
        "people": int(get("people") or 0),
        "ready": get("status") == "Ready",
        "error": get("error") or None,
        "finished_on": str(get("finished_on")) if get("finished_on") else None,
    }


def request_impl(scope: dict[str, Any], sections: list[str] | None = None) -> dict[str, Any]:
    import frappe

    _require_access()
    try:
        kind, value = clean_scope(scope)
        chosen = clean_sections(sections)
    except ValueError as exc:
        frappe.throw(str(exc), frappe.ValidationError)
    people = people_for(kind, value)
    if not people:
        frappe.throw("Nobody is in this pack: no such person, or no current authorisations for it.", frappe.ValidationError)
    doc = frappe.get_doc(
        {"doctype": DOCTYPE, "requested_by": frappe.session.user, "scope_type": kind, "scope_value": value,
         "status": "Queued", "people": len(people)}
    ).insert(ignore_permissions=True)
    _write_logs(doc.name, kind, value, people)
    frappe.enqueue("eswasa_hr.evidence_pack.build", queue="long", timeout=1800, pack=doc.name, sections=chosen,
                   enqueue_after_commit=True)
    return job_row(doc)


def build(pack: str, sections: list[str] | None = None) -> None:
    """Background job: the ZIP of pack.json, one PDF per person and the Frappe-held evidence files."""
    import io
    import zipfile

    import frappe
    from frappe.utils import now_datetime

    doc = frappe.get_doc(DOCTYPE, pack)
    frappe.db.set_value(DOCTYPE, pack, "status", "Running")
    frappe.db.commit()
    try:
        people = people_for(doc.scope_type, doc.scope_value)
        blocks, sources = gather(people, clean_sections(sections))
        prepared = str(_today())
        buf = io.BytesIO()
        media = []
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("pack.json", json.dumps({"pack": pack, "prepared": prepared, "monitoring_sources": sources, "people": blocks},
                                               indent=1, default=str))
            for b in blocks:
                pid = b["person"]["id"]
                html = frappe.render_template(PERSON_TEMPLATE, {"p": b, "pack": pack, "prepared": prepared})
                try:
                    from frappe.utils.pdf import get_pdf

                    z.writestr(f"people/{pid}.pdf", get_pdf(html))
                except Exception:  # no wkhtmltopdf on this host: keep the HTML
                    z.writestr(f"people/{pid}.html", html)
                for i, ref in enumerate(files_of(b.get("authorisations", [])), start=1):
                    path = f"files/{pid}/{i}-{str(ref).rsplit('/', 1)[-1]}"
                    if is_frappe_file(ref):
                        f = frappe.get_doc("File", {"file_url": ref})
                        z.writestr(path, f.get_content())
                    else:
                        media.append({"key": ref, "path": path})
        f = frappe.get_doc(
            {"doctype": "File", "file_name": f"evidence-pack-{pack}.zip", "attached_to_doctype": DOCTYPE,
             "attached_to_name": pack, "is_private": 1, "content": buf.getvalue()}
        ).insert(ignore_permissions=True)
        frappe.db.set_value(DOCTYPE, pack, {"status": "Ready", "file": f.file_url, "media_files": json.dumps(media),
                                            "people": len(blocks), "finished_on": now_datetime()})
    except Exception as exc:  # the job's row says what went wrong; the requester sees it on the status route
        frappe.db.rollback()
        frappe.db.set_value(DOCTYPE, pack, {"status": "Failed", "error": str(exc)[:500], "finished_on": now_datetime()})
        frappe.log_error(title=f"Evidence pack {pack}")
    frappe.db.commit()


def _own_pack(pack: str) -> Any:
    import frappe

    _require_access()
    doc = frappe.get_doc(DOCTYPE, pack)
    if doc.requested_by != frappe.session.user and "HR Manager" not in frappe.get_roles():
        frappe.throw("You can follow the packs you asked for only.", frappe.PermissionError)
    return doc


def status_impl(pack: str) -> dict[str, Any]:
    return job_row(_own_pack(pack))


def download_impl(pack: str) -> dict[str, Any]:
    """The ZIP (base64) and the media-store files Core adds to it."""
    import base64

    import frappe

    doc = _own_pack(pack)
    if doc.status != "Ready" or not doc.file:
        frappe.throw("The pack isn't ready yet.", frappe.ValidationError)
    f = frappe.get_doc("File", {"file_url": doc.file})
    return {
        "id": doc.name,
        "file_name": f.file_name,
        "content": base64.b64encode(f.get_content()).decode(),
        "media_files": json.loads(doc.media_files or "[]"),
    }


# ---------------------------------------------------------------- whitelisted API (Core calls these)


def _whitelist(fn):
    try:
        import frappe

        return frappe.whitelist()(fn)
    except (ImportError, AttributeError):  # tests without Frappe, or with a stand-in module
        return fn


@_whitelist
def request(
    employee: str | None = None,
    external_person: str | None = None,
    scheme: str | None = None,
    discipline: str | None = None,
    sections: Any = None,
    confirm: Any = False,
) -> dict[str, Any]:
    import frappe
    from frappe.utils import cint

    if not cint(confirm):
        frappe.throw("confirm=true required", frappe.ValidationError)
    chosen = frappe.parse_json(sections) if isinstance(sections, str) else sections
    return request_impl({"employee": employee, "external_person": external_person, "scheme": scheme, "discipline": discipline}, chosen)


@_whitelist
def status(pack: str) -> dict[str, Any]:
    return status_impl(pack)


@_whitelist
def download(pack: str) -> dict[str, Any]:
    return download_impl(pack)
