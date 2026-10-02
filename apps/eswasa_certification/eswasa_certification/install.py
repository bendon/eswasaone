"""Install / migrate hooks: fixtures are synced by bench; seed demo data here."""

from __future__ import annotations

import frappe

from eswasa_certification.seed import ensure_demo_data

APP_LOGO = "/assets/eswasa_certification/images/eswasa-lockup.png"
FAVICON = "/assets/eswasa_certification/images/favicon.ico"


def ensure_website_branding() -> None:
    """Keep Set Password / Login chrome on EswasaOne assets (idempotent)."""
    if frappe.db.exists("DocType", "Website Settings"):
        frappe.db.set_single_value("Website Settings", "app_name", "EswasaOne")
        frappe.db.set_single_value("Website Settings", "app_logo", APP_LOGO)
        frappe.db.set_single_value("Website Settings", "favicon", FAVICON)
    if frappe.db.exists("DocType", "Navbar Settings"):
        frappe.db.set_single_value("Navbar Settings", "app_logo", APP_LOGO)


def after_install() -> None:
    try:
        from eswasa_certification.rules import _ensure_selling_masters

        _ensure_selling_masters()
    except Exception:
        frappe.log_error(title="eswasa_certification selling masters bootstrap failed")
    try:
        ensure_website_branding()
    except Exception:
        frappe.log_error(title="eswasa_certification website branding bootstrap failed")
    ensure_demo_data()


def after_migrate() -> None:
    # Re-seed idempotently so Ask-box demos keep an overdue audit.
    # Honour site_config / env skip so A10 DemoSeed can take over cleanly.
    try:
        from eswasa_certification.rules import _ensure_selling_masters

        _ensure_selling_masters()
    except Exception:
        frappe.log_error(title="eswasa_certification selling masters bootstrap failed")
    try:
        ensure_website_branding()
        frappe.db.commit()
    except Exception:
        frappe.log_error(title="eswasa_certification website branding migrate failed")
    try:
        ensure_demo_data()
    except Exception:
        frappe.log_error(title="eswasa_certification after_migrate seed failed")
