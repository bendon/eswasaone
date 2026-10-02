#!/usr/bin/env python3
"""Load Atlas Engine fixtures into the Frappe site (idempotent).

Run via bench env:
  cd engine/frappe-bench && ./env/bin/python ../fixtures/load_fixtures.py --site eswasaone.localhost
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent


def _ensure_frappe(bench: Path, site: str):
    # Use bench virtualenv's site-packages (frappe already installed editable)
    env_lib = list((bench / "env" / "lib").glob("python*/site-packages"))
    for p in env_lib:
        sys.path.insert(0, str(p))
    # Apps on path
    apps = bench / "apps"
    if apps.exists():
        for child in apps.iterdir():
            if child.is_dir() or child.is_symlink():
                sys.path.insert(0, str(child))
    # Frappe expects cwd = sites/ so logs land under sites/<site>/logs
    sites = bench / "sites"
    os.chdir(sites)
    import frappe  # noqa: WPS433

    frappe.init(site=site)
    frappe.connect()
    return frappe


def upsert_doc(doctype: str, data: dict) -> str:
    import frappe

    data = dict(data)
    data["doctype"] = doctype
    name = data.get("name")
    if doctype == "Role":
        name = data.get("role_name")
        data["name"] = name
    if doctype == "Currency":
        name = data.get("name")
    if doctype == "Print Format":
        name = data.get("name")

    if name and frappe.db.exists(doctype, name):
        # Prefer set_value for Currency to avoid ERPNext side-effects / rollbacks.
        if doctype == "Currency":
            for k, v in data.items():
                if k in ("doctype", "name"):
                    continue
                frappe.db.set_value(doctype, name, k, v, update_modified=False)
            return f"updated:{doctype}:{name}"
        doc = frappe.get_doc(doctype, name)
        for k, v in data.items():
            if k not in ("doctype", "name"):
                doc.set(k, v)
        doc.save(ignore_permissions=True)
        return f"updated:{doctype}:{doc.name}"

    doc = frappe.get_doc(data)
    doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
    return f"inserted:{doctype}:{doc.name}"


def upsert_note(path: Path) -> None:
    import frappe

    data = json.loads(path.read_text())
    title = data["title"]
    existing = frappe.db.get_value("Note", {"title": title}, "name")
    if existing:
        doc = frappe.get_doc("Note", existing)
        doc.content = data["content"]
        doc.public = data.get("public", 1)
        doc.notify_on_login = data.get("notify_on_login", 0)
        doc.save(ignore_permissions=True)
        print(f"updated:Note:{existing}")
    else:
        print(upsert_doc("Note", data))


def load_currency() -> None:
    data = json.loads((FIXTURES / "currency_szl.json").read_text())
    print(upsert_doc("Currency", data))


def load_company() -> None:
    """Ensure Eswasa Company exists with SZL (idempotent).

    Country master uses Frappe name ``Swaziland`` (maps to Eswatini).
    """
    import frappe

    if not frappe.db.exists("DocType", "Company"):
        print("skip:Company (ERPNext not installed)")
        return

    data = json.loads((FIXTURES / "company.json").read_text())
    if not frappe.db.exists("Currency", "SZL"):
        load_currency()

    name = data.get("company_name") or data.get("name")
    if name and frappe.db.exists("Company", name):
        doc = frappe.get_doc("Company", name)
        changed = False
        if data.get("default_currency") and doc.default_currency != data["default_currency"]:
            frappe.db.set_value("Company", name, "default_currency", data["default_currency"])
            changed = True
        if data.get("country") and doc.country != data["country"]:
            frappe.db.set_value("Company", name, "country", data["country"])
            changed = True
        print(f"{'updated' if changed else 'exists'}:Company:{name}")
        return

    # Prefer creating missing Warehouse Types ERPNext may expect on first Company.
    for wt in ("Transit", "Stores", "Work In Progress", "Finished Goods"):
        if frappe.db.exists("DocType", "Warehouse Type") and not frappe.db.exists(
            "Warehouse Type", wt
        ):
            frappe.get_doc(
                {"doctype": "Warehouse Type", "name": wt, "warehouse_type": wt}
            ).insert(ignore_permissions=True)

    doc = frappe.get_doc(
        {
            "doctype": "Company",
            "company_name": data["company_name"],
            "abbr": data["abbr"],
            "default_currency": data["default_currency"],
            "country": data["country"],
        }
    )
    doc.insert(ignore_permissions=True)
    print(f"inserted:Company:{doc.name}")


def load_roles() -> None:
    for row in json.loads((FIXTURES / "roles.json").read_text()):
        print(upsert_doc("Role", row))


def load_role_profiles() -> None:
    """Job packages — Citizen/Business thin; Institution directorates."""
    import frappe

    if not frappe.db.exists("DocType", "Role Profile"):
        print("skip:Role Profile (DocType missing)")
        return
    for row in json.loads((FIXTURES / "role_profiles.json").read_text()):
        name = row.get("name") or row.get("role_profile")
        data = {
            "doctype": "Role Profile",
            "name": name,
            "role_profile": row.get("role_profile") or name,
            "roles": row.get("roles") or [],
        }
        print(upsert_doc("Role Profile", data))


def load_vat_notes() -> None:
    upsert_note(FIXTURES / "vat_notes.json")


def load_email_domain_stub() -> None:
    """Document SMTP setup; live Email Account comes from configure_smtp.py."""
    upsert_note(FIXTURES / "email_domain_stub.json")
    print("hint: run configure_smtp.py when SMTP_* is set")


def load_cost_centres() -> None:
    import frappe

    rows = json.loads((FIXTURES / "cost_centres.json").read_text())
    if not frappe.db.exists("DocType", "Cost Center"):
        print("skip:Cost Center (ERPNext not installed)")
        return
    if not frappe.get_all("Company", pluck="name"):
        load_company()
    companies = frappe.get_all("Company", pluck="name")
    if not companies:
        print("warn:Cost Center: no Company after ensure")
        return

    company = companies[0]
    parent = frappe.db.get_value("Cost Center", {"company": company, "is_group": 1}, "name")
    abbr = frappe.db.get_value("Company", company, "abbr")
    for row in rows:
        cc_name = row["cost_center_name"]
        full = f"{cc_name} - {abbr}"
        if frappe.db.exists("Cost Center", full):
            print(f"exists:Cost Center:{full}")
            continue
        doc = frappe.get_doc(
            {
                "doctype": "Cost Center",
                "cost_center_name": cc_name,
                "company": company,
                "parent_cost_center": parent,
                "is_group": 0,
            }
        )
        try:
            doc.insert(ignore_permissions=True)
            print(f"inserted:Cost Center:{doc.name}")
        except Exception as exc:  # noqa: BLE001
            print(f"warn:Cost Center:{cc_name}:{exc}")


def load_print_formats() -> None:
    import frappe

    for row in json.loads((FIXTURES / "print_formats.json").read_text()):
        if not frappe.db.exists("DocType", row["doc_type"]):
            print(f"skip:Print Format:{row['name']} (missing {row['doc_type']})")
            continue
        print(upsert_doc("Print Format", row))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--bench",
        default=os.environ.get("BENCH_DIR", str(FIXTURES.parent / "frappe-bench")),
    )
    parser.add_argument("--site", default=os.environ.get("FRAPPE_SITE", "eswasaone.localhost"))
    args = parser.parse_args()

    bench = Path(args.bench).resolve()
    if not (bench / "sites").exists():
        print(f"ERROR: bench not found at {bench}", file=sys.stderr)
        sys.exit(1)

    frappe = _ensure_frappe(bench, args.site)
    try:
        # Avoid enqueue / cache chatter when Redis is under pressure
        frappe.flags.in_install = True
        frappe.flags.mute_emails = True
        load_currency()
        load_company()
        load_roles()
        load_role_profiles()
        load_vat_notes()
        load_email_domain_stub()
        load_cost_centres()
        load_print_formats()
        frappe.db.commit()
        print("==> Fixtures loaded OK")
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
