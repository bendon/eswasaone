"""Employee documents (plan 06) — missing and expiring rules, self-upload verified by someone else, alerts once per threshold."""

from __future__ import annotations

import unittest
from datetime import date

from eswasa_hr import documents as docs

TODAY = date(2026, 10, 16)


class RuleTests(unittest.TestCase):
    def test_missing(self):
        required = [{"document_type": "ID"}, {"document_type": "Qualification"}, {"document_type": "Work permit"}]
        held = [{"document_type": "ID"}, {"document_type": "Work permit", "expires_on": "2026-10-01"}]
        self.assertEqual(docs.missing(required, held), ["Qualification"])
        self.assertEqual(docs.missing(required, held, TODAY), ["Qualification", "Work permit"])
        self.assertEqual(docs.missing([], held, TODAY), [])

    def test_expiring(self):
        rows = [{"name": "a", "expires_on": "2026-12-31"}, {"name": "b", "expires_on": "2026-10-20"},
                {"name": "c", "expires_on": "2026-10-10"}, {"name": "d", "expires_on": None}]
        out = docs.expiring(rows, TODAY, 30)
        self.assertEqual([(r["name"], r["days_left"]) for r in out], [("c", -6), ("b", 4)])

    def test_thresholds_never_invent_a_number(self):
        self.assertEqual(docs.thresholds(None), [0])
        self.assertEqual(docs.thresholds(60), [60, 0])
        self.assertIsNone(docs.threshold_now("2026-12-31", TODAY, 60))
        self.assertEqual(docs.threshold_now("2026-12-01", TODAY, 60), 60)
        self.assertEqual(docs.threshold_now("2026-10-16", TODAY, 60), 0)
        self.assertIsNone(docs.threshold_now("2026-12-01", TODAY, None))

    def test_upload_rules(self):
        self.assertIsNone(docs.upload_error(False, True, "ID", "k", None, TODAY))
        self.assertIn("own record", docs.upload_error(False, False, "ID", "k", None, TODAY))
        self.assertIn("kind", docs.upload_error(True, False, "Payslip", "k", None, TODAY))
        self.assertIn("Attach", docs.upload_error(True, False, "ID", " ", None, TODAY))
        self.assertIn("expired", docs.upload_error(True, False, "ID", "k", "2026-10-01", TODAY))
        self.assertIn("isn't a date", docs.upload_error(True, False, "ID", "k", "soon", TODAY))

    def test_self_upload_is_to_check(self):
        self.assertEqual(docs.initial_status(is_hr=False, own=True), docs.TO_CHECK)
        self.assertEqual(docs.initial_status(is_hr=True, own=True), docs.TO_CHECK)
        self.assertEqual(docs.initial_status(is_hr=True, own=False), docs.VERIFIED)

    def test_verifier_is_hr_and_not_the_uploader(self):
        self.assertIsNone(docs.verify_error("hr2@x", ["HR User"], "thandi@x", docs.TO_CHECK))
        self.assertIn("someone else", docs.verify_error("hr2@x", ["HR User"], "hr2@x", docs.TO_CHECK))
        self.assertIn("Only HR", docs.verify_error("sipho@x", ["Employee"], "thandi@x", docs.TO_CHECK))
        self.assertIn("already", docs.verify_error("hr2@x", ["HR Manager"], "thandi@x", docs.VERIFIED))

    def test_row_hides_the_file_and_marks_expired(self):
        r = {"name": "D1", "employee": "E1", "document_type": "ID", "file": "k", "expires_on": "2026-10-01", "status": "Verified", "owner": "hr@x"}
        out = docs.doc_row(r, show_file=False, today=TODAY, required=["ID"])
        self.assertEqual((out["file"], out["status"], out["required"]), (None, "Expired", True))
        self.assertEqual(docs.doc_row(r, True, TODAY)["file"], "k")


def _store():
    return {
        "Employee": [
            {"name": "E1", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "status": "Active", "reports_to": None, "employment_type": "Contract"},
        ],
        "Department": [],
        "Has Role": [{"parent": "hr1@x", "role": "HR Manager", "parenttype": "User"}, {"parent": "hr2@x", "role": "HR User", "parenttype": "User"}],
        "User": [{"name": "hr1@x", "enabled": 1}, {"name": "hr2@x", "enabled": 1}],
        "Employee Document": [],
        "Required Document": [{"parent": "Contract", "parenttype": "Employment Type", "parentfield": "custom_required_documents",
                               "document_type": "Work permit", "expires": 1, "alert_days": 60}],
        "HR Alert": [],
        "ToDo": [],
    }


class GlueTests(unittest.TestCase):
    def _install(self, user, roles, today=TODAY):
        from tests import _fakefrappe as ff

        self.addCleanup(ff.uninstall)
        self.store = getattr(self, "store", None) or _store()
        return ff.install(self.store, user=user, roles=roles, today=today.isoformat(), doctypes=("Employee Document", "Required Document", "HR Alert"))

    def test_self_upload_needs_another_hr_person(self):
        self._install("thandi@x", ("Employee",))
        out = docs.upload_mine("Work permit", "hr/documents/permit.pdf", "2027-06-30", confirm=1)
        self.assertEqual(out["items"][0]["status"], docs.TO_CHECK)
        self.assertEqual(out["missing"], [])
        name = out["items"][0]["id"]
        self.store["Employee Document"][0]["owner"] = "thandi@x"
        f = self._install("thandi@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            docs.verify_impl(name)
        self._install("hr2@x", ("HR User",))
        self.assertEqual(docs.verify_impl(name)["items"][0]["status"], docs.VERIFIED)
        self.assertEqual(self.store["Employee Document"][0]["verified_by"], "hr2@x")

    def test_hr_upload_for_someone_is_verified(self):
        self._install("hr1@x", ("HR Manager",))
        out = docs.upload("E1", "ID", "hr/documents/id.pdf", confirm=1)
        self.assertEqual((out["items"][0]["status"], self.store["Employee Document"][0]["verified_by"]), (docs.VERIFIED, "hr1@x"))

    def test_nobody_else_uploads_or_opens(self):
        self.store = _store()
        self.store["Employee"].append({"name": "E9", "employee_name": "Other", "user_id": "other@x", "status": "Active", "reports_to": None})
        self.store["Employee Document"].append({"name": "D1", "employee": "E1", "document_type": "ID", "file": "k"})
        f = self._install("other@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            docs.upload_impl("E1", "ID", "k")
        with self.assertRaises(f.PermissionError):
            docs.file_impl("D1")
        with self.assertRaises(f.PermissionError):
            docs.list_impl("E1")

    def test_alert_raised_once_per_threshold(self):
        self.store = _store()
        self.store["Employee Document"].append({"name": "D1", "employee": "E1", "document_type": "Work permit", "expires_on": "2026-12-01"})
        self._install("Administrator", ("System Manager",))
        self.assertEqual(docs.expiry_alerts(), 1)
        self.assertEqual(docs.expiry_alerts(), 0)
        self.assertEqual(self.store["HR Alert"][0]["key"], "doc:D1:60")
        self.assertEqual(self.store["HR Alert"][0]["rule"], docs.RULE)
        self.assertEqual(sorted(t["allocated_to"] for t in self.store["ToDo"]), ["hr1@x", "hr2@x", "thandi@x"])
        self._install("Administrator", ("System Manager",), today=date(2026, 12, 1))
        self.assertEqual(docs.expiry_alerts(), 1)
        self.assertEqual(self.store["HR Alert"][1]["key"], "doc:D1:0")
        self.assertIn("expired", self.store["HR Alert"][1]["message"])

    def test_required_count(self):
        self._install("hr1@x", ("HR Manager",))
        self.assertEqual(docs.required_count(), 1)


if __name__ == "__main__":
    unittest.main()
