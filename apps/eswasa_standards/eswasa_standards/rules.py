"""Standards business rules R-S1…R-S4.

Triggered from hooks.doc_events (R-S1, R-S3, R-S4) and scheduler_events (R-S2).
All side-effects are idempotent. Feed / email stubs mirror eswasa_certification.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import add_days, cint, getdate, now_datetime, nowdate, today

PUBLIC_REVIEW_DAYS = 60
REVIEW_REMINDER_DAYS = 7
FEED_REALTIME_EVENT = "eswasa_feed"
DEFAULT_BUY_BASE = "/estore"
DEFAULT_STANDARD_PRICE_SZL = 450.0


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _log(title: str, detail: str = "") -> None:
    try:
        frappe.logger("eswasa_standards").info(f"{title}: {detail}")
    except Exception:
        pass
    try:
        frappe.log_error(message=detail or title, title=f"[standards] {title}"[:140])
    except Exception:
        pass


def _comment(doctype: str, name: str, content: str, comment_type: str = "Info") -> None:
    """Best-effort Comment (db_insert avoids fragile global on_change hooks)."""
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
    """Feed stub Core / Service Portal can consume: realtime + Notification Log + Comment."""
    payload = {
        "source": "eswasa_standards",
        "event": event,
        "subject": subject,
        "status": status,
        "reference_doctype": reference_doctype,
        "reference_name": reference_name,
        "detail": detail,
        "at": str(now_datetime()),
    }
    try:
        frappe.publish_realtime(FEED_REALTIME_EVENT, payload, after_commit=True)
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
                "priority": "Medium",
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


def _role_emails(role: str) -> list[str]:
    """Emails for users who hold a Desk role (subscriber / officer pool)."""
    try:
        users = frappe.get_all(
            "Has Role",
            filters={"role": role, "parenttype": "User"},
            pluck="parent",
        )
    except Exception:
        return []
    emails: list[str] = []
    for user in users:
        if user in ("Administrator", "Guest"):
            continue
        email = frappe.db.get_value("User", user, "email")
        if email and "@" in email:
            emails.append(email)
    return emails


def _tc_member_emails(technical_committee: str | None) -> list[str]:
    if not technical_committee or not frappe.db.exists(
        "Technical Committee", technical_committee
    ):
        return []
    emails: list[str] = []
    try:
        tc = frappe.get_doc("Technical Committee", technical_committee)
        for row in tc.get("members") or []:
            email = row.get("email")
            if not email and row.get("member_user"):
                email = frappe.db.get_value("User", row.member_user, "email")
            if email and "@" in email:
                emails.append(email)
        if tc.get("secretary"):
            sec = frappe.db.get_value("User", tc.secretary, "email")
            if sec and "@" in sec:
                emails.append(sec)
    except Exception:
        _log("tc_member_emails_failed", technical_committee or "")
    return emails


def _subscriber_emails(technical_committee: str | None = None) -> list[str]:
    """TC + Standards Officer/Manager pools (service-portal subscribers stub)."""
    emails = _tc_member_emails(technical_committee)
    emails.extend(_role_emails("Eswasa Standards Officer"))
    emails.extend(_role_emails("Eswasa Standards Manager"))
    emails.extend(_role_emails("Eswasa TC Member"))
    # de-dupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for e in emails:
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out


def _buy_url(code: str, stored: str | None = None) -> str:
    if stored:
        return stored
    slug = (code or "").replace(" ", "-").replace(":", "-")
    return f"{DEFAULT_BUY_BASE}/{slug}"


# ---------------------------------------------------------------------------
# R-S1 — Work Item → Public Review
# ---------------------------------------------------------------------------


def rs1_public_review_opened(doc, method: str | None = None) -> None:
    """Work Item enters Public Review → notice, 60d window, notify TC + subscribers."""
    if doc.get("workflow_state") != "Public Review":
        return
    if getattr(doc, "flags", None) and doc.flags.get("rs1_done"):
        return

    # Only when newly entering Public Review (or window not yet opened)
    prior_state = None
    if not doc.is_new() and hasattr(doc, "has_value_changed") and doc.has_value_changed(
        "workflow_state"
    ):
        prior = doc.get_doc_before_save()
        prior_state = prior.workflow_state if prior else None
    elif not doc.is_new():
        # hooks on_update after save — detect via missing open date
        prior_state = None if not doc.get("review_opened_on") else "Public Review"

    if prior_state == "Public Review" and doc.get("review_opened_on"):
        return

    opened = getdate(doc.get("review_opened_on") or nowdate())
    closes = getdate(doc.get("review_closes_on") or add_days(opened, PUBLIC_REVIEW_DAYS))

    updates: dict[str, Any] = {
        "review_opened_on": opened,
        "review_closes_on": closes,
        "review_reminder_sent": 0,
        "comments_compiled": 0,
    }
    frappe.db.set_value(doc.doctype, doc.name, updates, update_modified=False)
    for key, val in updates.items():
        if hasattr(doc, key):
            doc.set(key, val)

    # Align current draft stage
    draft_name = doc.get("current_draft")
    if draft_name and frappe.db.exists("Draft", draft_name):
        frappe.db.set_value(
            "Draft", draft_name, "stage", "Public Review", update_modified=False
        )
    elif not draft_name:
        # Prefer latest draft for this work item
        draft_name = frappe.db.get_value(
            "Draft", {"work_item": doc.name}, "name", order_by="modified desc"
        )
        if draft_name:
            frappe.db.set_value(
                doc.doctype, doc.name, "current_draft", draft_name, update_modified=False
            )
            frappe.db.set_value(
                "Draft", draft_name, "stage", "Public Review", update_modified=False
            )

    recipients = _subscriber_emails(doc.get("technical_committee"))
    _notify_email(
        recipients,
        subject=f"Public Review open: {doc.name}",
        message=(
            f"Work Item {doc.name}: {doc.title}\n\n"
            f"Public review is open until {closes} ({PUBLIC_REVIEW_DAYS} days).\n"
            f"Submit comments via the Service Portal / Public Comment.\n"
        ),
    )
    _assign_role_todo(
        doctype=doc.doctype,
        name=doc.name,
        role="Eswasa Standards Officer",
        description=f"R-S1: Monitor public review for {doc.name} (closes {closes})",
    )
    publish_feed(
        event="R-S1",
        subject=f"Public Review open: {doc.name}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=f"closes={closes}; draft={draft_name}",
        status="PUBLIC_REVIEW",
    )
    _comment(
        doc.doctype,
        doc.name,
        f"[R-S1] Public Review opened {opened}, closes {closes} (Service Portal notice).",
    )
    if getattr(doc, "flags", None) is not None:
        doc.flags.rs1_done = True


# ---------------------------------------------------------------------------
# R-S2 — cron: review closing ≤7d reminder; on close → compile + Ballot
# ---------------------------------------------------------------------------


def _compile_public_comments(work_item: str, draft: str | None) -> int:
    """Summarise Public Comments for the draft into a Comment on the Work Item."""
    if not draft:
        return 0
    rows = frappe.get_all(
        "Public Comment",
        filters={"draft": draft},
        fields=["name", "commenter_name", "organisation", "status", "comment_text"],
        order_by="creation asc",
    )
    lines = [
        f"- {r.name}: {r.commenter_name}"
        + (f" ({r.organisation})" if r.organisation else "")
        + f" [{r.status or 'Received'}]"
        for r in rows
    ]
    body = (
        f"[R-S2] Compiled {len(rows)} public comment(s) for draft {draft}:\n"
        + ("\n".join(lines) if lines else "(none received)")
    )
    _comment("Work Item", work_item, body)
    if draft and frappe.db.exists("Draft", draft):
        _comment("Draft", draft, body)
    return len(rows)


def _ensure_ballot(work_item: str, draft: str | None) -> str | None:
    """Create a Pending Ballot for the work item if none open."""
    existing = frappe.db.get_value(
        "Ballot",
        {"work_item": work_item, "outcome": ("in", ["Pending", ""])},
        "name",
    )
    if existing:
        return existing
    if not draft:
        draft = frappe.db.get_value(
            "Draft", {"work_item": work_item}, "name", order_by="modified desc"
        )
    if not draft:
        _log("rs2_no_draft_for_ballot", work_item)
        return None
    code = f"BAL-{work_item}"
    if frappe.db.exists("Ballot", code):
        code = f"BAL-{work_item}-{frappe.generate_hash(length=4).upper()}"
    try:
        ballot = frappe.get_doc(
            {
                "doctype": "Ballot",
                "ballot_code": code,
                "work_item": work_item,
                "draft": draft,
                "opened_on": nowdate(),
                "closes_on": add_days(nowdate(), 30),
                "outcome": "Pending",
                "votes_for": 0,
                "votes_against": 0,
                "votes_abstain": 0,
            }
        )
        ballot.insert(ignore_permissions=True)
        return ballot.name
    except Exception as exc:
        _log("rs2_ballot_create_failed", f"{work_item}: {exc}")
        return None


def rs2_review_closing_sweep() -> dict[str, int]:
    """Daily: ≤7d reminder; on/after close → compile comments + advance to Ballot."""
    today_d = getdate(today())
    horizon = add_days(today_d, REVIEW_REMINDER_DAYS)
    reminded = 0
    closed = 0

    open_reviews = frappe.get_all(
        "Work Item",
        filters={"workflow_state": "Public Review"},
        fields=[
            "name",
            "title",
            "technical_committee",
            "current_draft",
            "review_closes_on",
            "review_reminder_sent",
            "comments_compiled",
        ],
    )
    for row in open_reviews:
        if not row.review_closes_on:
            continue
        closes = getdate(row.review_closes_on)

        # Reminder window
        if (
            not cint(row.review_reminder_sent)
            and today_d <= closes <= horizon
            and closes >= today_d
        ):
            recipients = _subscriber_emails(row.technical_committee)
            _notify_email(
                recipients,
                subject=f"Public Review closing soon: {row.name}",
                message=(
                    f"Work Item {row.name}: {row.title}\n\n"
                    f"Public review closes on {closes}. Please submit remaining comments.\n"
                ),
            )
            publish_feed(
                event="R-S2",
                subject=f"Review closing ≤{REVIEW_REMINDER_DAYS}d: {row.name}",
                reference_doctype="Work Item",
                reference_name=row.name,
                detail=f"closes={closes}",
                status="REVIEW_REMINDER",
            )
            frappe.db.set_value(
                "Work Item",
                row.name,
                "review_reminder_sent",
                1,
                update_modified=False,
            )
            reminded += 1

        # Close → compile + Ballot
        if closes <= today_d:
            draft = row.current_draft
            if not cint(row.comments_compiled):
                _compile_public_comments(row.name, draft)
                frappe.db.set_value(
                    "Work Item",
                    row.name,
                    "comments_compiled",
                    1,
                    update_modified=False,
                )
            ballot_name = _ensure_ballot(row.name, draft)
            if draft and frappe.db.exists("Draft", draft):
                frappe.db.set_value(
                    "Draft", draft, "stage", "Ballot", update_modified=False
                )
            frappe.db.set_value(
                "Work Item",
                row.name,
                "workflow_state",
                "Ballot",
                update_modified=True,
            )
            recipients = _subscriber_emails(row.technical_committee)
            _notify_email(
                recipients,
                subject=f"Public Review closed → Ballot: {row.name}",
                message=(
                    f"Work Item {row.name} public review closed on {closes}. "
                    f"Comments compiled. Ballot {ballot_name or '(pending)'} opened.\n"
                ),
            )
            _assign_role_todo(
                doctype="Work Item",
                name=row.name,
                role="Eswasa Standards Manager",
                description=f"R-S2: Ballot {ballot_name or 'open'} for {row.name}",
            )
            publish_feed(
                event="R-S2",
                subject=f"Review closed → Ballot: {row.name}",
                reference_doctype="Work Item",
                reference_name=row.name,
                detail=f"ballot={ballot_name}",
                status="BALLOT",
            )
            closed += 1

    return {"reminded": reminded, "closed": closed}


# ---------------------------------------------------------------------------
# R-S3 — Ballot passed → Gazette + catalogue + e-store + PUBLISHED
# ---------------------------------------------------------------------------


def _ensure_catalogue_standard(
    *,
    code: str,
    title: str,
    sector: str | None,
    work_item: str | None,
    gazette_notice: str | None,
) -> str:
    """Create or refresh Standard catalogue row (Published/Gazetted)."""
    buy = _buy_url(code)
    if frappe.db.exists("Standard", code):
        frappe.db.set_value(
            "Standard",
            code,
            {
                "title": title,
                "sector": sector,
                "status": "Gazetted",
                "published_on": nowdate(),
                "buy_url": buy,
                "gazette_notice": gazette_notice,
            },
            update_modified=True,
        )
        return code
    std = frappe.get_doc(
        {
            "doctype": "Standard",
            "code": code,
            "title": title,
            "sector": sector,
            "status": "Gazetted",
            "version": code.split(":")[-1] if ":" in code else "1",
            "abstract": (
                f"<p>Catalogue abstract for {code}. "
                "Licensed full text available via e-store.</p>"
            ),
            "buy_url": buy,
            "published_on": nowdate(),
            "gazette_notice": gazette_notice,
        }
    )
    std.insert(ignore_permissions=True)
    if work_item and frappe.db.exists("Work Item", work_item):
        frappe.db.set_value(
            "Work Item", work_item, "linked_standard", std.name, update_modified=False
        )
    return std.name


def _ensure_gazette_notice(
    *,
    standard: str,
    work_item: str | None,
    title: str,
) -> str:
    notice_number = f"GN-{standard}".replace(" ", "-")[:140]
    if frappe.db.exists("Gazette Notice", notice_number):
        frappe.db.set_value(
            "Gazette Notice",
            notice_number,
            {
                "standard": standard,
                "work_item": work_item,
                "gazette_date": nowdate(),
                "title": title,
            },
            update_modified=False,
        )
        return notice_number
    # Collision-safe fallback
    if frappe.db.exists("Gazette Notice", {"standard": standard}):
        return frappe.db.get_value("Gazette Notice", {"standard": standard}, "name")
    gn = frappe.get_doc(
        {
            "doctype": "Gazette Notice",
            "notice_number": notice_number,
            "title": title,
            "standard": standard,
            "work_item": work_item,
            "gazette_date": nowdate(),
            "notes": "R-S3: auto-created on ballot pass / publish.",
        }
    )
    gn.insert(ignore_permissions=True)
    return gn.name


def _ensure_standard_product(code: str, title: str, sector: str | None) -> str | None:
    """Publish Standard Product in eswasa_estore when DocType exists."""
    if not frappe.db.exists("DocType", "Standard Product"):
        # TODO: wire real — Standard Product lives in eswasa_estore; install/migrate that app.
        _log("rs3_standard_product_missing", "DocType Standard Product not installed")
        return None
    try:
        if frappe.db.exists("Standard Product", code):
            frappe.db.set_value(
                "Standard Product",
                code,
                {
                    "title": title,
                    "sector": sector,
                    "is_published": 1,
                    "price_szl": frappe.db.get_value("Standard Product", code, "price_szl")
                    or DEFAULT_STANDARD_PRICE_SZL,
                },
                update_modified=False,
            )
            return code
        prod = frappe.get_doc(
            {
                "doctype": "Standard Product",
                "standard_code": code,
                "title": title,
                "sector": sector,
                "price_szl": DEFAULT_STANDARD_PRICE_SZL,
                "rights": "licensed",
                "is_published": 1,
                "description": (
                    f"<p>E-store listing for {code}. "
                    "Purchase grants licensed download entitlement.</p>"
                ),
            }
        )
        prod.insert(ignore_permissions=True)
        return prod.name
    except Exception as exc:
        _log("rs3_standard_product_failed", f"{code}: {exc}")
        return None


def _ensure_website_item(code: str, title: str) -> str | None:
    """Create Website Item when ERPNext website DocType is present."""
    if not frappe.db.exists("DocType", "Website Item"):
        # TODO: wire real — Website Item (ERPNext Website) not installed on this site;
        # catalogue + Standard Product cover publish until website module is enabled.
        _comment(
            "Standard",
            code,
            "[R-S3] Website Item DocType missing; skipped (TODO: wire real)",
        )
        return None
    try:
        existing = frappe.db.get_value("Website Item", {"web_item_name": title}, "name")
        if existing:
            return existing
        # Prefer linking an Item if one exists / can be created
        item_code = code.replace(" ", "-")
        if frappe.db.exists("DocType", "Item") and not frappe.db.exists("Item", item_code):
            try:
                item_group = (
                    "Products"
                    if frappe.db.exists("Item Group", "Products")
                    else frappe.db.get_value("Item Group", {}, "name")
                )
                frappe.get_doc(
                    {
                        "doctype": "Item",
                        "item_code": item_code,
                        "item_name": title,
                        "item_group": item_group or "All Item Groups",
                        "stock_uom": "Nos",
                        "is_stock_item": 0,
                        "is_sales_item": 1,
                        "include_item_in_manufacturing": 0,
                    }
                ).insert(ignore_permissions=True)
            except Exception as exc:
                _log("rs3_item_create_failed", f"{item_code}: {exc}")
        wi = frappe.get_doc(
            {
                "doctype": "Website Item",
                "web_item_name": title,
                "item_code": item_code if frappe.db.exists("Item", item_code) else None,
                "published": 1,
                "short_description": f"Published standard {code}",
            }
        )
        wi.insert(ignore_permissions=True)
        return wi.name
    except Exception as exc:
        _log("rs3_website_item_failed", f"{code}: {exc}")
        return None


def rs3_publish_standard(
    *,
    standard_code: str | None = None,
    title: str | None = None,
    sector: str | None = None,
    work_item: str | None = None,
    ballot: str | None = None,
) -> dict[str, Any]:
    """GATE: Gazette Notice + catalogue Standard + e-store artefacts + PUBLISHED feed.

    Safe to call repeatedly; returns produced artefact names.
    """
    if not standard_code:
        if work_item:
            linked = frappe.db.get_value("Work Item", work_item, "linked_standard")
            standard_code = linked or f"SZNS-{work_item}"
        else:
            frappe.throw("standard_code or work_item is required", frappe.ValidationError)

    if not title:
        if work_item:
            title = frappe.db.get_value("Work Item", work_item, "title")
        title = title or standard_code
    if not sector and work_item:
        sector = frappe.db.get_value("Work Item", work_item, "sector")

    # Catalogue first so Gazette Notice Link field validates
    std_name = _ensure_catalogue_standard(
        code=standard_code,
        title=title,
        sector=sector,
        work_item=work_item,
        gazette_notice=None,
    )
    gazette = _ensure_gazette_notice(
        standard=std_name,
        work_item=work_item,
        title=f"Gazette notice: {title}",
    )
    frappe.db.set_value(
        "Standard", std_name, "gazette_notice", gazette, update_modified=False
    )

    product = _ensure_standard_product(std_name, title, sector)
    website_item = _ensure_website_item(std_name, title)

    if work_item and frappe.db.exists("Work Item", work_item):
        frappe.db.set_value(
            "Work Item",
            work_item,
            {
                "workflow_state": "Published/Gazetted",
                "linked_standard": std_name,
            },
            update_modified=True,
        )
        draft = frappe.db.get_value("Work Item", work_item, "current_draft")
        if draft and frappe.db.exists("Draft", draft):
            frappe.db.set_value("Draft", draft, "stage", "Final", update_modified=False)

    if ballot and frappe.db.exists("Ballot", ballot):
        if frappe.db.get_value("Ballot", ballot, "outcome") != "Approved":
            frappe.db.set_value(
                "Ballot", ballot, "outcome", "Approved", update_modified=False
            )

    tc = (
        frappe.db.get_value("Work Item", work_item, "technical_committee")
        if work_item
        else None
    )
    recipients = _subscriber_emails(tc)
    _notify_email(
        recipients,
        subject=f"PUBLISHED: {std_name}",
        message=(
            f"Standard {std_name}: {title}\n\n"
            f"Has been PUBLISHED / gazetted ({gazette}).\n"
            f"Catalogue buy URL: {_buy_url(std_name)}\n"
            f"E-store product: {product or 'pending'}\n"
        ),
    )
    publish_feed(
        event="R-S3",
        subject=f"PUBLISHED: {std_name}",
        reference_doctype="Standard",
        reference_name=std_name,
        detail=(
            f"gazette={gazette}; product={product}; "
            f"website_item={website_item}; work_item={work_item}"
        ),
        status="PUBLISHED",
    )
    _comment(
        "Standard",
        std_name,
        (
            f"[R-S3] PUBLISHED artefacts: gazette={gazette}, "
            f"product={product}, website_item={website_item}"
        ),
    )
    return {
        "standard": std_name,
        "gazette_notice": gazette,
        "standard_product": product,
        "website_item": website_item,
        "work_item": work_item,
        "ballot": ballot,
        "buy_url": _buy_url(std_name),
    }


def rs3_on_ballot_update(doc, method: str | None = None) -> None:
    """Ballot outcome → Approved triggers R-S3 publish gate."""
    if (doc.get("outcome") or "").strip() != "Approved":
        return
    if getattr(doc, "flags", None) and doc.flags.get("rs3_done"):
        return

    changed = True
    if not doc.is_new() and hasattr(doc, "has_value_changed"):
        changed = doc.has_value_changed("outcome")
    # Idempotent: if gazette already exists for linked standard, still refresh feed once
    work_item = doc.get("work_item")
    linked = None
    title = None
    sector = None
    if work_item and frappe.db.exists("Work Item", work_item):
        linked = frappe.db.get_value("Work Item", work_item, "linked_standard")
        title = frappe.db.get_value("Work Item", work_item, "title")
        sector = frappe.db.get_value("Work Item", work_item, "sector")
        ws = frappe.db.get_value("Work Item", work_item, "workflow_state")
        if ws == "Published/Gazetted" and linked and frappe.db.exists(
            "Gazette Notice", {"standard": linked}
        ):
            if not changed:
                return

    # Prefer an existing linked code; otherwise a stable smoke/publish code from WI title
    code = linked
    if not code and work_item:
        # SZNS-style placeholder until Manager assigns a formal designation
        code = f"SZNS {work_item}:2026"
    code = code or doc.name
    rs3_publish_standard(
        standard_code=code,
        title=title,
        sector=sector,
        work_item=work_item,
        ballot=doc.name,
    )
    if getattr(doc, "flags", None) is not None:
        doc.flags.rs3_done = True


def rs3_on_work_item_published(doc, method: str | None = None) -> None:
    """Work Item → Published/Gazetted also runs R-S3 (workflow Publish / Gazette)."""
    if doc.get("workflow_state") != "Published/Gazetted":
        return
    if getattr(doc, "flags", None) and doc.flags.get("rs3_done"):
        return

    prior_state = None
    if not doc.is_new() and hasattr(doc, "has_value_changed") and doc.has_value_changed(
        "workflow_state"
    ):
        prior = doc.get_doc_before_save()
        prior_state = prior.workflow_state if prior else None
    if prior_state == "Published/Gazetted":
        return

    code = doc.get("linked_standard") or f"SZNS-{doc.name}"
    # Prefer Approved ballot if present
    ballot = frappe.db.get_value(
        "Ballot",
        {"work_item": doc.name, "outcome": "Approved"},
        "name",
    ) or frappe.db.get_value("Ballot", {"work_item": doc.name}, "name")

    rs3_publish_standard(
        standard_code=code,
        title=doc.get("title"),
        sector=doc.get("sector"),
        work_item=doc.name,
        ballot=ballot,
    )
    if getattr(doc, "flags", None) is not None:
        doc.flags.rs3_done = True


# ---------------------------------------------------------------------------
# R-S4 — New Standard supersedes prior
# ---------------------------------------------------------------------------


def _cert_holder_emails_for_standard(standard_code: str) -> list[str]:
    """Find contact emails for certs whose scheme.standard_ref matches the code."""
    emails: list[str] = []
    if not frappe.db.exists("DocType", "Certification Scheme"):
        return emails
    schemes = frappe.get_all(
        "Certification Scheme",
        filters={"standard_ref": ("like", f"%{standard_code}%")},
        pluck="name",
    )
    if not schemes:
        # Exact Data match fallback
        schemes = frappe.get_all(
            "Certification Scheme",
            filters={"standard_ref": standard_code},
            pluck="name",
        )
    if not schemes or not frappe.db.exists("DocType", "Certificate"):
        return emails
    certs = frappe.get_all(
        "Certificate",
        filters={"scheme": ("in", schemes), "status": "Active"},
        fields=["name", "application", "holder_name"],
    )
    for cert in certs:
        email = None
        if cert.application and frappe.db.exists(
            "DocType", "Certification Application"
        ):
            email = frappe.db.get_value(
                "Certification Application", cert.application, "contact_email"
            )
        if email:
            emails.append(email)
    return emails


def rs4_standard_supersedes(doc, method: str | None = None) -> None:
    """New Standard supersedes prior → mark superseded; notify cert holders."""
    prior = doc.get("supersedes")
    if not prior:
        return
    if prior == doc.name:
        return
    if getattr(doc, "flags", None) and doc.flags.get("rs4_done"):
        return

    changed = True
    if not doc.is_new() and hasattr(doc, "has_value_changed"):
        changed = doc.has_value_changed("supersedes") or doc.has_value_changed("status")
    if not changed and frappe.db.get_value("Standard", prior, "status") == "Superseded":
        return

    if frappe.db.exists("Standard", prior):
        frappe.db.set_value(
            "Standard", prior, "status", "Superseded", update_modified=True
        )
        _comment(
            "Standard",
            prior,
            f"[R-S4] Superseded by {doc.name} ({doc.code or doc.name}).",
        )

    # Ensure new standard is published-ish
    if doc.get("status") in (None, "", "Draft"):
        frappe.db.set_value(
            doc.doctype, doc.name, "status", "Published", update_modified=False
        )

    holders = _cert_holder_emails_for_standard(prior)
    _notify_email(
        holders,
        subject=f"Standard superseded: {prior} → {doc.name}",
        message=(
            f"Standard {prior} has been superseded by {doc.name}.\n"
            f"Please review your certification scope against the new edition.\n"
        ),
    )
    # Also notify standards officer pool
    _notify_email(
        _role_emails("Eswasa Standards Officer"),
        subject=f"R-S4 supersession: {prior} → {doc.name}",
        message=f"Marked {prior} as Superseded. Notified {len(holders)} cert holder(s).",
    )
    publish_feed(
        event="R-S4",
        subject=f"Superseded: {prior} → {doc.name}",
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        detail=f"prior={prior}; holders_notified={len(holders)}",
        status="SUPERSEDED",
    )
    if getattr(doc, "flags", None) is not None:
        doc.flags.rs4_done = True


def rs1_rs3_on_work_item_update(doc, method: str | None = None) -> None:
    """Dispatch Work Item workflow transitions to R-S1 / R-S3."""
    state = doc.get("workflow_state")
    if state == "Public Review":
        rs1_public_review_opened(doc, method)
    elif state == "Published/Gazetted":
        rs3_on_work_item_published(doc, method)
