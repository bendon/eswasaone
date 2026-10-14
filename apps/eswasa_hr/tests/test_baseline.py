"""Provisional Eswatini baseline — the guards, the pure rules, and the data files checked against the code that reads them."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import date

from eswasa_hr import baseline as bl
from eswasa_hr import cases, demo_seed, issued_items, letters, master_data_load, milestones
from eswasa_hr import employee_import as imp

POLICY = bl.read("policy.json")
ORG = bl.read("organisation.json")
MASTER = bl.read("master_data.json")
RECORDS = bl.csv_rows(bl.read("staff_records.csv"))


def _rows(name: str, pass_no: int) -> list[dict]:
    table = [list(r.values()) for r in bl.csv_rows(bl.read(name))]
    header = list(bl.csv_rows(bl.read(name))[0])
    rows, errs = imp.read_table([header, *table], pass_no)
    assert not errs, errs
    return rows


class GuardTests(unittest.TestCase):
    def test_staging_and_demo_sites_only(self):
        self.assertIn("Staging and demo sites only", bl.refusal({}))
        self.assertIn("Staging and demo sites only", bl.refusal({"eswasa_hr_baseline": 0}))
        self.assertIsNone(bl.refusal({"eswasa_hr_baseline": 1}))
        self.assertIsNone(bl.refusal({"eswasa_demo_seed": 1}))
        self.assertIn("bare domain", bl.refusal({"eswasa_hr_baseline": 1, "eswasa_demo_mail_domain": "qa@x.org"}))

    def test_after_migrate_is_a_no_op_without_the_flag(self):
        fake = types.ModuleType("frappe")
        fake.conf = {}
        called = []
        sys.modules["frappe"] = fake
        original = bl.run
        bl.run = lambda *a, **k: called.append(1)
        try:
            bl.after_migrate()
        finally:
            bl.run = original
            del sys.modules["frappe"]
        self.assertEqual(called, [])


class RuleTests(unittest.TestCase):
    def test_leave_period_contains_today(self):
        self.assertEqual(bl.period_for(date(2026, 10, 14), 1, 1), (date(2026, 1, 1), date(2026, 12, 31)))
        self.assertEqual(bl.period_for(date(2026, 2, 10), 4, 1), (date(2025, 4, 1), date(2026, 3, 31)))
        self.assertEqual(bl.period_for(date(2026, 4, 1), 4, 1), (date(2026, 4, 1), date(2027, 3, 31)))

    def test_only_empty_settings_are_written(self):
        got = bl.fill_empty({"a": 6, "b": None, "c": "", "d": 0}, {"a": 3, "b": 12, "c": ["Laptop", "Keys"], "d": 100})
        self.assertEqual(got, {"b": 12, "c": "Laptop\nKeys", "d": 100})

    def test_staff_files_take_the_sites_demo_domain(self):
        self.assertEqual(bl.with_domain("a.b@eswasa.demo,c@eswasa.demo", "QA.Example.org"), "a.b@qa.example.org,c@qa.example.org")
        self.assertEqual(bl.with_domain("a@eswasa.demo", None), "a@eswasa.demo")

    def test_staffing_rows_never_go_below_who_is_there(self):
        rows = bl.staffing_rows([{"designation": "Lead Auditor", "positions": 4}, {"designation": "Driver", "positions": 1}],
                                {"Lead Auditor": 3, "Driver": 2})
        self.assertEqual(rows[0], {"designation": "Lead Auditor", "vacancies": 1, "current_count": 3, "number_of_positions": 4})
        self.assertEqual(rows[1]["vacancies"], 0)
        self.assertEqual(rows[1]["number_of_positions"], 2)

    def test_a_failing_step_becomes_a_skip_reason(self):
        out = {"skipped": {}}
        bl.block(out, "leave_policy", lambda: (_ for _ in ()).throw(ValueError("No Leave Type")))
        bl.block(out, "expense_types", lambda: None)
        self.assertEqual(out["skipped"]["leave_policy"], "ValueError: No Leave Type")
        self.assertEqual(out["skipped"]["expense_types"], "not available on this site")


class MasterDataTests(unittest.TestCase):
    def test_master_data_loads_cleanly(self):
        skills = {c["skill_name"].lower() for c in POLICY["competences"]}
        self.assertEqual(master_data_load.file_errors(MASTER, {"skills": skills}), [])
        self.assertFalse(MASTER.get("example"))

    def test_holidays_cover_eswatini_public_holidays_and_weekends(self):
        days = {h["date"]: h for h in MASTER["holiday_list"]["holidays"]}
        for d in ("2026-04-25", "2026-07-22", "2026-12-25", "2027-09-06"):
            self.assertIn(d, days)
            self.assertFalse(days[d].get("weekly_off"), d)
        self.assertTrue(days["2026-10-17"]["weekly_off"])  # a Saturday
        self.assertNotIn("2026-10-14", days)  # a Wednesday


class PolicyTests(unittest.TestCase):
    def test_a_letter_wording_for_every_letter_type(self):
        self.assertEqual(set(POLICY["letter_wording"]), {t["wording"] for t in letters.LETTER_TYPES.values()})

    def test_wording_uses_only_placeholders_the_letter_fills(self):
        for lt, spec in letters.LETTER_TYPES.items():
            known = set(letters.PERSON_FIELDS) | set(letters.SOURCE_FIELDS[lt]) | {"addressed_to", "purpose"}
            used = set(letters._PLACEHOLDER.findall(POLICY["letter_wording"][spec["wording"]]))
            self.assertLessEqual(used, known, lt)

    def test_offences_use_the_codes_levels_and_sanctions(self):
        codes = [o["code"] for o in POLICY["disciplinary_offences"]]
        self.assertEqual(len(codes), len(set(codes)))
        for o in POLICY["disciplinary_offences"]:
            self.assertIn(o["level"], cases.LEVELS)
            self.assertIn(o["suggested_sanction"], cases.SANCTIONS)
        for sanction in cases.WARNING_MONTHS.values():
            self.assertGreater(POLICY["hr_settings"][sanction], 0)

    def test_item_types_and_milestones_parse(self):
        self.assertGreaterEqual(len(issued_items.parse_types("\n".join(POLICY["hr_settings"]["custom_issued_item_types"]))), 5)
        self.assertEqual(milestones.parse_years(POLICY["hr_settings"]["custom_service_milestones"]), [5, 10, 15, 20, 25, 30])

    def test_leave_policy_stays_within_each_leave_type(self):
        caps = {t["leave_type_name"]: t.get("max_leaves_allowed") for t in POLICY["leave_types"]}
        for name, days in POLICY["leave_policy"]["allocations"].items():
            self.assertLessEqual(days, caps[name], name)

    def test_required_documents_are_known_kinds_for_known_types(self):
        kinds = {"ID", "Contract", "Qualification", "Impartiality declaration", "Work permit", "Professional registration", "Other"}
        etypes = {e["name"] for e in MASTER["employment_types"]}
        for etype, docs in POLICY["required_documents"].items():
            self.assertIn(etype, etypes)
            self.assertLessEqual({d["document_type"] for d in docs}, kinds)


class StaffTests(unittest.TestCase):
    def lookups(self) -> dict:
        def table(names):
            return {n.lower(): n for n in names}

        depts = [d["name"] for d in MASTER["departments"]]
        groups = {d["parent"] for d in MASTER["departments"] if d["parent"]}
        return {
            "genders": table(["Male", "Female"]),
            "departments": table(depts),
            "leaf_departments": set(depts) - groups,
            "designations": table(d["name"] for d in MASTER["designations"]),
            "grades": table(g["name"] for g in MASTER["grades"]),
            "branches": table(b["name"] for b in MASTER["branches"]),
            "employment_types": table(e["name"] for e in MASTER["employment_types"]),
            "holiday_lists": table([MASTER["holiday_list"]["name"]]),
            "cost_centers": {},
            "leave_types": table(t["leave_type_name"] for t in POLICY["leave_types"]),
        }

    def test_every_record_passes_the_pass_1_checks(self):
        rows = _rows("staff_records.csv", 1)
        lookups = self.lookups()
        dup = {k[0] for k in imp.duplicates(rows, "employee_number")}
        self.assertEqual(dup, set())
        for r in rows:
            _clean, errs = imp.validate_row(r, lookups, dup)
            self.assertEqual(errs, [], r["employee_number"])

    def test_about_eighty_five_people_with_the_journey(self):
        self.assertEqual(len(RECORDS) + len(demo_seed.HIRES), 85)

    def test_links_logins_and_balances_refer_to_staff(self):
        numbers = {r["Staff number"] for r in RECORDS}
        logins = {r["employee_number"]: r["user_id"] for r in _rows("staff_logins.csv", 2)}
        self.assertEqual(set(logins), numbers)
        self.assertEqual(len(set(logins.values())), len(logins))
        for r in _rows("staff_lines.csv", 2):
            self.assertIn(r["employee_number"], numbers)
            if r.get("reports_to"):
                self.assertIn(r["reports_to"], numbers)
            self.assertIn(r["leave_approver"], set(logins.values()))
            self.assertNotEqual(r["leave_approver"], logins[r["employee_number"]], "nobody approves their own leave")
        lookups = self.lookups()
        caps = {t["leave_type_name"]: t.get("max_leaves_allowed") for t in POLICY["leave_types"]}
        for r in _rows("staff_leave.csv", 3):
            self.assertIn(r["employee_number"], numbers)
            self.assertIn(r["leave_type"].lower(), lookups["leave_types"])
            self.assertLessEqual(float(r["balance"]), caps[r["leave_type"]])

    def test_import_order_is_records_then_links_then_balances(self):
        self.assertEqual([f["pass"] for f in ORG["staff_import"]], sorted(f["pass"] for f in ORG["staff_import"]))
        for f in ORG["staff_import"]:
            self.assertTrue((bl.DATA / f["file"]).exists(), f["file"])


class OrganisationTests(unittest.TestCase):
    def test_every_department_has_a_head_and_posts_for_its_staff(self):
        numbers = {r["Staff number"]: r for r in RECORDS}
        leaves = {d["name"] for d in MASTER["departments"] if d["parent"]}
        self.assertEqual(set(ORG["heads"]), leaves)
        self.assertEqual({e["department"] for e in ORG["establishment"]}, leaves)
        for dept, number in ORG["heads"].items():
            self.assertEqual(numbers[number]["Department"], dept)
        for e in ORG["establishment"]:
            for p in e["posts"]:
                filled = sum(1 for r in RECORDS if r["Department"] == e["department"] and r["Designation"] == p["designation"])
                self.assertGreaterEqual(p["positions"], filled, (e["department"], p["designation"]))

    def test_there_is_a_vacancy_for_each_demo_hire(self):
        for h in demo_seed.HIRES:
            plan = next(e for e in ORG["establishment"] if e["department"] == h["department"])
            post = next(p for p in plan["posts"] if p["designation"] == h["designation"])
            filled = sum(1 for r in RECORDS if r["Department"] == h["department"] and r["Designation"] == h["designation"])
            self.assertGreater(post["positions"], filled, h["key"])

    def test_one_executive_director_and_roles_for_real_staff(self):
        numbers = {r["Staff number"] for r in RECORDS}
        self.assertLessEqual(set(ORG["roles"]), numbers)
        eds = [n for n, roles in ORG["roles"].items() if "Eswasa Executive Director" in roles]
        self.assertEqual(len(eds), 1)

    def test_demo_cast_is_in_the_staff_file(self):
        by_number = {r["Staff number"]: r for r in RECORDS}
        for key, c in demo_seed.STAFF.items():
            r = by_number[c["employee_number"]]
            self.assertEqual((r["First name"], r["Last name"]), (c["profile"]["first"], c["profile"]["last"]), key)
        self.assertEqual(ORG["heads"]["Certification"], demo_seed.STAFF["cert_head"]["employee_number"])


if __name__ == "__main__":
    unittest.main()
