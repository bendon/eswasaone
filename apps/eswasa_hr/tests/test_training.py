"""Training evidence (plan 07 step 6) and evidence files on authorisations (step 5)."""

from __future__ import annotations

import unittest

from eswasa_hr import authorisations as au
from eswasa_hr import training as tr
from tests import _fakefrappe as ff

RESULTS = {"TR-1": {"name": "TR-1", "training_event": "EV-1"}, "TR-2": {"name": "TR-2", "training_event": "EV-OTHER"}}
EVENTS = {"EV-1": {"name": "EV-1", "event_name": "ISO 22000 refresher", "end_time": "2026-11-04 16:00:00"}}


class RuleTests(unittest.TestCase):
    def test_only_passes_on_events_tagged_to_the_skill(self):
        rows = [
            {"parent": "TR-1", "employee": "EMP-1", "result": "Pass", "grade": "A", "hours": 8},
            {"parent": "TR-1", "employee": "EMP-1", "result": "Fail"},
            {"parent": "TR-2", "employee": "EMP-1", "result": "Pass"},  # event not tagged to this skill
            {"parent": "TR-9", "employee": "EMP-1", "result": "Pass"},  # result not submitted
        ]
        out = tr.training_items(rows, RESULTS, EVENTS, has_result_field=True)
        self.assertEqual([(i["reference"], i["title"], i["date"]) for i in out], [("TR-1", "ISO 22000 refresher", "2026-11-04")])
        self.assertEqual(out[0]["evidence_type"], "Training Result")

    def test_without_a_result_field_every_row_counts(self):
        rows = [{"parent": "TR-1", "employee": "EMP-1", "grade": "B"}]
        self.assertEqual(tr.training_items(rows, RESULTS, EVENTS, has_result_field=False)[0]["grade"], "B")

    def test_lms_certificates_then_unfinished_and_finished_enrolments(self):
        certs = [{"name": "CERT-1", "course": "c1", "issue_date": "2026-05-01"}]
        enrols = [{"course": "c1", "progress": 100}, {"course": "c2", "progress": 60}, {"course": "c3", "progress": 100, "modified": "2026-06-01 10:00"}]
        out = tr.lms_items(certs, enrols, {"c1": "Auditing basics", "c3": "Calibration uncertainty"})
        self.assertEqual([(i["source"], i["reference"], i["title"]) for i in out],
                         [("LMS Enrollment", None, "Calibration uncertainty"), ("LMS Certificate", "LMS:CERT-1", "Auditing basics")])
        self.assertFalse(any(i["tagged"] for i in out))

    def test_evidence_link_only_for_known_training(self):
        self.assertEqual(au.evidence_link("Training Result", "TR-1", {"TR-1"}), {"doctype": "Training Result", "name": "TR-1"})
        self.assertEqual(au.evidence_link("Training Result", "LMS:CERT-1", {"LMS:CERT-1"})["doctype"], "LMS Certificate")
        self.assertIsNone(au.evidence_link("Training Result", "ISO refresher, 4 Nov", {"TR-1"}))
        self.assertIsNone(au.evidence_link("Witnessed audit", "TR-1", {"TR-1"}))

    def test_evidence_keeps_the_screen_shape_and_adds_file(self):
        rows = au.clean_evidence([
            {"evidence_type": "Witnessed audit", "reference": "FV-0091"},
            {"evidence_type": "File", "file": "hr/evidence/abc.pdf"},
        ])
        self.assertEqual(rows[0], {"evidence_type": "Witnessed audit", "reference": "FV-0091", "notes": None})
        self.assertEqual(rows[1]["file"], "hr/evidence/abc.pdf")
        stored = au._stored(rows[1])
        self.assertEqual(stored["attachment"], "hr/evidence/abc.pdf")
        self.assertNotIn("file", stored)
        shown = au.evidence_row({"name": "row1", **stored}, set(), show_file=True)
        self.assertEqual((shown["id"], shown["file"]), ("row1", "hr/evidence/abc.pdf"))
        self.assertNotIn("file", au.evidence_row(stored, set(), show_file=False))


class GlueTests(unittest.TestCase):
    def tearDown(self):
        ff.uninstall()

    def test_training_evidence_for_hr_and_the_person_only(self):
        store = {
            "Employee": [{"name": "EMP-1", "user_id": "thandi@x"}],
            "Training Event": [{"name": "EV-1", "event_name": "ISO 22000 refresher", "custom_skill": "FSMS", "end_time": "2026-11-04"}],
            "Training Result": [{"name": "TR-1", "training_event": "EV-1", "docstatus": 1}],
            "Training Result Employee": [{"parent": "TR-1", "parenttype": "Training Result", "employee": "EMP-1", "result": "Pass"}],
        }
        ff.install(store, user="thandi@x", roles=("Employee",), doctypes=("Training Result", "Training Event"),
                   meta_fields={"Training Event": ("custom_skill",), "Training Result Employee": ("result",)})
        out = tr.training_evidence_impl("EMP-1", "FSMS")
        self.assertEqual([i["reference"] for i in out["items"]], ["TR-1"])
        self.assertFalse(out["lms_installed"])
        self.assertEqual(tr.training_evidence_impl("EMP-1", "OHS")["items"], [])
        ff.uninstall()
        ff.install(store, user="someone@x", roles=("Employee",), doctypes=("Training Result", "Training Event"))
        with self.assertRaisesRegex(ff.Throw, "own training"):
            tr.training_evidence_impl("EMP-1", "FSMS")

    def _auth_store(self, docstatus):
        return {
            "Employee": [{"name": "EMP-1", "employee_name": "Thandi", "user_id": "thandi@x", "department": "Cert"}],
            "Staff Authorisation": [{"name": "SA-1", "employee": "EMP-1", "skill": "FSMS", "docstatus": docstatus}],
            "Staff Authorisation Evidence": [{"name": "ev1", "parent": "SA-1", "attachment": "hr/evidence/a.pdf", "evidence_type": "File"}],
        }

    def test_decided_authorisation_keeps_its_evidence(self):
        ff.install(self._auth_store(1), user="hr@x", roles=("HR Manager",))
        with self.assertRaisesRegex(ff.Throw, "renewal"):
            au.add_evidence_impl("SA-1", "File", file="hr/evidence/b.pdf")

    def test_evidence_file_for_hr_and_the_person_only(self):
        store = self._auth_store(1)
        ff.install(store, user="thandi@x", roles=("Employee",))
        self.assertEqual(au.evidence_file_impl("ev1")["file"], "hr/evidence/a.pdf")
        ff.uninstall()
        ff.install(store, user="other@x", roles=("Employee",))
        with self.assertRaisesRegex(ff.Throw, "Only HR or the person"):
            au.evidence_file_impl("ev1")


if __name__ == "__main__":
    unittest.main()
