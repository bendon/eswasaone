# Copyright (c) 2025, ESWASA
# License: MIT
"""EswasaOne custom Logout page.

Shadows frappe's www/logout. Calls the stable ``POST /api/method/logout``
endpoint from the client, then shows a branded "signed out" state with a
link back to login.
"""
import frappe
from frappe import _
from frappe.core.doctype.navbar_settings.navbar_settings import get_app_logo

no_cache = 1


def get_context(context):
    context.no_header = True
    context.no_breadcrumbs = True
    context.title = _("Signed Out")
    context.logo = get_app_logo()
    context.eswasa_css = "/assets/eswasa_certification/css/eswasa-auth.css"
    context.eswasa_logo = "/assets/eswasa_certification/images/eswasa-lockup.png"
    context.csrf_token = frappe.sessions.get_csrf_token()
    return context