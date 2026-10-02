#!/usr/bin/env python3
"""Run from frappe-bench/sites with bench env python."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import frappe

FIXTURES = Path("/srv/projects/eswasaone/engine/fixtures")


def upsert(doctype: str, data: dict) -> None:
    data = dict(data)
    data["doctype"] = doctype
    name = data.get("name")
    if doctype == "Role":
        name = data["role_name"]
        data["name"] = name
    if name and frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        for k, v in data.items():
            if k not in ("doctype", "name"):
                doc.set(k, v)
        doc.save(ignore_permissions=True)
        print(f"updated:{doctype}:{doc.name}")
        return
    doc = frappe.get_doc(data)
    doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
    print(f"inserted:{doctype}:{doc.name}")


def upsert_note(path: Path) -> None:
    note = json.loads(path.read_text())
    existing = frappe.db.get_value("Note", {"title": note["title"]}, "name")
    if existing:
        doc = frappe.get_doc("Note", existing)
        doc.content = note["content"]
        doc.public = note.get("public", 1)
        doc.notify_on_login = note.get("notify_on_login", 0)
        doc.save(ignore_permissions=True)
        print(f"updated:Note:{existing}")
    else:
        upsert("Note", note)


def ensure_company() -> str:
    company_data = json.loads((FIXTURES / "company.json").read_text())
    name = company_data["company_name"]
    if frappe.db.exists("Company", name):
        doc = frappe.get_doc("Company", name)
        changed = False
        if doc.default_currency != company_data["default_currency"]:
            doc.default_currency = company_data["default_currency"]
            changed = True
        if doc.country != company_data["country"]:
            doc.country = company_data["country"]
            changed = True
        if changed:
            doc.save(ignore_permissions=True)
            print(f"updated:Company:{name}")
        else:
            print(f"exists:Company:{name}")
        return name

    for wt in ("Transit", "Stores", "Work In Progress", "Finished Goods"):
        if not frappe.db.exists("Warehouse Type", wt):
            frappe.get_doc(
                {"doctype": "Warehouse Type", "name": wt, "warehouse_type": wt}
            ).insert(ignore_permissions=True)
    company = frappe.get_doc(
        {
            "doctype": "Company",
            "company_name": company_data["company_name"],
            "abbr": company_data["abbr"],
            "default_currency": company_data["default_currency"],
            "country": company_data["country"],
        }
    )
    company.insert(ignore_permissions=True)
    print(f"inserted:Company:{company.name}")
    return company.name


def main() -> None:
    site = os.environ.get("FRAPPE_SITE", "eswasaone.localhost")
    frappe.init(site=site)
    frappe.connect()
    try:
        upsert("Currency", json.loads((FIXTURES / "currency_szl.json").read_text()))
        for row in json.loads((FIXTURES / "roles.json").read_text()):
            upsert("Role", row)

        upsert_note(FIXTURES / "vat_notes.json")
        upsert_note(FIXTURES / "email_domain_stub.json")

        company_name = ensure_company()
        parent = frappe.db.get_value(
            "Cost Center", {"company": company_name, "is_group": 1}, "name"
        )
        abbr = frappe.db.get_value("Company", company_name, "abbr")
        for row in json.loads((FIXTURES / "cost_centres.json").read_text()):
            full = f"{row['cost_center_name']} - {abbr}"
            if frappe.db.exists("Cost Center", full):
                print(f"exists:Cost Center:{full}")
                continue
            try:
                doc = frappe.get_doc(
                    {
                        "doctype": "Cost Center",
                        "cost_center_name": row["cost_center_name"],
                        "company": company_name,
                        "parent_cost_center": parent,
                        "is_group": 0,
                    }
                )
                doc.insert(ignore_permissions=True)
                print(f"inserted:Cost Center:{doc.name}")
            except Exception as exc:  # noqa: BLE001
                print(f"warn:Cost Center:{exc}")

        for row in json.loads((FIXTURES / "print_formats.json").read_text()):
            if not frappe.db.exists("DocType", row["doc_type"]):
                print(f"skip:Print Format:{row['name']}")
                continue
            upsert("Print Format", row)

        frappe.db.commit()
        print("FIXTURES_OK")
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
