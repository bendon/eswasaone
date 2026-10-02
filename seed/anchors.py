"""Force exact mock anchor document names after bulk / reserve series."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER, ANCHORS, AUDITOR_CODE, SCHEME_CODE

log = logging.getLogger("seed.anchors")

# Certification Application Flow — shortest path to common seed targets
_CERT_APP_PATH: dict[str, list[str]] = {
    "Assessment": ["Submit for Assessment"],
    "Audit Scheduled": ["Submit for Assessment", "Schedule Audit"],
    "Certified": [
        "Submit for Assessment",
        "Schedule Audit",
        "Start Audit",
        "Certify",
    ],
}


def advance_application(client: FrappeClient, name: str, target: str) -> None:
    """Walk Certification Application Flow actions to ``target`` state."""
    doc = client.get_doc("Certification Application", name)
    if not doc:
        return
    current = doc.get("workflow_state") or "Application"
    if current == target:
        return
    actions = _CERT_APP_PATH.get(target)
    if not actions:
        client.resource_update(
            "Certification Application", name, {"workflow_state": target}
        )
        return
    # Re-play from Application if we are mid-path
    if current != "Application":
        # Best-effort: jump via PUT when already past start, else skip
        try:
            client.resource_update(
                "Certification Application", name, {"workflow_state": target}
            )
            return
        except FrappeError:
            pass
    for action in actions:
        doc = client.get_doc("Certification Application", name)
        if not doc:
            return
        if doc.get("workflow_state") == target:
            return
        try:
            client.apply_workflow(doc, action)
        except FrappeError as exc:
            log.warning("workflow %s on %s: %s", action, name, exc)
            break


def ensure_anchors(client: FrappeClient) -> dict[str, Any]:
    """Upsert all narrative anchors with exact names where possible."""
    result: dict[str, Any] = {}

    result["scheme_app"] = _ensure_cert_narrative(client)
    result["certificate_0029"] = _ensure_certificate_0029(client)
    result["standards"] = _ensure_standards(client)
    result["estore"] = _ensure_estore_purchase(client)
    result["audit"] = _ensure_audit_smoke(client)
    result["tbt"] = ANCHORS["tbt_symbol"]  # modules.tbt owns rows
    result["training"] = ANCHORS["training"]
    result["invoice"] = ANCHORS["invoice"]

    log.info("Anchors summary: %s", {k: v for k, v in result.items() if v})
    return result


def _ensure_cert_narrative(client: FrappeClient) -> dict[str, Any]:
    """CERT-2025-0041 — Certificate + Audit Scheduled application (mock feed)."""
    cert_id = ANCHORS["cert_application_narrative"]
    out: dict[str, Any] = {"certificate": None, "application": None}

    if not client.doctype_exists("Certification Application"):
        return out

    # Application for Swazi Fresh Produce — Audit Scheduled
    app_marker = f"{A10_MARKER}:anchor:{cert_id}"
    apps = client.get_list(
        "Certification Application",
        filters=[["assessment_notes", "like", f"%{app_marker}%"]],
        fields=["name", "workflow_state"],
        limit=1,
    )
    if apps:
        app_name = apps[0]["name"]
        try:
            client.set_value(
                "Certification Application",
                app_name,
                "assessment_notes",
                (
                    f"{app_marker}: portal activity — Cert application {cert_id} "
                    "moved to Audit Scheduled. Certificate series reserved."
                ),
            )
            client.set_value(
                "Certification Application",
                app_name,
                "assigned_auditor",
                AUDITOR_CODE,
            )
            advance_application(client, app_name, "Audit Scheduled")
        except FrappeError as exc:
            log.warning("app refresh: %s", exc)
    else:
        try:
            doc = client.insert(
                {
                    "doctype": "Certification Application",
                    "scheme": SCHEME_CODE,
                    "applicant_name": "Swazi Fresh Produce Ltd",
                    "applicant_org": "Swazi Fresh Produce Ltd",
                    "contact_email": "quality@swazifresh.example",
                    "site_address": "Malkerns, Eswatini",
                    "application_date": "2025-08-15",
                    "assigned_auditor": AUDITOR_CODE,
                    "assessment_notes": (
                        f"{app_marker}: portal activity — Cert application {cert_id} "
                        "moved to Audit Scheduled."
                    ),
                }
            )
            app_name = doc.get("name")
            if app_name:
                advance_application(client, app_name, "Audit Scheduled")
        except FrappeError as exc:
            log.warning("CERT-2025-0041 application failed: %s", exc)
            return out

    out["application"] = app_name

    if not client.doctype_exists("Certificate") or not app_name:
        return out

    # Certificate with exact name + certificate_number
    existing = client.get_doc("Certificate", cert_id)
    by_number = client.get_list(
        "Certificate",
        filters={"certificate_number": cert_id},
        fields=["name"],
        limit=1,
    )
    fields = {
        "naming_series": "CERT-.YYYY.-.#####",
        "certificate_number": cert_id,
        "application": app_name,
        "scheme": SCHEME_CODE,
        "holder_name": "Swazi Fresh Produce Ltd",
        "status": "Active",
        "issued_on": "2025-09-02",
        "valid_until": "2028-09-02",
        "scope_summary": (
            f"{A10_MARKER}: ISO 9001:2015 certification narrative anchor {cert_id}."
        ),
    }
    if existing:
        for k, v in fields.items():
            try:
                client.set_value("Certificate", cert_id, k, v)
            except FrappeError:
                pass
        out["certificate"] = cert_id
    elif by_number:
        name = by_number[0]["name"]
        if name != cert_id:
            try:
                client.rename("Certificate", name, cert_id)
                out["certificate"] = cert_id
            except FrappeError as exc:
                log.warning("rename cert to %s failed: %s", cert_id, exc)
                out["certificate"] = name
        else:
            out["certificate"] = cert_id
    else:
        try:
            inserted = client.insert({"doctype": "Certificate", **fields})
            actual = inserted.get("name")
            if actual and actual != cert_id:
                try:
                    client.rename("Certificate", actual, cert_id)
                    out["certificate"] = cert_id
                except FrappeError as exc:
                    # Fall back: at least certificate_number is correct
                    log.warning("pin name %s failed (%s); number set", cert_id, exc)
                    out["certificate"] = actual
            else:
                out["certificate"] = cert_id
        except FrappeError as exc:
            log.warning("Certificate %s insert failed: %s", cert_id, exc)

    return out


def _ensure_certificate_0029(client: FrappeClient) -> str | None:
    cert_id = ANCHORS["certificate_active"]
    if not client.doctype_exists("Certificate"):
        return None

    if client.get_doc("Certificate", cert_id):
        return cert_id
    found = client.get_list(
        "Certificate",
        filters={"certificate_number": cert_id},
        fields=["name"],
        limit=1,
    )
    if found:
        if found[0]["name"] != cert_id:
            try:
                return client.rename("Certificate", found[0]["name"], cert_id)
            except FrappeError:
                return found[0]["name"]
        return cert_id

    # Need an application
    try:
        app = client.insert(
            {
                "doctype": "Certification Application",
                "scheme": SCHEME_CODE,
                "applicant_name": "Matsapha Packaging Co",
                "applicant_org": "Matsapha Packaging Co",
                "contact_email": "qa@matsapha.example",
                "application_date": "2025-05-01",
                "assigned_auditor": AUDITOR_CODE,
                "assessment_notes": f"{A10_MARKER}:anchor:{cert_id}",
            }
        )
        app_name = app.get("name")
        if app_name:
            advance_application(client, app_name, "Certified")
        inserted = client.insert(
            {
                "doctype": "Certificate",
                "naming_series": "CERT-.YYYY.-.#####",
                "certificate_number": cert_id,
                "application": app_name,
                "scheme": SCHEME_CODE,
                "holder_name": "Matsapha Packaging Co",
                "status": "Active",
                "issued_on": "2025-06-15",
                "valid_until": "2028-06-15",
                "scope_summary": f"{A10_MARKER}: active certificate anchor {cert_id}.",
            }
        )
        actual = inserted.get("name")
        if actual and actual != cert_id:
            try:
                return client.rename("Certificate", actual, cert_id)
            except FrappeError:
                return actual
        return cert_id
    except FrappeError as exc:
        log.warning("CERT-2025-0029 failed: %s", exc)
        return None


def _ensure_standards(client: FrappeClient) -> dict[str, str | None]:
    out: dict[str, str | None] = {"szns_1043": None, "szns_987": None}
    if not client.doctype_exists("Standard"):
        return out

    # Abstracts only — never licensed full text
    specs = [
        (
            ANCHORS["standard_published"],
            "Food safety management — national adoption (catalogue abstract)",
            "Food",
            "2024-09-10",
        ),
        (
            ANCHORS["standard_purchase"],
            "Textile labelling — national adoption (catalogue abstract)",
            "Textiles",
            "2023-08-20",
        ),
    ]
    for code, title, sector, published in specs:
        try:
            name = client.upsert(
                "Standard",
                code,
                {
                    "code": code,
                    "title": title,
                    "sector": sector,
                    "status": "Published",
                    "version": code.split(":")[-1],
                    "ics_code": "67.020" if "1043" in code else "59.080",
                    "abstract": (
                        f"<p>{A10_MARKER}: Published catalogue entry for {code}. "
                        "Paraphrase only — purchase full text via e-store.</p>"
                    ),
                    "buy_url": "/estore",
                    "published_on": published,
                },
            )
            if "1043" in code:
                out["szns_1043"] = name
            else:
                out["szns_987"] = name
        except FrappeError as exc:
            log.warning("Standard %s: %s", code, exc)
    return out


def _ensure_estore_purchase(client: FrappeClient) -> dict[str, str | None]:
    """SZNS 987:2023 purchase as STD-2025-0009 License Entitlement."""
    out: dict[str, str | None] = {"product": None, "entitlement": None}
    code = ANCHORS["standard_purchase"]
    order_id = ANCHORS["estore_order"]

    if client.doctype_exists("Standard Product"):
        try:
            out["product"] = client.upsert(
                "Standard Product",
                code,
                {
                    "standard_code": code,
                    "title": "Textile labelling (SZNS 987:2023)",
                    "price_szl": 450,
                    "sector": "Textiles",
                    "rights": "licensed",
                    "is_published": 1,
                    "description": (
                        f"<p>{A10_MARKER}: E-store listing — no full standard PDF in seed.</p>"
                    ),
                },
            )
        except FrappeError as exc:
            log.warning("Standard Product: %s", exc)

    if client.doctype_exists("License Entitlement") and out["product"]:
        try:
            out["entitlement"] = client.upsert(
                "License Entitlement",
                order_id,
                {
                    "entitlement_id": order_id,
                    "customer": "Demo Citizen Buyer",
                    "user_email": "citizen@example.sz",
                    "standard_product": out["product"],
                    "standard_code": code,
                    "seats": 1,
                    "valid_from": "2025-08-20",
                    "valid_to": "2026-08-20",
                    "sales_order": order_id,
                    "status": "Active",
                },
            )
        except FrappeError as exc:
            log.warning("License Entitlement %s: %s", order_id, exc)

    return out


def _ensure_audit_smoke(client: FrappeClient) -> str | None:
    """Prefer AUD-2026-00001 — absorbable with CertOps demo seed."""
    audit_id = ANCHORS["audit_smoke"]
    if not client.doctype_exists("Audit"):
        return None

    if client.get_doc("Audit", audit_id):
        # Refresh overdue without clobbering foreign markers lightly
        try:
            overdue = (date.today() - timedelta(days=14)).isoformat()
            client.set_value("Audit", audit_id, "due_date", overdue)
            client.set_value("Audit", audit_id, "status", "Overdue")
        except FrappeError:
            pass
        return audit_id

    # Need application
    apps = client.get_list(
        "Certification Application",
        filters=[["assessment_notes", "like", f"%{A10_MARKER}%"]],
        fields=["name"],
        limit=1,
    )
    if not apps:
        apps = client.get_list("Certification Application", fields=["name"], limit=1)
    if not apps:
        return None

    app_name = apps[0]["name"]
    overdue = (date.today() - timedelta(days=14)).isoformat()
    try:
        inserted = client.insert(
            {
                "doctype": "Audit",
                "application": app_name,
                "scheme": SCHEME_CODE,
                "auditor": AUDITOR_CODE,
                "audit_type": "Stage 1",
                "status": "Overdue",
                "due_date": overdue,
                "planned_date": overdue,
                "findings_summary": (
                    f"{A10_MARKER}: preferred smoke audit {audit_id}. "
                    "Coexists with eswasa_certification demo seed "
                    "(set ESWASA_CERT_DEMO_SEED=0 when A10 owns volumes)."
                ),
            }
        )
        actual = inserted.get("name")
        if actual and actual != audit_id:
            try:
                return client.rename("Audit", actual, audit_id)
            except FrappeError as exc:
                log.warning("Could not pin %s (kept %s): %s", audit_id, actual, exc)
                return actual
        return audit_id
    except FrappeError as exc:
        log.warning("Audit smoke failed: %s", exc)
        return None
