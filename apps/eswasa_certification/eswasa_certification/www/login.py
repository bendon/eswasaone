# Copyright (c) 2025, ESWASA
# License: MIT
"""EswasaOne custom Login page.

Shadows frappe's www/login by app-load order. Renders a branded EswasaOne
page and delegates auth to the stable ``POST /api/method/login`` endpoint
from the client.
"""
from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.core.doctype.navbar_settings.navbar_settings import get_app_logo
from frappe.utils import cint

no_cache = 1


def get_context(context):
    # If already logged in, bounce to the right home.
    if frappe.session.user != "Guest":
        redirect_to = _get_redirect_arg() or _safe_default_path()
        if redirect_to and redirect_to != "/login":
            frappe.local.flags.redirect_location = redirect_to
            raise frappe.Redirect

    context.no_header = True
    context.no_breadcrumbs = True
    context.title = _("Sign In")
    context.logo = get_app_logo()
    context.eswasa_css = "/assets/eswasa_certification/css/eswasa-auth.css"
    context.eswasa_logo = "/assets/eswasa_certification/images/eswasa-lockup.png"
    context.app_name = (
        frappe.get_website_settings("app_name")
        or frappe.get_system_settings("app_name")
        or _("EswasaOne")
    )
    context.csrf_token = frappe.sessions.get_csrf_token()
    return context


def _get_redirect_arg() -> str | None:
    """Read the ``redirect-to`` query arg safely (request may be absent)."""
    try:
        req = frappe.local.request
        if req is not None and req.args:
            return req.args.get("redirect-to")
    except Exception:
        pass
    return None


def _safe_default_path() -> str:
    try:
        from frappe.apps import get_default_path

        p = get_default_path()
        if p and _is_same_site(p):
            return p
    except Exception:
        pass
    return "/app"


def _is_same_site(url: str) -> bool:
    """True if url is a relative path or points at the current site host."""
    parsed = urlparse(url)
    if not parsed.netloc:
        return True
    try:
        req = frappe.local.request
        if req is not None:
            return parsed.netloc == urlparse(req.url).netloc
    except Exception:
        pass
    return True