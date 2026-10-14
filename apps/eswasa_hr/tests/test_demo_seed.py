"""Demo people seed — the guards, the timeline and the cast, no Frappe."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date

from eswasa_hr import demo_seed as seed


class GuardTests(unittest.TestCase):
    def test_refuses_without_the_demo_flag(self):
        self.assertIn("Demo sites only", seed.refusal({}))
        self.assertIn("Demo sites only", seed.refusal({"eswasa_demo_seed": 0, "eswasa_demo_password": "x"}))

    def test_needs_a_password_and_a_bare_domain(self):
        self.assertIn("password", seed.refusal({"eswasa_demo_seed": 1}))
        self.assertIn("bare domain", seed.refusal({"eswasa_demo_seed": 1, "eswasa_demo_password": "x",
                                                   "eswasa_demo_mail_domain": "qa@x.org"}))
        self.assertIsNone(seed.refusal({"eswasa_demo_seed": 1, "eswasa_demo_password": "x"}))

    def test_after_migrate_is_a_no_op_without_the_flag(self):
        fake = types.ModuleType("frappe")
        fake.conf = {}
        called = []
        sys.modules["frappe"] = fake
        original = seed.run
        seed.run = lambda *a, **k: called.append(1)
        try:
            seed.after_migrate()
        finally:
            seed.run = original
            del sys.modules["frappe"]
        self.assertEqual(called, [])


class AddressTests(unittest.TestCase):
    def test_addresses_never_reach_a_real_mailbox(self):
        self.assertEqual(seed.work_email("Lindiwe", "Mamba"), "lindiwe.mamba@eswasa.demo")
        self.assertEqual(seed.work_email("Lindiwe", "Mamba", "Demo.Example.org"), "lindiwe.mamba@demo.example.org")
        self.assertEqual(seed.personal_email("Sibusiso", "Maseko"), "sibusiso.maseko@example.com")


class TimelineTests(unittest.TestCase):
    def test_every_step_follows_the_one_before_and_none_is_in_the_future(self):
        today = date(2026, 10, 14)
        for h in seed.HIRES:
            t = seed.timeline(today, h["joined_days_ago"])
            order = ["raised", "posted", "applied", "closes", "interview", "offer", "boarding", "joined", "signed"]
            self.assertEqual([t[k] for k in order], sorted(t[k] for k in order), h["key"])
            self.assertLessEqual(t["settled"], today, h["key"])
            self.assertLessEqual(t["signed"], today, h["key"])
            self.assertGreater(t["probation_ends"], t["joined"])

    def test_probation_end_handles_short_months(self):
        self.assertEqual(seed._add_months(date(2026, 8, 31), 6), date(2027, 2, 28))
        self.assertEqual(seed._add_months(date(2026, 7, 11), 6), date(2027, 1, 11))

    def test_tasks_are_spread_from_boarding_to_settled(self):
        t = seed.timeline(date(2026, 10, 14), 60)
        days = [seed.task_done_on(t, i, 9) for i in range(9)]
        self.assertEqual(days, sorted(days))
        self.assertGreater(days[0], t["boarding"])
        self.assertEqual(days[-1], t["settled"])

    def test_joiners_earn_leave_from_the_day_they_join(self):
        start, end = date(2026, 1, 1), date(2026, 12, 31)
        self.assertEqual(seed.prorated_leave(20, date(2015, 3, 1), start, end), 20)
        self.assertEqual(seed.prorated_leave(20, date(2026, 7, 2), start, end), 10)
        self.assertEqual(seed.prorated_leave(20, date(2027, 1, 5), start, end), 0)


class CastTests(unittest.TestCase):
    def test_four_eyes_is_possible(self):
        hr = [k for k, p in seed.STAFF.items() if "HR Manager" in p["roles"]]
        self.assertGreaterEqual(len(hr), 2, "the requisition and the offer each need a second HR Manager")
        self.assertIn("hr_lead", hr)
        self.assertIn("hr_second", hr)

    def test_managers_are_seeded_before_their_reports(self):
        for key, p in seed.STAFF.items():
            if p["boss"]:
                self.assertIn(p["boss"], seed.STAFF)
                self.assertIsNone(seed.STAFF[p["boss"]]["boss"], f"{p['boss']} must be seeded before {key}")

    def test_hires_are_distinct_and_complete(self):
        keys = {h["key"] for h in seed.HIRES}
        self.assertEqual(len(keys), len(seed.HIRES))
        names = {(h["first"], h["last"]) for h in seed.HIRES} | {(p["first"], p["last"]) for p in seed.STAFF.values()}
        self.assertEqual(len(names), len(seed.HIRES) + len(seed.STAFF))
        for h in seed.HIRES:
            for field in ("designation", "department", "description", "dob", "gender", "phone", "bank", "kin"):
                self.assertTrue(h.get(field), f"{h['key']} needs {field}")
            self.assertTrue(h["phone"].startswith("+268 7"), h["key"])
            shares = [d[5] for d in h["dependants"]]
            if shares:
                self.assertEqual(sum(shares), 100, f"{h['key']} beneficiary shares")

    def test_a_failing_block_becomes_a_skip_reason(self):
        out = {"skipped": {}}
        seed.block(out, "leave", lambda: (_ for _ in ()).throw(ValueError("No active Leave Period on this site")))
        seed.block(out, "issued_items", lambda: None)
        seed.block(out, "hire_lindiwe", lambda: {"employee": "HR-EMP-00021"})
        self.assertEqual(out["skipped"]["leave"], "ValueError: No active Leave Period on this site")
        self.assertEqual(out["skipped"]["issued_items"], "not available on this site")
        self.assertEqual(out["hire_lindiwe"], {"employee": "HR-EMP-00021"})


if __name__ == "__main__":
    unittest.main()
