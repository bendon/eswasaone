"""Overview, Board HR pack and setup (H0, H15, H14) — ranking, turnover, gaps, and setup on an empty site."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from types import SimpleNamespace

from eswasa_hr import overview as ov


class RuleTests(unittest.TestCase):
    def test_turnover(self):
        self.assertEqual(ov.turnover_pct(7, 86, 12), 8.4)
        self.assertIsNone(ov.turnover_pct(0, 0, 0))

    def test_attention_titles_and_order(self):
        a = ov.attention("leave", 1, "1 leave request waiting", "{n} leave requests waiting", "/hr/time-off")
        b = ov.attention("probation", 3, "1 probation review due", "{n} probation reviews due", "/hr/directory", date(2026, 10, 20))
        c = ov.attention("alert", 2, "1 contract ends", "{n} contracts end", "/hr/directory", "2026-10-15")
        z = ov.attention("offer", 0, "1 offer", "{n} offers", "/hr/recruitment")
        self.assertEqual(a["title"], "1 leave request waiting")
        self.assertEqual(b["title"], "3 probation reviews due")
        self.assertEqual([i["kind"] for i in ov.rank([a, b, c, z])], ["alert", "probation", "leave"])

    def test_progress_ignores_excluded_steps(self):
        steps = [ov.step("a", "A", ov.DONE, ""), ov.step("b", "B", ov.AWAITING, ""), ov.step("p", "Payroll", ov.EXCLUDED, "")]
        self.assertEqual(ov.progress(steps), {"done": 1, "total": 2, "pct": 50})

    def test_record_gaps(self):
        rows = [{"department": "Finance", "designation": "Accountant", "reports_to": None, "leave_approver": "a@x", "user_id": None}, {"department": None}]
        gaps = {g["field"]: g["count"] for g in ov.record_gaps(rows)}
        self.assertEqual((gaps["department"], gaps["reports_to"], gaps["user_id"]), (1, 2, 2))


class _Err(Exception):
    pass


def _empty_site(roles):
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user="hrm@x")
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (_Err,), {}))

    def throw(msg, exc=_Err):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda: list(roles)
    f.db = SimpleNamespace(exists=lambda *a, **k: False, count=lambda *a, **k: 0, get_value=lambda *a, **k: None)
    f.get_all = lambda *a, **k: []
    sys.modules["frappe"] = f
    return f


class SetupTests(unittest.TestCase):
    def tearDown(self):
        sys.modules.pop("frappe", None)

    def test_empty_site_is_all_to_do_with_links_and_no_waiting(self):
        _empty_site(["HR Manager"])
        out = ov.setup_status_impl()
        by = {s["id"]: s for s in out["steps"]}
        # Everything is to do, except the disciplinary code, which waits on ESWASA (A1).
        self.assertEqual({s["state"] for s in out["steps"] if s["id"] != "disciplinary_code"}, {ov.TODO})
        self.assertTrue(all(s["awaiting"] is None for s in out["steps"] if s["id"] != "disciplinary_code"))
        self.assertEqual((by["disciplinary_code"]["state"], by["disciplinary_code"]["awaiting"]), (ov.AWAITING, "A1"))
        self.assertIn("Awaiting ESWASA (A1)", by["disciplinary_code"]["detail"])
        self.assertEqual(by["disciplinary_code"]["href"], "/hr/cases/code")
        self.assertEqual(by["import"]["href"], "/system-admin?tab=hr-setup#hr-import")
        self.assertFalse(by["import"]["desk"])
        self.assertNotIn("payroll", by)  # payroll is off
        self.assertEqual(out["total"], len(out["steps"]))
        self.assertEqual(out["done"], 0)

    def test_record_gap_detail_names_the_gaps_and_when_checked(self):
        q = [{"field": "reports_to", "label": "No line manager", "count": 3}, {"field": "user_id", "label": "No login linked", "count": 5},
             {"field": "executive_director", "label": "No Executive Director set", "count": 1}]
        self.assertEqual(ov.gaps_detail(q, None), "No login linked (5) · No line manager (3). Checked just now.")
        self.assertEqual(ov.gaps_detail(q, "2026-10-12 02:00:05"), "No login linked (5) · No line manager (3). Checked 2026-10-12 02:00.")
        self.assertIsNone(ov.gaps_detail(q[2:], None))

    def test_only_hr_managers_and_admins(self):
        f = _empty_site(["HR User"])
        with self.assertRaises(f.PermissionError):
            ov.setup_status_impl()


if __name__ == "__main__":
    unittest.main()
