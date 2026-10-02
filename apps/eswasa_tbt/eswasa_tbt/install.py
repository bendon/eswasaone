# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Install / migrate hooks — seed demo TBT rows for Institution badge."""

from __future__ import annotations

import frappe

from eswasa_tbt.seed import ensure_demo_notifications


def after_install() -> None:
    ensure_demo_notifications()


def after_migrate() -> None:
    try:
        ensure_demo_notifications()
    except Exception:
        frappe.log_error(title="eswasa_tbt after_migrate seed failed")
