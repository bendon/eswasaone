"""Bootstrap minimal ERPNext selling masters for R-C3 invoice path."""

from __future__ import annotations

import traceback

import frappe


def ensure_selling_masters() -> dict:
    created: list[str] = []

    def _ins(doctype: str, name_field: str, name: str, extra: dict | None = None) -> None:
        if frappe.db.exists(doctype, name):
            return
        payload = {"doctype": doctype, name_field: name}
        if extra:
            payload.update(extra)
        frappe.get_doc(payload).insert(ignore_permissions=True)
        created.append(f"{doctype}:{name}")

    if not frappe.db.exists("UOM", "Nos"):
        frappe.get_doc({"doctype": "UOM", "uom_name": "Nos"}).insert(ignore_permissions=True)
        created.append("UOM:Nos")

    if not frappe.db.exists("Item Group", "All Item Groups"):
        frappe.get_doc(
            {
                "doctype": "Item Group",
                "item_group_name": "All Item Groups",
                "is_group": 1,
            }
        ).insert(ignore_permissions=True)
        created.append("Item Group:All Item Groups")

    if not frappe.db.exists("Item Group", "Services"):
        frappe.get_doc(
            {
                "doctype": "Item Group",
                "item_group_name": "Services",
                "parent_item_group": "All Item Groups",
                "is_group": 0,
            }
        ).insert(ignore_permissions=True)
        created.append("Item Group:Services")

    if frappe.db.exists("DocType", "Customer Group") and not frappe.db.exists(
        "Customer Group", "All Customer Groups"
    ):
        frappe.get_doc(
            {
                "doctype": "Customer Group",
                "customer_group_name": "All Customer Groups",
                "is_group": 1,
            }
        ).insert(ignore_permissions=True)
        created.append("Customer Group:All Customer Groups")

    if frappe.db.exists("DocType", "Customer Group") and not frappe.db.exists(
        "Customer Group", "Commercial"
    ):
        frappe.get_doc(
            {
                "doctype": "Customer Group",
                "customer_group_name": "Commercial",
                "parent_customer_group": "All Customer Groups",
                "is_group": 0,
            }
        ).insert(ignore_permissions=True)
        created.append("Customer Group:Commercial")

    if frappe.db.exists("DocType", "Territory") and not frappe.db.exists(
        "Territory", "All Territories"
    ):
        frappe.get_doc(
            {
                "doctype": "Territory",
                "territory_name": "All Territories",
                "is_group": 1,
            }
        ).insert(ignore_permissions=True)
        created.append("Territory:All Territories")

    if frappe.db.exists("DocType", "Territory") and not frappe.db.exists(
        "Territory", "Eswatini"
    ):
        frappe.get_doc(
            {
                "doctype": "Territory",
                "territory_name": "Eswatini",
                "parent_territory": "All Territories",
                "is_group": 0,
            }
        ).insert(ignore_permissions=True)
        created.append("Territory:Eswatini")

    # Cost Center / Income often required on SI items
    company = frappe.db.get_value("Company", {}, "name")
    out = {"created": created, "company": company}

    # Create item
    from eswasa_certification.rules import CERT_FEE_ITEM, _ensure_cert_fee_item

    try:
        out["item"] = _ensure_cert_fee_item()
        out["item_exists"] = bool(frappe.db.exists("Item", CERT_FEE_ITEM))
    except Exception as exc:
        out["item_error"] = str(exc)
        out["item_trace"] = traceback.format_exc()

    # Probe SI
    try:
        cust_name = "ESWASA Cert Fee Customer"
        if not frappe.db.exists("Customer", cust_name):
            frappe.get_doc(
                {
                    "doctype": "Customer",
                    "customer_name": cust_name,
                    "customer_type": "Company",
                    "customer_group": "Commercial"
                    if frappe.db.exists("Customer Group", "Commercial")
                    else None,
                    "territory": "Eswatini"
                    if frappe.db.exists("Territory", "Eswatini")
                    else None,
                }
            ).insert(ignore_permissions=True)
        income = frappe.db.get_value(
            "Account",
            {"company": company, "root_type": "Income", "is_group": 0},
            "name",
        )
        sinv = frappe.get_doc(
            {
                "doctype": "Sales Invoice",
                "company": company,
                "customer": cust_name,
                "currency": frappe.db.get_value("Company", company, "default_currency") or "SZL",
                "posting_date": frappe.utils.nowdate(),
                "due_date": frappe.utils.add_days(frappe.utils.nowdate(), 30),
                "items": [
                    {
                        "item_code": CERT_FEE_ITEM,
                        "qty": 1,
                        "rate": 1,
                        "income_account": income,
                    }
                ],
            }
        )
        sinv.insert(ignore_permissions=True)
        out["sales_invoice"] = sinv.name
    except Exception as exc:
        out["si_error"] = str(exc)
        out["si_trace"] = traceback.format_exc()

    frappe.db.commit()
    return out
