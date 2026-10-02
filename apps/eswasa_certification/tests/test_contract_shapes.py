"""Contract-shape + workflow smoke tests (no Frappe/bench required)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

# Allow importing the package without install
ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "eswasa_certification"
sys.path.insert(0, str(ROOT))

from eswasa_certification.workflow_map import (  # noqa: E402
    display_status,
    next_state,
    resolve_workflow_state,
    serialize_application,
    serialize_audit_summary,
)


class WorkflowMapTests(unittest.TestCase):
    def test_happy_path_to_certified(self):
        state = "Application"
        for action in (
            "submit_for_assessment",
            "schedule_audit",
            "start_audit",
            "certify",
        ):
            state = next_state(state, action)
        self.assertEqual(state, "Certified")

    def test_nc_path(self):
        state = next_state("Audit", "raise_nc")
        self.assertEqual(state, "NC Resolution")
        state = next_state(state, "clear_nc")
        self.assertEqual(state, "Certified")

    def test_surveillance_renewal_withdraw(self):
        state = next_state("Certified", "start_surveillance")
        self.assertEqual(state, "Surveillance")
        state = next_state(state, "start_renewal")
        self.assertEqual(state, "Renewal")
        state = next_state(state, "withdraw")
        self.assertEqual(state, "Withdraw")

    def test_invalid_transition(self):
        with self.assertRaises(ValueError):
            next_state("Application", "certify")

    def test_label_actions(self):
        self.assertEqual(
            next_state("Application", "Submit for Assessment"), "Assessment"
        )


class DisplayStatusTests(unittest.TestCase):
    def test_portal_labels(self):
        self.assertEqual(display_status("Application"), "Submitted")
        self.assertEqual(display_status("Assessment"), "In Review")
        self.assertEqual(display_status("Audit Scheduled"), "Audit Scheduled")
        self.assertEqual(display_status("Withdraw"), "Withdrawn")

    def test_filter_aliases(self):
        self.assertEqual(resolve_workflow_state("In Review"), "Assessment")
        self.assertEqual(resolve_workflow_state("Submitted"), "Application")
        self.assertEqual(resolve_workflow_state("Audit Scheduled"), "Audit Scheduled")
        self.assertEqual(resolve_workflow_state("withdrawn"), "Withdraw")


class SerializerTests(unittest.TestCase):
    def test_application_shape(self):
        payload = serialize_application(
            {
                "name": "APP-2026-00001",
                "scheme": "ISO9001-QMS",
                "applicant_name": "Lusoti Foods",
                "workflow_state": "Audit Scheduled",
                "creation": "2026-09-01 10:00:00",
                "modified": "2026-09-10 12:00:00",
            }
        )
        self.assertEqual(
            set(payload.keys()),
            {"id", "scheme", "applicant", "status", "created_at", "updated_at"},
        )
        self.assertEqual(payload["id"], "APP-2026-00001")
        self.assertEqual(payload["applicant"], "Lusoti Foods")
        self.assertEqual(payload["status"], "Audit Scheduled")
        self.assertIn("T", payload["created_at"])

    def test_application_in_review_display(self):
        payload = serialize_application(
            {
                "name": "APP-2026-00002",
                "scheme": "ISO9001-QMS",
                "applicant_name": "Test Org",
                "workflow_state": "Assessment",
                "creation": "2026-09-01 10:00:00",
                "modified": "2026-09-10 12:00:00",
            }
        )
        self.assertEqual(payload["status"], "In Review")

    def test_audit_summary_shape(self):
        payload = serialize_audit_summary(
            {
                "name": "AUD-2026-00001",
                "application": "APP-2026-00001",
                "auditor": "AUD-001",
                "scheme": "ISO9001-QMS",
                "due_date": "2026-09-01",
                "status": "Overdue",
            }
        )
        self.assertEqual(
            set(payload.keys()),
            {"id", "application_id", "auditor", "scheme", "due_date", "status"},
        )
        self.assertEqual(payload["application_id"], "APP-2026-00001")
        self.assertEqual(payload["status"], "Overdue")


class DocTypeFixtureTests(unittest.TestCase):
    EXPECTED = {
        "Certification Scheme",
        "Certification Application",
        "Audit",
        "Audit Finding",
        "Certificate",
        "Auditor",
        "Auditor Competence",
        "Surveillance Visit",
    }

    def test_all_doctype_json_present(self):
        dt_root = PKG / "certification" / "doctype"
        found = set()
        for path in dt_root.glob("*/*.json"):
            data = json.loads(path.read_text())
            self.assertEqual(data.get("doctype"), "DocType")
            found.add(data["name"])
            self.assertTrue(data.get("fields"), msg=path.name)
            self.assertTrue(data.get("permissions"), msg=path.name)
        self.assertEqual(found, self.EXPECTED)

    def test_workflow_fixture(self):
        wf = json.loads((PKG / "fixtures" / "workflow.json").read_text())
        self.assertEqual(wf[0]["name"], "Certification Application Flow")
        self.assertEqual(wf[0]["document_type"], "Certification Application")
        states = {s["state"] for s in wf[0]["states"]}
        self.assertIn("Certified", states)
        self.assertIn("Withdraw", states)
        self.assertTrue(wf[0]["transitions"])

    def test_print_format_fixture(self):
        pf = json.loads((PKG / "fixtures" / "print_format.json").read_text())
        self.assertEqual(pf[0]["name"], "Certificate of Conformity")
        self.assertEqual(pf[0]["doc_type"], "Certificate")
        self.assertIn("Certificate of Conformity", pf[0]["html"])

    def test_api_module_importable_symbols(self):
        # api.py imports frappe — only check source declares whitelist targets
        src = (PKG / "api.py").read_text()
        for name in (
            "list_overdue",
            "list_applications",
            "get_application",
            "create_application",
            "advance_state",
        ):
            self.assertIn(f"def {name}", src)

    def test_seed_documents_a10_coexistence(self):
        src = (PKG / "seed.py").read_text()
        self.assertIn("CERT-2025-0041", src)
        self.assertIn("AUD-2026-00001", src)
        self.assertIn("eswasa_certification_demo_seed", src)
        self.assertIn("demo_seed_enabled", src)


if __name__ == "__main__":
    unittest.main()
