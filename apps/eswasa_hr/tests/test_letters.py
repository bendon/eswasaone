"""HR letters library (additions plan 03) — pure rules, plus the flows on a fake frappe."""

from __future__ import annotations

import base64
import unittest

from eswasa_hr import letters as lt
from eswasa_hr import sensitive
from tests import _fakefrappe as ff

WORDING = {t: f"We confirm the {t.lower()} of {{employee_name}} ({{employee_number}}). {{unknown}}" for t in lt.LETTER_TYPES}


class RuleTests(unittest.TestCase):
    def test_no_pay_field_in_any_context(self):
        pay = [f for f, _ in sensitive.LEVELS[sensitive.PAY]["fields"]]
        person = {"name": "EMP-7", "employee_name": "Gcina Mavuso", "designation": "Officer", **{f: "secret" for f in pay}}
        source = {"sanction": "Written warning", "designation": "Senior Officer", "revised_ctc": 9, "current_ctc": 8, **{f: "secret" for f in pay}}
        for t in lt.LETTER_TYPES:
            c = lt.letter_context({"name": "HRL-1", "letter_type": t, "issued_on": "2026-10-16"}, person, source, "{ctc} {bank_ac_no}", "ED", False)
            flat = repr(c)
            for f in pay + ["revised_ctc", "current_ctc"]:
                self.assertNotIn(f"'{f}'", flat, f"{f} reached the {t} letter")
            self.assertNotIn("secret", flat)
            self.assertEqual(c["wording"], "{ctc} {bank_ac_no}")  # a pay placeholder stays unfilled
        for fields in lt.SOURCE_FIELDS.values():
            self.assertFalse(set(fields) & set(pay))
        self.assertFalse(set(lt.PERSON_FIELDS) & set(pay))

    def test_wording_placeholders(self):
        c = lt.letter_context({"name": "HRL-1", "letter_type": lt.CONFIRMATION, "issued_on": "2026-10-16"},
                              {"name": "EMP-7", "employee_name": "Gcina Mavuso"}, {}, WORDING[lt.CONFIRMATION], "ED", False)
        self.assertEqual(c["wording"], "We confirm the employment confirmation of Gcina Mavuso (EMP-7). {unknown}")
        self.assertEqual(c["addressed_to"], "To whom it may concern")
        c = lt.letter_context({"letter_type": lt.PROMOTION}, {}, {}, None, "ED", True)
        self.assertIn("Awaiting ESWASA (A3)", c["wording_awaiting"])

    def test_not_ready_type_refused_with_the_a3_message(self):
        errs = lt.generate_errors(lt.PROMOTION, "ready", None, ("HR User",))
        self.assertEqual(errs, ["Awaiting ESWASA (A3): no wording for Promotion."])
        self.assertEqual(lt.generate_errors(lt.PROMOTION, "ready", "text", ("HR User",)), [])

    def test_source_must_be_approved(self):
        self.assertIn("approved or done", lt.generate_errors(lt.PROMOTION, "pending", "text", ("HR User",))[0])
        self.assertEqual(lt.source_state(lt.PROMOTION, {"employee": "E1", "docstatus": 0}, "E1"), "pending")
        self.assertEqual(lt.source_state(lt.PROMOTION, {"employee": "E1", "docstatus": 1}, "E1"), "ready")
        self.assertEqual(lt.source_state(lt.PROMOTION, {"employee": "E2", "docstatus": 1}, "E1"), "missing")
        self.assertEqual(lt.source_state(lt.RENEWAL, {"employee": "E1", "state": "Done", "kind": "Make permanent"}, "E1"), "pending")
        self.assertEqual(lt.source_state(lt.PERMANENT, {"employee": "E1", "state": "Done", "kind": "Make permanent"}, "E1"), "ready")
        self.assertEqual(lt.source_state(lt.PROBATION, {"name": "E1", "final_confirmation_date": None}, "E1"), "pending")
        self.assertEqual(lt.source_state(lt.WARNING, {"employee": "E1", "sanction": "Suspension", "warning_status": "Active"}, "E1"), "pending")
        self.assertEqual(lt.source_state(lt.WARNING, {"employee": "E1", "sanction": "Written warning", "warning_status": "Withdrawn"}, "E1"), "pending")
        self.assertEqual(lt.source_state(lt.WARNING, {"employee": "E1", "sanction": "Written warning", "warning_status": "Active"}, "E1"), "ready")
        self.assertEqual(lt.source_state(lt.CONFIRMATION, {"status": "Left"}, "E1"), "inactive")

    def test_roles(self):
        self.assertIn("Only HR", lt.generate_errors(lt.PROMOTION, "ready", "t", ("Employee",))[0])
        self.assertIn("case owner", lt.generate_errors(lt.WARNING, "ready", "t", ("HR User",))[0])
        self.assertEqual(lt.generate_errors(lt.WARNING, "ready", "t", ("Employee",), case_reader=True), [])
        self.assertEqual(lt.generate_errors(lt.WARNING, "ready", "t", ("HR Manager",)), [])
        self.assertIn("record", lt.generate_errors(lt.CERTIFICATE, "ready", "t", ("HR Manager",))[0])

    def test_requester_cant_prepare_their_own_letter(self):
        self.assertIn("another HR person", lt.preparer_error("hr@x", "hr@x"))
        self.assertIn("about yourself", lt.preparer_error("hr@x", None, "hr@x"))
        self.assertIsNone(lt.preparer_error("hr@x", "gcina@x", "gcina@x"))

    def test_request_rules(self):
        self.assertIn("what the letter is for", lt.request_errors(" ")[0])
        self.assertEqual(lt.request_errors("Bank", "Standard Bank, Mbabane"), [])
        self.assertIn("short", lt.request_errors("x" * 141)[0])
        self.assertTrue(lt.prepare_title("Gcina").startswith("Prepare "))  # a do card in Approvals


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.store = {
            "Employee": [
                {"name": "EMP-7", "employee_name": "Gcina Mavuso", "status": "Active", "department": "ICT", "designation": "Officer",
                 "user_id": "gcina@x", "final_confirmation_date": "2026-09-01", "ctc": 99999},
                {"name": "EMP-3", "employee_name": "Hlengiwe HR", "status": "Active", "user_id": "hr@x"},
            ],
            "Employee Promotion": [{"name": "PROM-1", "employee": "EMP-7", "docstatus": 1, "promotion_date": "2026-10-01"},
                                   {"name": "PROM-2", "employee": "EMP-7", "docstatus": 0, "promotion_date": "2026-11-01"}],
            "Employee Property History": [{"parent": "PROM-1", "fieldname": "designation", "new": "Senior Officer"},
                                          {"parent": "PROM-1", "fieldname": "ctc", "new": "123"}],
            "Disciplinary Case": [{"name": "HRC-1", "employee": "EMP-7", "owner_user": "owner@x", "stage": "Outcome issued",
                                   "sanction": "Written warning", "warning_status": "Active", "outcome_on": "2026-10-10"}],
            "Has Role": [{"parent": "hr@x", "role": "HR User", "parenttype": "User"}, {"parent": "hr2@x", "role": "HR User", "parenttype": "User"},
                         {"parent": "hrm@x", "role": "HR Manager", "parenttype": "User"}],
            "User": [{"name": "hr@x", "enabled": 1}, {"name": "hr2@x", "enabled": 1}, {"name": "hrm@x", "enabled": 1}],
        }
        self.saved = {k: getattr(lt, k) for k in ("_wording", "_render", "_save_file", "_read_file")}
        self.wording = dict(WORDING)
        lt._wording = lambda t: self.wording.get(t)
        lt._render = lambda name, t: b"%PDF-" + name.encode()
        lt._save_file = lambda name, t, pdf: f"/private/files/{name}.pdf"
        lt._read_file = lambda name, url: b"%PDF-" + name.encode()
        self.addCleanup(self._restore)

    def _restore(self):
        for k, v in self.saved.items():
            setattr(lt, k, v)
        ff.uninstall()

    def _as(self, user, roles):
        return ff.install(self.store, user=user, roles=roles, today="2026-10-16", doctypes=("HR Letter", "Disciplinary Case", "HR Alert"))

    def test_generate_from_an_approved_promotion_files_a_document(self):
        self._as("hr2@x", ("HR User",))
        out = lt.generate_impl("EMP-7", lt.PROMOTION, "PROM-1", "To whom it may concern")
        letter = self.store["HR Letter"][0]
        self.assertEqual((letter["status"], letter["issued_by"], letter["issued_on"], letter["source_name"]), ("Issued", "hr2@x", "2026-10-16", "PROM-1"))
        doc = self.store["Employee Document"][0]
        self.assertEqual((doc["employee"], doc["document_type"], doc["status"], doc["verified_by"], doc["file"]),
                         ("EMP-7", "Letter", "Verified", "hr2@x", f"hr-letter:{letter['name']}"))
        self.assertEqual(out["letters"][0]["name"], letter["name"])
        self.assertEqual(next(e for e in out["eligible"] if e["source_name"] == "PROM-1")["letter"], letter["name"])
        self.assertNotIn("PROM-2", [e["source_name"] for e in out["eligible"]])  # not submitted yet

    def test_source_must_be_approved_and_wording_present(self):
        f = self._as("hr2@x", ("HR User",))
        with self.assertRaisesRegex(f.ValidationError, "approved or done"):
            lt.generate_impl("EMP-7", lt.PROMOTION, "PROM-2")
        self.wording.pop(lt.TRANSFER)
        with self.assertRaisesRegex(f.ValidationError, "Awaiting ESWASA \\(A3\\)"):
            lt.generate_impl("EMP-7", lt.TRANSFER, "PROM-1")
        self.assertFalse(self.store.get("HR Letter"))

    def test_hr_cant_make_a_letter_about_themselves(self):
        self.store["Employee"][1]["final_confirmation_date"] = "2026-01-01"
        f = self._as("hr@x", ("HR User",))
        with self.assertRaisesRegex(f.PermissionError, "about yourself"):
            lt.generate_impl("EMP-3", lt.PROBATION)

    def test_warning_letter_limited_to_case_readers(self):
        f = self._as("hr2@x", ("HR User",))
        with self.assertRaisesRegex(f.PermissionError, "case owner"):
            lt.generate_impl("EMP-7", lt.WARNING, "HRC-1")
        self._as("owner@x", ("Employee",))
        out = lt.generate_impl("EMP-7", lt.WARNING, "HRC-1")
        letter = self.store["HR Letter"][0]
        self.assertEqual(out["letters"][0]["letter_type"], "Warning")
        self.assertEqual(self.store["Disciplinary Case"][0]["warning_letter"], letter["name"])
        self.assertFalse(self.store.get("Employee Document"))  # not filed where HR Users read
        self.assertFalse(self.store.get("HR Notification"))  # cases never email
        self.assertTrue(lt.has_permission(letter, "read", "owner@x"))
        self._as("hr2@x", ("HR User",))
        self.assertFalse(lt.has_permission(letter, "read", "hr2@x"))
        self.assertEqual(lt.list_impl("EMP-7")["letters"], [])
        self.assertNotIn("Warning", [e["letter_type"] for e in lt.list_impl("EMP-7")["eligible"]])
        f = self._as("gcina@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            lt.file_impl(letter["name"])
        self._as("hrm@x", ("HR Manager",))
        self.assertTrue(lt.has_permission(letter, "read", "hrm@x"))

    def test_staff_request_then_hr_prepares_and_the_person_downloads(self):
        self._as("hr@x", ("Employee", "HR User"))  # an HR person asking for their own letter
        mine = lt.request_impl("Bank", "Standard Bank")
        self.assertEqual(mine["letters"][0]["status"], "Requested")
        self.assertFalse(mine["can_request"])
        name = self.store["HR Letter"][0]["name"]
        todos = self.store["ToDo"]
        self.assertEqual(sorted(t["allocated_to"] for t in todos), ["hr2@x", "hrm@x"])  # named people, not the requester
        self.assertEqual(todos[0]["description"], "Prepare employment confirmation letter for Hlengiwe HR")
        f = self._as("hr@x", ("HR User",))
        with self.assertRaisesRegex(f.PermissionError, "another HR person"):
            lt.fulfil_impl(name)
        self._as("hr2@x", ("HR User",))
        res = lt.decide(name, "done")
        self.assertEqual(res["status"], "Issued")
        self.assertEqual({t["status"] for t in todos}, {"Closed"})
        self.assertEqual(self.store["Employee Document"][0]["document_type"], "Letter")
        self._as("hr@x", ("Employee",))
        got = lt.file_impl(name)
        self.assertEqual(base64.b64decode(got["content"]), b"%PDF-" + name.encode())
        self.assertTrue(lt.my_letters_impl()["can_request"])

    def test_request_refused_twice_or_without_purpose(self):
        f = self._as("gcina@x", ("Employee",))
        with self.assertRaisesRegex(f.ValidationError, "what the letter is for"):
            lt.request_impl("")
        lt.request_impl("Embassy")
        with self.assertRaisesRegex(f.ValidationError, "already have a request"):
            lt.request_impl("Bank")

    def test_cancel_is_hr_manager_only_and_keeps_the_file(self):
        self._as("hr2@x", ("HR User",))
        lt.generate_impl("EMP-7", lt.PROBATION)
        name = self.store["HR Letter"][0]["name"]
        f = self._as("hr2@x", ("HR User",))
        with self.assertRaises(f.PermissionError):
            lt.cancel_impl(name, "Wrong date")
        f = self._as("hrm@x", ("HR Manager",))
        with self.assertRaisesRegex(f.ValidationError, "why"):
            lt.cancel_impl(name, " ")
        lt.cancel_impl(name, "Wrong date")
        row = self.store["HR Letter"][0]
        self.assertEqual((row["status"], row["note"], row["file"]), ("Cancelled", "Wrong date", f"/private/files/{name}.pdf"))
        self._as("gcina@x", ("Employee",))
        self.assertEqual(lt.my_letters_impl()["letters"], [])  # a cancelled letter leaves My letters

    def test_types_and_setup_step(self):
        self._as("hr2@x", ("HR User",))
        self.wording = {lt.CONFIRMATION: "text"}
        out = lt.types_impl()
        by = {t["letter_type"]: t for t in out["types"]}
        self.assertTrue(by[lt.CONFIRMATION]["ready"])
        self.assertEqual(by[lt.PROMOTION]["reason"], "Awaiting ESWASA (A3): no wording for Promotion.")
        self.assertFalse(by[lt.CERTIFICATE]["generated_here"])
        self.assertEqual(out["awaiting"], "A3")
        step = lt.setup_step()
        self.assertEqual((step["state"], step["awaiting"]), ("partial", "A3"))
        self.wording = {}
        self.assertEqual(lt.setup_step()["state"], "awaiting")
        f = self._as("gcina@x", ("Employee",))
        with self.assertRaises(f.PermissionError):
            lt.types_impl()


if __name__ == "__main__":
    unittest.main()
