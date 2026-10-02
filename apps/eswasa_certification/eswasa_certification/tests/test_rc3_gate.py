# Copyright (c) 2026, ESWASA and contributors
# For license information, please see license.txt
"""R-C3 acceptance gate test (requires frappe bench + ERPNext + verification)."""

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
class TestRC3Gate(FrappeTestCase):
    def test_certificate_submit_produces_artefacts(self):
        from eswasa_certification.smoke_rc3 import run

        result = run()
        self.assertEqual(result["R-C3"], "PASS")
        self.assertTrue(result["checks"]["has_invoice"])
        self.assertTrue(result["checks"]["has_register"])
        self.assertTrue(result["checks"]["has_token"])
        self.assertTrue(result["checks"]["has_feed_comment"])
