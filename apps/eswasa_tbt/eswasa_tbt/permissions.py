# Copyright (c) 2026, ESWASA and contributors
# License: MIT

import frappe


def check_app_permission():
	"""Gate Desk Apps screen."""
	if frappe.session.user == "Administrator":
		return True
	roles = set(frappe.get_roles())
	if "System Manager" in roles:
		return True
	return any(r.startswith("Eswasa") for r in roles)
