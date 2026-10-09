"""One-shot smoke: create Quotation for an Assessment/Quoted application."""

from __future__ import annotations

import traceback

import frappe


def run(app_name: str = "APP-2026-00021") -> None:
    from eswasa_certification.rules import rc_issue_quotation

    doc = frappe.get_doc("Certification Application", app_name)
    print(f"app={doc.name} state={doc.workflow_state} quotation={doc.get('quotation')}")
    try:
        q = rc_issue_quotation(doc)
        print(f"rc_issue_quotation -> {q}")
        doc.reload()
        print(f"linked={doc.get('quotation')}")
        if q and frappe.db.exists("Quotation", q):
            qd = frappe.get_doc("Quotation", q)
            print(f"quot name={qd.name} status={qd.docstatus} total={qd.grand_total} title={qd.title}")
        frappe.db.commit()
    except Exception:
        traceback.print_exc()
        raise


def act_issue(app_name: str = "APP-2026-00007") -> None:
    """Full /act path: Assessment → Quoted + Quotation."""
    from eswasa_certification.workflow_act import act

    before = frappe.db.get_value(
        "Certification Application",
        app_name,
        ["workflow_state", "quotation"],
        as_dict=True,
    )
    print(f"before={before}")
    r = act(
        doctype="Certification Application",
        name=app_name,
        action="issue_quotation",
        expected_state="Assessment",
        confirm=True,
    )
    after = frappe.db.get_value(
        "Certification Application",
        app_name,
        ["workflow_state", "quotation"],
        as_dict=True,
    )
    print(f"result_status={r.get('status') if isinstance(r, dict) else r}")
    print(f"after={after}")
    q = after.get("quotation") if after else None
    if q:
        print(
            "quot",
            frappe.db.get_value(
                "Quotation", q, ["name", "grand_total", "docstatus", "title"], as_dict=True
            ),
        )
    logs = frappe.get_all(
        "Notification Log",
        filters={"document_name": app_name},
        fields=["subject", "email_content", "for_user"],
        order_by="creation desc",
        limit=2,
    )
    print(f"nlogs={logs}")
    # Surface latest quote error if any
    err = frappe.db.sql(
        """
        select creation, left(error, 2000)
        from `tabError Log`
        where method like '%%quote_create_failed%%'
        order by creation desc limit 1
        """
    )
    if err:
        print("last_quote_err", err[0][0])
        print(err[0][1])
    frappe.db.commit()
