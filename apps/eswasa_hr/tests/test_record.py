"""The full person record (plan 06) — no protected field ever, file links only for HR and the person, scope."""

from __future__ import annotations

import unittest
from datetime import date

from eswasa_hr import certificate as cert
from eswasa_hr import record as rec
from eswasa_hr.sensitive import LEVELS

TODAY = date(2026, 10, 16)
JOB_META = [f for f in rec.JOB_FIELDS if f != "name"]


class RuleTests(unittest.TestCase):
    def test_no_protected_field_ever_leaves_job_view(self):
        row = {f: "x" for f in rec.JOB_FIELDS}
        for spec in LEVELS.values():
            for field, _label in spec["fields"]:
                row[field] = "secret"
        out = rec.job_view(row)
        for spec in LEVELS.values():
            for field, _label in spec["fields"]:
                self.assertNotIn(field, out)
        self.assertNotIn("secret", out.values())
        self.assertFalse(set(rec.JOB_FIELDS) & rec.protected(), "a job field is also a protected field")

    def test_viewer_kind(self):
        self.assertEqual(rec.viewer_kind(True, None, "E1", []), "hr")
        self.assertEqual(rec.viewer_kind(False, "E1", "E1", []), "self")
        self.assertEqual(rec.viewer_kind(False, "E2", "E1", ["E1"]), "manager")
        self.assertIsNone(rec.viewer_kind(False, "E2", "E1", ["E3"]))
        self.assertIsNone(rec.viewer_kind(False, None, "E1", []))

    def test_next_leave_is_current_or_soonest(self):
        rows = [
            {"leave_type": "Annual", "from_date": "2026-11-02", "to_date": "2026-11-06"},
            {"leave_type": "Sick", "from_date": "2026-10-15", "to_date": "2026-10-17"},
            {"leave_type": "Annual", "from_date": "2026-09-01", "to_date": "2026-09-03"},
        ]
        self.assertEqual(rec.next_leave(rows, TODAY)["leave_type"], "Sick")
        self.assertIsNone(rec.next_leave(rows[2:], TODAY))

    def test_open_items(self):
        items = rec.open_items(date(2026, 11, 1), "outstanding", "2026/27", "self", "APR-1", 2)
        self.assertEqual([i["kind"] for i in items], ["probation", "declaration", "appraisal", "change"])
        self.assertEqual(items[2]["title"], "Self-assessment not done")
        self.assertEqual(items[3]["title"], "2 changes waiting for approval")
        self.assertEqual(rec.open_items(None, "signed", "2026/27", "done", "APR-1"), [])

    def test_a_manager_never_sees_why_someone_is_leaving(self):
        items = [{"kind": "separation", "changes": [{"property": "Reason", "new": "Dismissal"}]}, {"kind": "promotion", "changes": [{"property": "Grade"}]}]
        out = rec.manager_history(items)
        self.assertEqual(out[0]["changes"], [])
        self.assertEqual(out[1]["changes"], [{"property": "Grade"}])


class CertificateTests(unittest.TestCase):
    def test_posts_from_history(self):
        moves = [
            {"date": "2024-04-01", "current": "Officer", "new": "Senior Officer"},
            {"date": "2022-01-01", "current": "Assistant", "new": "Officer"},
        ]
        posts = cert.posts_held("2020-03-02", "2026-10-31", "Senior Officer", moves)
        self.assertEqual([p["designation"] for p in posts], ["Assistant", "Officer", "Senior Officer"])
        self.assertEqual((posts[0]["from_date"], posts[0]["to_date"]), ("2020-03-02", "2022-01-01"))
        self.assertEqual(posts[-1]["to_date"], "2026-10-31")

    def test_one_post_when_nothing_changed(self):
        self.assertEqual(cert.posts_held("2020-03-02", None, "Officer", []), [{"designation": "Officer", "from_date": "2020-03-02", "to_date": None}])

    def test_never_pay_or_reason(self):
        e = {"name": "E1", "employee_name": "Thandi Mamba", "employee_number": "S-1", "date_of_joining": "2020-03-02", "relieving_date": "2026-10-31",
             "status": "Left", "ctc": 90000, "bank_ac_no": "123", "reason_for_leaving": "Dismissal", "custom_reason": "Dismissal"}
        c = cert.certificate_context(e, [], None, "Signatory: awaiting ESWASA (H3)", True)
        for field in cert.NEVER:
            self.assertNotIn(field, c)
        self.assertNotIn("Dismissal", str(c))
        self.assertNotIn("90000", str(c))
        self.assertEqual(c["wording_awaiting"], cert.WORDING_AWAITING)
        self.assertFalse(c["still_employed"])
        self.assertFalse(set(cert.FIELDS) & set(cert.NEVER))


def _store():
    staff = [
        {"name": "E1", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "status": "Active", "reports_to": "E2", "department": "Certification",
         "designation": "Officer", "employment_type": "Permanent", "date_of_joining": "2020-03-02", "company": "ESWASA",
         "date_of_birth": "1990-01-01", "bank_ac_no": "123", "ctc": 90000},
        {"name": "E2", "employee_name": "Sipho Dlamini", "user_id": "sipho@x", "status": "Active", "reports_to": None, "department": "Certification"},
        {"name": "E3", "employee_name": "Nomsa Shongwe", "user_id": "nomsa@x", "status": "Active", "reports_to": None, "department": "Finance"},
    ]
    return {
        "Employee": staff,
        "Department": [],
        "Employee Document": [{"name": "D1", "employee": "E1", "document_type": "ID", "file": "hr/documents/id.pdf", "expires_on": None,
                               "status": "Verified", "owner": "hr@x", "creation": "2026-10-01"}],
        "Required Document": [{"parent": "Permanent", "parenttype": "Employment Type", "parentfield": "custom_required_documents",
                               "document_type": "Qualification", "expires": 0, "alert_days": None}],
    }


class GlueTests(unittest.TestCase):
    def _install(self, user, roles):
        from tests import _fakefrappe as ff

        self.addCleanup(ff.uninstall)
        self.store = _store()
        return ff.install(self.store, user=user, roles=roles, today=TODAY.isoformat(),
                          doctypes=("Employee Document", "Required Document"), meta_fields={"Employee": JOB_META})

    def test_hr_sees_the_file_and_no_protected_field(self):
        self._install("hr@x", ("HR User",))
        out = rec.record_impl("E1")
        self.assertEqual((out["id"], out["viewer"], out["reports_to_name"]), ("E1", "hr", "Sipho Dlamini"))
        self.assertEqual(out["documents"]["items"][0]["file"], "hr/documents/id.pdf")
        self.assertEqual(out["documents"]["missing"], ["Qualification"])
        for spec in LEVELS.values():
            for field, _label in spec["fields"]:
                self.assertNotIn(field, out)
                self.assertNotIn(field, out["job"])
        self.assertNotIn("90000", str(out))

    def test_line_manager_gets_no_file_link(self):
        self._install("sipho@x", ("Employee",))
        out = rec.record_impl("E1")
        self.assertEqual(out["viewer"], "manager")
        self.assertIsNone(out["documents"]["items"][0]["file"])
        self.assertEqual(out["documents"]["items"][0]["document_type"], "ID")

    def test_the_person_gets_their_own_file(self):
        self._install("thandi@x", ("Employee",))
        self.assertEqual(rec.my_record_impl()["documents"]["items"][0]["file"], "hr/documents/id.pdf")

    def test_someone_else_is_refused(self):
        f = self._install("nomsa@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            rec.record_impl("E1")


if __name__ == "__main__":
    unittest.main()
