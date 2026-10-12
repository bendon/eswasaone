"""Staging e2e seed (plan 10 step 5) — the pure guards, no Frappe."""

from __future__ import annotations

import unittest
from datetime import date

from eswasa_hr import e2e_seed as seed


class SeedTests(unittest.TestCase):
    def test_refuses_without_the_staging_flag(self):
        self.assertIn("Staging only", seed.refusal({}))
        self.assertIn("Staging only", seed.refusal({"eswasa_e2e_seed": 0, "eswasa_e2e_password": "x"}))

    def test_needs_a_password_and_a_persona_mailbox(self):
        self.assertIn("password", seed.refusal({"eswasa_e2e_seed": 1}))
        self.assertIn("{persona}", seed.refusal({"eswasa_e2e_seed": 1, "eswasa_e2e_password": "x", "eswasa_e2e_mailbox": "qa@x.org"}))
        self.assertIsNone(seed.refusal({"eswasa_e2e_seed": 1, "eswasa_e2e_password": "x"}))
        self.assertIsNone(seed.refusal({"eswasa_e2e_seed": 1, "eswasa_e2e_password": "x", "eswasa_e2e_mailbox": "qa+{persona}@x.org"}))

    def test_persona_email(self):
        self.assertEqual(seed.persona_email(None, "hr_manager_2"), "e2e-hr-manager-2@eswasa.test")
        self.assertEqual(seed.persona_email("QA+{persona}@X.org", "employee"), "qa+employee@x.org")

    def test_guard_dates_line_up(self):
        d = seed.dates(date(2026, 10, 12))
        self.assertLess(d["expiring_valid_to"], d["visit"])  # expired by the visit, valid today
        self.assertEqual(d["alert_valid_to"], "2026-12-11")  # exactly 60 days: R-H3's first threshold
        self.assertGreater(d["far_valid_to"], d["visit"])

    def test_every_persona_reports_to_a_seeded_manager(self):
        for key, (_, roles, boss) in seed.PERSONAS.items():
            self.assertIn("Employee", roles, key)
            if boss:
                self.assertIn(boss, seed.PERSONAS)
                self.assertIsNone(seed.PERSONAS[boss][2], f"{boss} must be seeded before {key}")

    def test_a_failing_block_becomes_a_skip_reason(self):
        out = {"skipped": {}}
        seed.block(out, "leave", lambda: (_ for _ in ()).throw(ValueError("No active Leave Period")))
        seed.block(out, "leaver", lambda: None)
        seed.block(out, "competence", lambda: {"scheme": "ISO 9001"})
        self.assertEqual(out["skipped"]["leave"], "ValueError: No active Leave Period")
        self.assertEqual(out["skipped"]["leaver"], "not available on this site")
        self.assertEqual(out["competence"], {"scheme": "ISO 9001"})


if __name__ == "__main__":
    unittest.main()
