"""Accreditation evidence pack (plan 07 step 8) — contents per person, two-year look-back, access rows, no pay fields."""

from __future__ import annotations

import json
import unittest
from datetime import date

from eswasa_hr import evidence_pack as ep
from eswasa_hr.sensitive import LEVELS
from tests import _fakefrappe as ff

PAY_AND_PERSONAL = {f for lv in LEVELS.values() for f, _ in lv["fields"]}


class RuleTests(unittest.TestCase):
    def test_scope_is_exactly_one(self):
        self.assertEqual(ep.clean_scope({"employee": " EMP-1 ", "scheme": ""}), ("employee", "EMP-1"))
        self.assertEqual(ep.clean_scope({"discipline": "Mass"}), ("discipline", "Mass"))
        for bad in ({}, {"employee": "EMP-1", "scheme": "ISO 22000"}):
            with self.assertRaisesRegex(ValueError, "Choose one"):
                ep.clean_scope(bad)

    def test_sections_are_a_configurable_list(self):
        self.assertEqual(ep.clean_sections(None), list(ep.SECTIONS))
        self.assertEqual(ep.clean_sections(["training", "authorisations"]), ["authorisations", "training"])
        with self.assertRaisesRegex(ValueError, "Unknown pack section: pay"):
            ep.clean_sections(["pay"])

    def test_two_year_look_back_across_1_april(self):
        self.assertEqual(ep.declaration_years(date(2026, 3, 31)), [2025, 2024])
        self.assertEqual(ep.declaration_years(date(2026, 4, 1)), [2026, 2025])

    def test_access(self):
        self.assertTrue(ep.can_export(["HR Manager"]))
        self.assertTrue(ep.can_export(["Eswasa Quality Manager"]))
        self.assertFalse(ep.can_export(["HR User", "Employee"]))

    def test_no_pay_or_personal_field_survives(self):
        person = {"type": "Employee", "id": "EMP-1", "name": "Thandi", "ctc": 90000, "bank_ac_no": "123", "date_of_birth": "1990-01-01"}
        block = ep.person_block(person, list(ep.SECTIONS), [{"skill": "FSMS", "iban": "X", "evidence": []}], [], [], [])
        flat = json.dumps(block)
        for f in PAY_AND_PERSONAL:
            self.assertNotIn(f'"{f}"', flat)
        self.assertEqual(set(block["person"]), set(ep.PERSON_FIELDS))

    def test_monitoring_and_files(self):
        auths = [{"skill": "FSMS", "evidence": [
            {"evidence_type": "Witnessed audit", "reference": "FV-1"},
            {"evidence_type": "File", "file": "/private/files/cert.pdf"},
            {"evidence_type": "File", "file": "hr/evidence/abc.pdf"},
        ]}]
        mon = ep.monitoring_from(auths, [{"source": "Audit", "kind": "Stage 2", "reference": "AUD-1", "date": "2026-02-01"}])
        self.assertEqual([m["reference"] for m in mon], ["FV-1", "AUD-1"])
        self.assertEqual(ep.files_of(auths), ["/private/files/cert.pdf", "hr/evidence/abc.pdf"])
        self.assertTrue(ep.is_frappe_file("/private/files/cert.pdf"))
        self.assertFalse(ep.is_frappe_file("hr/evidence/abc.pdf"))


def _store():
    return {
        "Employee": [
            {"name": "EMP-1", "employee_name": "Thandi Mamba", "user_id": "thandi@x", "department": "Certification",
             "designation": "Lead Auditor", "ctc": 90000, "bank_ac_no": "123"},
            {"name": "EMP-2", "employee_name": "Bongani Dlamini", "user_id": "bongani@x", "department": "Certification"},
        ],
        "Skill": [{"name": "FSMS", "custom_scheme": "ISO 22000", "custom_kind": "Audit"}],
        "Staff Authorisation": [
            {"name": "SA-1", "employee": "EMP-1", "skill": "FSMS", "docstatus": 1, "status": "Current",
             "valid_from": "2025-12-01", "valid_to": "2028-11-30"},
            {"name": "SA-2", "employee": "EMP-2", "skill": "FSMS", "docstatus": 1, "status": "Expired",
             "valid_from": "2022-01-01", "valid_to": "2025-01-01"},
        ],
        "Staff Authorisation Evidence": [
            {"name": "ev1", "parent": "SA-1", "parenttype": "Staff Authorisation", "evidence_type": "Witnessed audit", "reference": "FV-9"},
            {"name": "ev2", "parent": "SA-1", "parenttype": "Staff Authorisation", "evidence_type": "File", "attachment": "hr/evidence/a.pdf"},
        ],
        "Impartiality Declaration": [
            {"name": "IMP-EMP-1-2026", "employee": "EMP-1", "year": 2026, "docstatus": 1, "signed_on": "2026-04-10"},
            {"name": "IMP-EMP-1-2025", "employee": "EMP-1", "year": 2025, "docstatus": 1, "signed_on": "2025-04-12"},
            {"name": "IMP-EMP-1-2024", "employee": "EMP-1", "year": 2024, "docstatus": 1, "signed_on": "2024-04-12"},
        ],
        "Impartiality Interest": [{"parent": "IMP-EMP-1-2026", "organisation": "Dairy Co", "relationship": "Family"}],
        "Field Visit": [{"name": "FV-9", "lead_auditor": "thandi@x", "planned_date": "2026-03-02", "scheme": "ISO 22000"}],
    }


class GlueTests(unittest.TestCase):
    def tearDown(self):
        ff.uninstall()

    def test_per_scheme_covers_current_holders_only(self):
        ff.install(_store(), user="qm@x", roles=("Eswasa Quality Manager",))
        self.assertEqual([p["id"] for p in ep.people_for("scheme", "ISO 22000")], ["EMP-1"])
        self.assertEqual(ep.people_for("discipline", "ISO 22000"), [])  # not a Calibration skill

    def test_contents_per_person_and_the_look_back(self):
        ff.install(_store(), user="qm@x", roles=("Eswasa Quality Manager",), doctypes=("Field Visit",))
        blocks, sources = ep.gather(ep.people_for("employee", "EMP-1"), list(ep.SECTIONS))
        b = blocks[0]
        self.assertEqual(b["person"]["name"], "Thandi Mamba")
        self.assertEqual([e["file"] for e in b["authorisations"][0]["evidence"]], [None, "hr/evidence/a.pdf"])
        self.assertEqual([(m["source"], m["reference"]) for m in b["monitoring"]], [("Staff Authorisation", "FV-9"), ("Field Visit", "FV-9")])
        self.assertEqual([(d["year"], d["status"]) for d in b["declarations"]], [(2026, "signed"), (2025, "signed")])
        self.assertEqual(b["declarations"][0]["interests"][0]["organisation"], "Dairy Co")
        self.assertEqual(sources, ["Field Visit"])
        flat = json.dumps(blocks, default=str)
        for f in PAY_AND_PERSONAL:
            self.assertNotIn(f'"{f}"', flat)
        self.assertNotIn("90000", flat)

    def test_request_writes_an_access_row_per_person_and_queues(self):
        store = _store()
        f = ff.install(store, user="hr@x", roles=("HR Manager",), doctypes=("HR Access Log",))
        queued = []
        f.enqueue = lambda method, **kw: queued.append((method, kw))
        job = ep.request_impl({"scheme": "ISO 22000"})
        self.assertEqual((job["status"], job["people"], job["ready"]), ("Queued", 1, False))
        logs = store["HR Access Log"]
        self.assertEqual([(r["employee"], r["level"], r["viewer"]) for r in logs], [("EMP-1", "Evidence pack", "hr@x")])
        self.assertIn(job["id"], logs[0]["reason"])
        self.assertEqual(queued[0][0], "eswasa_hr.evidence_pack.build")
        self.assertEqual(queued[0][1]["pack"], job["id"])

    def test_only_hr_manager_and_quality(self):
        ff.install(_store(), user="u@x", roles=("HR User",))
        with self.assertRaisesRegex(ff.Throw, "Quality Manager"):
            ep.request_impl({"employee": "EMP-1"})

    def test_empty_scope_is_refused(self):
        ff.install(_store(), user="hr@x", roles=("HR Manager",))
        with self.assertRaisesRegex(ff.Throw, "Nobody is in this pack"):
            ep.request_impl({"scheme": "ISO 9001"})


if __name__ == "__main__":
    unittest.main()
