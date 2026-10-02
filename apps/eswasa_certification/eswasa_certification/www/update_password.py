# Copyright (c) 2025, ESWASA
# License: MIT
"""EswasaOne custom Set Password page.

Shadows frappe's www/update-password by app-load order (eswasa_certification
loads after frappe in apps.txt). Renders a fully branded EswasaOne page and
delegates the actual password change to the stable Frappe endpoint
``frappe.core.doctype.user.user.update_password`` via fetch from the client.
"""
import frappe
from frappe import _
from frappe.core.doctype.navbar_settings.navbar_settings import get_app_logo

no_cache = 1


def get_context(context):
    context.no_breadcrumbs = True
    context.no_header = True
    context.title = _("Set Password")
    context.logo = get_app_logo()
    # CSS / icon assets served from this app's public dir
    context.eswasa_css = "/assets/eswasa_certification/css/eswasa-auth.css"
    context.eswasa_logo = "/assets/eswasa_certification/images/eswasa-lockup.png"
    context.csrf_token = frappe.sessions.get_csrf_token()
    # A reset key means the user arrived via an email link and has no old
    # password to enter — hide that field server-side so it never flashes.
    req = getattr(frappe, "request", None)
    context.has_key = bool(req and req.args.get("key"))
    return context