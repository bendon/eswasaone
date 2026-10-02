# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt
"""Bench-integrated smoke (skipped when frappe is unavailable)."""

from __future__ import annotations

import unittest

try:
    import frappe
    from frappe.tests.utils import FrappeTestCase

    HAS_FRAPPE = True
except Exception:  # pragma: no cover
    HAS_FRAPPE = False
    FrappeTestCase = unittest.TestCase  # type: ignore


@unittest.skipUnless(HAS_FRAPPE, "requires frappe bench")
class TestCertificationSmoke(FrappeTestCase):
    def test_seed_and_list_overdue(self):
        from eswasa_certification.api import list_overdue
        from eswasa_certification.seed import ensure_demo_data

        demo = ensure_demo_data()
        frappe.db.commit()
        result = list_overdue()
        self.assertIn("items", result)
        ids = {row["id"] for row in result["items"]}
        self.assertIn(demo["audit"], ids)

    def test_create_and_advance(self):
        from eswasa_certification.api import advance_state, create_application
        from eswasa_certification.seed import DEMO_SCHEME, ensure_demo_data

        ensure_demo_data()
        app = create_application(
            scheme=DEMO_SCHEME,
            applicant_name="Smoke Test Org",
            contact_email="smoke@example.com",
            confirm=True,
        )
        # Portal display labels (canonical: Application → Assessment)
        self.assertEqual(app["status"], "Submitted")
        advanced = advance_state(
            name=app["id"],
            action="submit_for_assessment",
            comment="smoke",
            confirm=True,
        )
        self.assertEqual(advanced["status"], "In Review")
