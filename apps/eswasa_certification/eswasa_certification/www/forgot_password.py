# Copyright (c) 2025, ESWASA
# License: MIT
"""EswasaOne custom Forgot Password page.

Renders a branded page that calls the stable Frappe endpoint
``POST /api/method/frappe.core.doctype.user.user.reset_password`` with
``{ user: <email> }``. Per Frappe's anti-enumeration design, the endpoint
always returns the same success message regardless of whether the user
exists.
"""
import frappe
from frappe import _
from frappe.core.doctype.navbar_settings.navbar_settings import get_app_logo

no_cache = 1


def get_context(context):
    context.no_header = True
    context.no_breadcrumbs = True
    context.title = _("Forgot Password")
    context.logo = get_app_logo()
    context.eswasa_css = "/assets/eswasa_certification/css/eswasa-auth.css"
    context.eswasa_logo = "/assets/eswasa_certification/images/eswasa-lockup.png"
    context.csrf_token = frappe.sessions.get_csrf_token()
    return context