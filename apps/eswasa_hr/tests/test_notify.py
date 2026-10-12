"""HR notification outbox: templates never carry protected fields, dedupe by key, opt-out, pending and mark."""

from __future__ import annotations

import json
import re
import unittest

from eswasa_hr import notify
from eswasa_hr import notify_templates as nt
from eswasa_hr.sensitive import LEVELS
from tests import _fakefrappe as ff

CASE_WORDS = ("grievance", "disciplinary", "case", "hearing", "complaint")


class TemplateTests(unittest.TestCase):
    def test_no_protected_field_or_label_in_any_template(self):
        for name, spec in nt.TEMPLATES.items():
            text = f"{spec['subject']}\n{spec['body']}".lower()
            for level in LEVELS.values():
                for field, label in level["fields"]:
                    self.assertNotIn(field, spec["fields"], f"{name} declares protected field {field}")
                    self.assertNotIn(f"{{{field}}}", text, f"{name} uses protected field {field}")
                    self.assertIsNone(re.search(rf"\b{re.escape(label.lower())}\b", text), f"{name} mentions {label}")

    def test_placeholders_are_declared_and_cases_never_email(self):
        for name, spec in nt.TEMPLATES.items():
            used = set(re.findall(r"{(\w+)}", spec["subject"] + spec["body"]))
            self.assertEqual(used, set(spec["fields"]), name)
            for w in CASE_WORDS:
                self.assertNotIn(w, name)
                self.assertNotIn(w, (spec["subject"] + spec["body"]).lower(), name)

    def test_render_ignores_undeclared_context(self):
        msg = nt.render("leave_decided", {"decision": "approved", "from_date": "2 Nov 2026", "to_date": "6 Nov 2026",
                                          "reason": "medical", "bank_ac_no": "123"})
        self.assertEqual(msg["subject"], "Your leave request was approved")
        self.assertNotIn("medical", msg["body"])
        self.assertNotIn("123", msg["body"])
        self.assertEqual(nt.clean("leave_decided", {"reason": "x"}), {"decision": "", "from_date": "", "to_date": ""})

    def test_only_decisions_and_offers_ignore_opt_out(self):
        self.assertEqual(notify.initial_status("leave_decided", True), ("Queued", None))
        self.assertEqual(notify.initial_status("offer_sent", True), ("Queued", None))
        self.assertEqual(notify.initial_status("declaration_open", True), ("Skipped", "Opted out of HR email"))
        self.assertEqual(notify.initial_status("declaration_open", False), ("Queued", None))

    def test_failures_retry_then_stop(self):
        self.assertEqual(notify.after_mark("Failed", 0), ("Queued", 1))
        self.assertEqual(notify.after_mark("Failed", 2), ("Failed", 3))
        self.assertEqual(notify.after_mark("Sent", 1), ("Sent", 1))

    def test_long_keys_stay_unique_and_short(self):
        a, b = notify.row_key("x" * 200, "a@x"), notify.row_key("x" * 200, "b@x")
        self.assertNotEqual(a, b)
        self.assertLessEqual(len(a), notify.KEY_MAX)
        self.assertEqual(notify.row_key("leave-decided:L1", "a@x"), "leave-decided:L1:a@x")


class OutboxTests(unittest.TestCase):
    def setUp(self):
        self.store = {"User": [
            {"name": "thandi@x", "email": "thandi@eswasa.example", "mobile_no": "+26876000000", "enabled": 1, notify.OPT_OUT: 0},
            {"name": "quiet@x", "email": "quiet@eswasa.example", "enabled": 1, notify.OPT_OUT: 1},
            {"name": "gone@x", "email": "gone@eswasa.example", "enabled": 0},
        ]}
        ff.install(self.store, doctypes=(notify.DOCTYPE,), meta_fields={"User": (notify.OPT_OUT,)})
        self.addCleanup(ff.uninstall)

    def _rows(self):
        return self.store[notify.DOCTYPE]

    def test_queue_dedupes_by_key_and_keeps_only_declared_context(self):
        ctx = {"decision": "approved", "from_date": "2 Nov 2026", "to_date": "6 Nov 2026", "reason": "private"}
        self.assertEqual(notify.queue("leave-decided:L1", ["thandi@x", None, "Administrator"], "leave_decided", ctx), 1)
        self.assertEqual(notify.queue("leave-decided:L1", ["thandi@x"], "leave_decided", ctx), 0)
        row = self._rows()[0]
        self.assertEqual((row["key"], row["status"], row["to_user"]), ("leave-decided:L1:thandi@x", "Queued", "thandi@x"))
        self.assertNotIn("private", row["context"])

    def test_opt_out_skips_non_essential_but_decisions_still_send(self):
        notify.queue("decl-open:E1:2026", ["quiet@x"], "declaration_open", {"year_label": "2026/27"})
        notify.queue("leave-decided:L2", ["quiet@x"], "leave_decided", {"decision": "approved"})
        self.assertEqual([(r["template"], r["status"]) for r in self._rows()], [("declaration_open", "Skipped"), ("leave_decided", "Queued")])

    def test_external_address_for_applicants(self):
        notify.queue("applied:APP-1", [], "application_received", {"applicant_name": "Sipho", "job_title": "Auditor", "reference": "APP-1"},
                     to_address="sipho@mail.example")
        self.assertEqual(self._rows()[0]["to_address"], "sipho@mail.example")
        self.assertIsNone(self._rows()[0]["to_user"])

    def test_unknown_template_and_missing_doctype(self):
        with self.assertRaises(ValueError):
            notify.queue("k", ["thandi@x"], "case_update", {})
        ff.install(self.store, doctypes=())
        self.assertEqual(notify.queue("k", ["thandi@x"], "leave_decided", {}), 0)

    def test_pending_renders_and_resolves_addresses_for_system_manager_only(self):
        notify.queue("leave-decided:L1", ["thandi@x", "gone@x"], "leave_decided", {"decision": "not approved", "from_date": "2 Nov 2026", "to_date": "6 Nov 2026"})
        notify.queue("sms:1", ["thandi@x"], "declaration_open", {"year_label": "2026/27"}, channel="sms")
        out = notify.pending_impl(10)
        self.assertEqual([(m["to"], m["channel"]) for m in out], [("thandi@eswasa.example", "email"), (None, "email"), ("+26876000000", "sms")])
        self.assertEqual(out[0]["subject"], "Your leave request was not approved")
        self.assertIn("2 Nov 2026 to 6 Nov 2026", out[0]["body"])
        f = ff.install(self.store, roles=("HR Manager",), doctypes=(notify.DOCTYPE,))
        with self.assertRaises(f.PermissionError):
            notify.pending_impl()
        with self.assertRaises(f.PermissionError):
            notify.mark_impl(out[0]["name"], "Sent")

    def test_mark_sent_failed_and_retry(self):
        notify.queue("leave-decided:L1", ["thandi@x"], "leave_decided", {})
        name = self._rows()[0]["name"]
        self.assertEqual(notify.mark_impl(name, "Failed", "SMTP down"), {"name": name, "status": "Queued", "attempts": 1})
        self.assertEqual(self._rows()[0]["error"], "SMTP down")
        self.assertEqual(notify.mark_impl(name, "Sent")["status"], "Sent")
        self.assertEqual(self._rows()[0]["sent_on"].date().isoformat(), "2026-10-16")
        self.assertEqual(notify.pending_impl(), [])
        f = ff.install(self.store, doctypes=(notify.DOCTYPE,))
        with self.assertRaises(f.ValidationError):
            notify.mark_impl(name, "Queued")
        self.assertEqual(json.loads(self._rows()[0]["context"]), {"decision": "", "from_date": "", "to_date": ""})


if __name__ == "__main__":
    unittest.main()
