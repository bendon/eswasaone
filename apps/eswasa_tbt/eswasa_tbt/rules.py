"""TBT business rules R-T1…R-T2.

Triggered from TBT Notification controllers / hooks.doc_events.
Side-effects are idempotent. Feed pattern clones certification
(realtime ``eswasa_feed`` + Notification Log + Comment).
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import now_datetime

FEED_REALTIME_EVENT = "eswasa_feed"

_HIGH_SECTORS = {"textiles", "electrical", "chemicals", "pharma", "automotive"}
_LOW_SECTORS = {"services", "tourism"}

# Roles alerted on High impact (R-T2)
_STAFF_ROLES = ("Eswasa TBT Officer", "Eswasa TBT Analyst")


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _log(title: str, detail: str = "") -> None:
    try:
        frappe.logger("eswasa_tbt").info(f"{title}: {detail}")
    except Exception:
        pass
    try:
        frappe.log_error(message=detail or title, title=f"[tbt] {title}"[:140])
    except Exception:
        pass


def _comment(doctype: str, name: str, content: str, comment_type: str = "Info") -> None:
    """Best-effort Comment (db_insert avoids broken global on_change hooks)."""
    try:
        comment = frappe.get_doc(
            {
                "doctype": "Comment",
                "comment_type": comment_type,
                "reference_doctype": doctype,
                "reference_name": name,
                "content": content,
            }
        )
        comment.set_new_name()
        comment.db_insert()
    except Exception:
        pass


def publish_feed(
    *,
    event: str,
    subject: str,
    reference_doctype: str,
    reference_name: str,
    detail: str | None = None,
    status: str | None = None,
) -> None:
    """Feed stub Core can consume: realtime + Notification Log + Comment."""
    payload = {
        "source": "eswasa_tbt",
        "event": event,
        "subject": subject,
        "status": status,
        "reference_doctype": reference_doctype,
        "reference_name": reference_name,
        "detail": detail,
        "at": str(now_datetime()),
    }
    try:
        frappe.publish_realtime(
            FEED_REALTIME_EVENT,
            payload,
            after_commit=True,
        )
    except Exception:
        pass

    try:
        if frappe.db.exists("DocType", "Notification Log"):
            nlog = frappe.get_doc(
                {
                    "doctype": "Notification Log",
                    "subject": f"[{event}] {subject}"[:140],
                    "email_content": detail or subject,
                    "document_type": reference_doctype,
                    "document_name": reference_name,
                    "type": "Alert",
                    "from_user": frappe.session.user or "Administrator",
                }
            )
            nlog.insert(ignore_permissions=True)
    except Exception:
        _log("feed_notification_log_failed", event)

    _comment(
        reference_doctype,
        reference_name,
        f"[feed:{event}] {subject}" + (f": {detail}" if detail else ""),
    )


def _assign_role_todo(
    *,
    doctype: str,
    name: str,
    role: str,
    description: str,
    priority: str = "Medium",
) -> None:
    existing = frappe.db.exists(
        "ToDo",
        {
            "reference_type": doctype,
            "reference_name": name,
            "role": role,
            "status": "Open",
        },
    )
    if existing:
        return
    try:
        todo = frappe.get_doc(
            {
                "doctype": "ToDo",
                "description": description,
                "reference_type": doctype,
                "reference_name": name,
                "role": role,
                "assigned_by": frappe.session.user or "Administrator",
                "status": "Open",
                "priority": priority,
            }
        )
        todo.insert(ignore_permissions=True)
    except Exception:
        _log("assign_todo_failed", f"{doctype} {name} → {role}")


def _notify_email(recipients: list[str], subject: str, message: str) -> None:
    recipients = [r for r in recipients if r and "@" in r]
    if not recipients:
        return
    try:
        frappe.sendmail(
            recipients=recipients,
            subject=subject,
            message=message,
            delayed=True,
            retry=0,
        )
    except Exception:
        _log("email_failed", subject)


def _notify_wa(
    *,
    doctype: str,
    name: str,
    recipients: list[str],
    subject: str,
    message: str,
) -> None:
    """WhatsApp stub — Comment + Notification Log until Core WA adapter is wired."""
    recipients = [r for r in recipients if r]
    if not recipients:
        return
    detail = f"[wa:stub] to={','.join(recipients[:8])}; {message}"[:500]
    _comment(doctype, name, detail)
    try:
        if frappe.db.exists("DocType", "Notification Log"):
            nlog = frappe.get_doc(
                {
                    "doctype": "Notification Log",
                    "subject": f"[wa] {subject}"[:140],
                    "email_content": detail,
                    "document_type": doctype,
                    "document_name": name,
                    "type": "Alert",
                    "from_user": frappe.session.user or "Administrator",
                }
            )
            nlog.insert(ignore_permissions=True)
    except Exception:
        _log("wa_stub_failed", subject)
    _log("wa_stub", detail)


def csv_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in str(raw).replace(";", ",").split(",") if s.strip()]


def impact_for(sectors: list[str], symbol: str | None = None) -> str:
    """Derive impact enum (high|medium|low) — shared with list_notifications."""
    if symbol and "EU/891" in symbol.upper():
        return "high"
    lowered = {s.lower() for s in sectors}
    if lowered & _HIGH_SECTORS:
        return "high"
    if lowered & _LOW_SECTORS:
        return "low"
    return "medium"


def _already_fired(doctype: str, name: str, rule: str) -> bool:
    """Idempotency via Comment marker."""
    return bool(
        frappe.get_all(
            "Comment",
            filters={
                "reference_doctype": doctype,
                "reference_name": name,
                "content": ("like", f"%[rule:{rule}]%"),
            },
            limit_page_length=1,
        )
    )


def _mark_fired(doctype: str, name: str, rule: str, detail: str = "") -> None:
    _comment(doctype, name, f"[rule:{rule}] {detail}".strip())


# ---------------------------------------------------------------------------
# Classification (sector / HS / jurisdiction)
# ---------------------------------------------------------------------------


def classify_notification(doc) -> dict[str, Any]:
    """Fill sectors from Sector Tag HS prefixes; jurisdiction = country."""
    sectors = csv_list(doc.get("sectors"))
    hs_codes = csv_list(doc.get("hs_codes"))
    jurisdiction = (doc.get("country") or "").strip()

    if frappe.db.exists("DocType", "Sector Tag") and hs_codes:
        tags = frappe.get_all(
            "Sector Tag",
            fields=["tag", "label", "hs_prefix"],
            limit_page_length=200,
        )
        for tag in tags:
            prefix = (tag.hs_prefix or "").strip()
            if not prefix:
                continue
            if any(h.startswith(prefix) or prefix.startswith(h[: len(prefix)]) for h in hs_codes):
                label = tag.tag or tag.label
                if label and label not in sectors:
                    sectors.append(label)

    # Persist classification back onto the doc (db only — avoid recursion)
    updates: dict[str, Any] = {}
    new_sectors = ", ".join(sectors)
    if new_sectors and new_sectors != (doc.get("sectors") or ""):
        updates["sectors"] = new_sectors
        doc.sectors = new_sectors
    if updates:
        frappe.db.set_value(doc.doctype, doc.name, updates, update_modified=False)

    return {
        "sectors": sectors,
        "hs_codes": hs_codes,
        "jurisdiction": jurisdiction,
        "impact": impact_for(sectors, doc.get("symbol")),
    }


# ---------------------------------------------------------------------------
# Subscription matching
# ---------------------------------------------------------------------------


def match_subscriptions(classification: dict[str, Any]) -> list[dict[str, Any]]:
    """Active Subscriptions matching sector and/or country (jurisdiction)."""
    if not frappe.db.exists("DocType", "Subscription"):
        return []
    sectors = {s.lower() for s in classification.get("sectors") or []}
    jurisdiction = (classification.get("jurisdiction") or "").lower()
    rows = frappe.get_all(
        "Subscription",
        filters={"active": 1},
        fields=[
            "name",
            "subscription_id",
            "subscriber_email",
            "subscriber_user",
            "sectors",
            "countries",
            "channel",
        ],
        limit_page_length=500,
    )
    matched: list[dict[str, Any]] = []
    for row in rows:
        sub_sectors = {s.lower() for s in csv_list(row.sectors)}
        sub_countries = {c.lower() for c in csv_list(row.countries)}
        sector_hit = bool(sub_sectors & sectors) if sub_sectors else not sub_countries
        country_hit = (
            any(jurisdiction and (c in jurisdiction or jurisdiction in c) for c in sub_countries)
            if sub_countries
            else not sub_sectors
        )
        # Match if sector OR country overlaps; empty filters on both → match all
        if not sub_sectors and not sub_countries:
            matched.append(row)
        elif sector_hit or country_hit:
            matched.append(row)
    return matched


# ---------------------------------------------------------------------------
# Export guidance (Market Requirement)
# ---------------------------------------------------------------------------


def _add_export_guidance(doc, classification: dict[str, Any]) -> str | None:
    """Create Draft Market Requirement linked as Export guidance (R-T1)."""
    if not frappe.db.exists("DocType", "Market Requirement"):
        _comment(doc.doctype, doc.name, "[R-T1] Market Requirement DocType missing; guidance stub")
        return None

    title = f"TBT Export: {doc.get('symbol') or doc.name}"[:140]
    existing = frappe.db.exists("Market Requirement", {"title": title})
    if existing:
        return existing

    sectors = classification.get("sectors") or []
    hs = classification.get("hs_codes") or []
    try:
        mr = frappe.get_doc(
            {
                "doctype": "Market Requirement",
                "title": title,
                "jurisdiction": classification.get("jurisdiction") or doc.get("country"),
                "sector": ", ".join(sectors)[:140] if sectors else None,
                "hs_code": ", ".join(hs)[:140] if hs else None,
                "requirement_text": (
                    f"Export guidance from TBT notification {doc.get('symbol') or doc.name}.\n"
                    f"Impact: {classification.get('impact')}.\n"
                    f"{(doc.get('summary') or doc.get('title') or '')[:2000]}"
                ),
                "status": "Draft",
            }
        )
        mr.insert(ignore_permissions=True)
        return mr.name
    except Exception as exc:
        _log("export_guidance_failed", f"{doc.name}: {exc}")
        return None


# ---------------------------------------------------------------------------
# R-T1 — ingest → classify → match → notify → export guidance
# ---------------------------------------------------------------------------


def rt1_notification_ingested(doc, method: str | None = None) -> dict[str, Any]:
    """R-T1: classify, match Subscriptions, email+feed, add Export guidance."""
    if getattr(doc, "flags", None) and doc.flags.get("rt1_done"):
        return {"skipped": True}
    if _already_fired(doc.doctype, doc.name, "R-T1"):
        return {"skipped": True, "reason": "already_fired"}

    if not doc.get("workflow_state"):
        frappe.db.set_value(
            doc.doctype, doc.name, "workflow_state", "Ingested", update_modified=False
        )
        doc.workflow_state = "Ingested"

    classification = classify_notification(doc)
    impact = classification["impact"]

    # Advance to Tagged after classification
    if (doc.get("workflow_state") or "Ingested") == "Ingested":
        frappe.db.set_value(doc.doctype, doc.name, "workflow_state", "Tagged", update_modified=False)
        doc.workflow_state = "Tagged"

    guidance = _add_export_guidance(doc, classification)
    matched = match_subscriptions(classification)

    emails = sorted(
        {
            r.subscriber_email
            for r in matched
            if r.get("subscriber_email") and (r.get("channel") or "email") in ("email", "in_app", "")
        }
    )
    symbol = doc.get("symbol") or doc.name
    _notify_email(
        emails,
        subject=f"TBT alert [{impact.upper()}]: {symbol}",
        message=(
            f"New TBT notification matched your subscription.\n\n"
            f"Symbol: {symbol}\n"
            f"Title: {doc.get('title')}\n"
            f"Country: {doc.get('country')}\n"
            f"Sectors: {', '.join(classification['sectors'])}\n"
            f"Impact: {impact}\n"
            f"Source: {doc.get('source_url') or 'n/a'}\n"
        ),
    )

    publish_feed(
        event="R-T1",
        subject=f"TBT ingested: {symbol}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=(
            f"impact={impact}; subscribers={len(matched)}; "
            f"guidance={guidance}; sectors={','.join(classification['sectors'])}"
        ),
        status="INGESTED",
    )

    frappe.db.set_value(doc.doctype, doc.name, "workflow_state", "Notified", update_modified=False)
    doc.workflow_state = "Notified"

    _mark_fired(
        doc.doctype,
        doc.name,
        "R-T1",
        f"impact={impact}; matched={len(matched)}; guidance={guidance}",
    )
    if getattr(doc, "flags", None) is not None:
        doc.flags.rt1_done = True

    # High impact cascades to R-T2
    if impact == "high":
        rt2_high_impact_alert(doc, method, classification=classification)

    return {
        "impact": impact,
        "matched": len(matched),
        "guidance": guidance,
        "subscribers": emails,
    }


def rt1_on_update(doc, method: str | None = None) -> None:
    """Re-fire R-T1 when classification fields change before Notified completes."""
    if _already_fired(doc.doctype, doc.name, "R-T1"):
        # Still allow R-T2 if impact newly becomes high
        if doc.has_value_changed("sectors") or doc.has_value_changed("symbol"):
            classification = classify_notification(doc)
            if classification["impact"] == "high":
                rt2_high_impact_alert(doc, method, classification=classification)
        return
    rt1_notification_ingested(doc, method)


# ---------------------------------------------------------------------------
# R-T2 — High impact → staff + certified companies (feed, email, wa)
# ---------------------------------------------------------------------------


def _affected_certified_companies(sectors: list[str]) -> list[dict[str, Any]]:
    """Active Certificates whose scope/scheme overlaps notification sectors."""
    if not frappe.db.exists("DocType", "Certificate"):
        return []
    sectors_l = {s.lower() for s in sectors}
    if not sectors_l:
        return []
    rows = frappe.get_all(
        "Certificate",
        filters={"status": "Active", "docstatus": ("<", 2)},
        fields=["name", "certificate_number", "holder_name", "application", "scheme", "scope_summary"],
        limit_page_length=200,
    )
    affected: list[dict[str, Any]] = []
    for row in rows:
        hay = " ".join(
            [
                row.scope_summary or "",
                row.scheme or "",
                row.holder_name or "",
            ]
        ).lower()
        if any(s in hay for s in sectors_l):
            email = None
            if row.application and frappe.db.exists("DocType", "Certification Application"):
                email = frappe.db.get_value(
                    "Certification Application", row.application, "contact_email"
                )
            affected.append({**row, "contact_email": email})
    return affected


def _staff_emails() -> list[str]:
    emails: list[str] = []
    for role in _STAFF_ROLES:
        try:
            users = frappe.get_all(
                "Has Role",
                filters={"role": role, "parenttype": "User"},
                fields=["parent"],
                limit_page_length=50,
            )
            for u in users:
                email = frappe.db.get_value("User", u.parent, "email")
                if email and email not in ("Administrator", "Guest"):
                    emails.append(email)
        except Exception:
            pass
    # Stable fallback for smoke / empty role pools
    if not emails:
        emails.append("tbt-officer@eswasa.org.sz")
    return sorted(set(emails))


def rt2_high_impact_alert(
    doc,
    method: str | None = None,
    *,
    classification: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """R-T2: High impact → staff + affected certified companies via feed/email/wa."""
    if _already_fired(doc.doctype, doc.name, "R-T2"):
        return {"skipped": True}

    classification = classification or classify_notification(doc)
    if classification.get("impact") != "high":
        return {"skipped": True, "reason": "not_high"}

    symbol = doc.get("symbol") or doc.name
    sectors = classification.get("sectors") or []
    staff = _staff_emails()
    companies = _affected_certified_companies(sectors)
    company_emails = sorted(
        {c["contact_email"] for c in companies if c.get("contact_email")}
    )

    for role in _STAFF_ROLES:
        _assign_role_todo(
            doctype=doc.doctype,
            name=doc.name,
            role=role,
            description=f"R-T2 HIGH impact TBT {symbol}, sectors: {', '.join(sectors)}",
            priority="High",
        )

    msg = (
        f"HIGH impact TBT notification {symbol}: {doc.get('title')}.\n"
        f"Sectors: {', '.join(sectors)}. Country: {doc.get('country')}.\n"
        f"Review export implications and notify affected clients.\n"
    )
    _notify_email(
        staff + company_emails,
        subject=f"HIGH impact TBT: {symbol}",
        message=msg,
    )
    _notify_wa(
        doctype=doc.doctype,
        name=doc.name,
        recipients=staff + company_emails,
        subject=f"HIGH impact TBT: {symbol}",
        message=msg,
    )
    publish_feed(
        event="R-T2",
        subject=f"HIGH impact TBT: {symbol}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=(
            f"staff={len(staff)}; companies={len(companies)}; "
            f"sectors={','.join(sectors)}"
        ),
        status="HIGH_IMPACT",
    )
    _mark_fired(
        doc.doctype,
        doc.name,
        "R-T2",
        f"companies={len(companies)}; staff={len(staff)}",
    )
    return {"staff": len(staff), "companies": len(companies)}
