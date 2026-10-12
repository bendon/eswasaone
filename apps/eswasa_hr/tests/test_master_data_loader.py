"""Plan 09 master-data loader: refuses the example, idempotent re-runs, never deletes, reports missing departments."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest import mock

from eswasa_hr import master_data_load as md
from tests import _fakefrappe as ff

EXAMPLE = Path(__file__).resolve().parents[3] / "eswasa_core" / "fixtures" / "hr" / "eswasa_master_data.example.json"

# Test-only shapes (not ESWASA data).
DATA = {
    "branches": [{"name": "Branch A"}],
    "employment_types": [{"name": "Type A"}],
    "grades": [{"name": "GA"}],
    "departments": [{"name": "Child", "parent": "Division"}, {"name": "Division"}],
    "designations": [{"name": "Post A", "grade": "GA", "skills": ["Skill A"]}],
    "holiday_list": {"name": "List A", "from_date": "2026-01-01", "to_date": "2026-12-31", "holidays": [{"date": "2026-04-25", "description": "Day A"}]},
}


class RuleTests(unittest.TestCase):
    def test_the_committed_example_is_refused(self):
        data = json.loads(EXAMPLE.read_text())
        self.assertTrue(data["example"])
        self.assertIn("example", md.file_errors(data)[0])

    def test_parents_come_first_and_loops_are_reported(self):
        order, errs = md.department_order(DATA["departments"])
        self.assertEqual([d["name"] for d in order], ["Division", "Child"])
        self.assertEqual(errs, [])
        _order, errs = md.department_order([{"name": "A", "parent": "B"}, {"name": "B", "parent": "A"}])
        self.assertIn("loop", errs[0])

    def test_unknown_references(self):
        errs = md.file_errors({"departments": [{"name": "X", "parent": "Nowhere"}], "designations": [{"name": "P", "grade": "G9", "skills": ["S"]}]})
        self.assertEqual(len(errs), 3)
        self.assertEqual(md.file_errors(DATA, {"skills": {"skill a"}}), [])

    def test_duplicates_and_bad_holidays(self):
        errs = md.file_errors({"branches": [{"name": "A"}, {"name": "a"}], "holiday_list": {"name": "L", "from_date": "2026-01-01", "to_date": "2026-12-31",
                                                                                       "holidays": [{"date": "2027-01-01"}]}})
        self.assertEqual(len(errs), 2)

    def test_blank_never_clears(self):
        self.assertEqual(md.changes({"a": "x", "b": "y"}, {"a": None, "b": "z"}), {"b": "z"})


class LoaderTests(unittest.TestCase):
    def setUp(self):
        self.store = {
            "Company": [{"name": "ESWASA"}],
            "Department": [{"name": "All Departments", "department_name": "All Departments", "is_group": 1, "company": None, "disabled": 0},
                           {"name": "Old - ESW", "department_name": "Old", "is_group": 0, "company": "ESWASA", "disabled": 0}],
            "Skill": [{"name": "Skill A", "skill_name": "Skill A"}],
            "Holiday List": [],
        }
        self.f = ff.install(self.store, roles=("System Manager",), doctypes=tuple(md.TYPES.values()) + ("Skill",))
        self.addCleanup(ff.uninstall)
        plain = self.f.get_doc
        store = self.store

        def get_doc(d, *a):
            doc = plain(d, *a)
            if a:
                rows = store[d]

                def save():
                    rows[next(i for i, r in enumerate(rows) if r["name"] == a[0])] = dict(doc)

                doc.save = save
                doc.append = lambda table, row: doc.setdefault(table, []).append(dict(row))
            return doc

        self.f.get_doc = get_doc
        p = mock.patch("eswasa_hr.recruitment._company", return_value="ESWASA")
        p.start()
        self.addCleanup(p.stop)

    def test_example_refused_and_nothing_written(self):
        out = md.load(json.loads(EXAMPLE.read_text()))
        self.assertFalse(out["ok"])
        self.assertEqual(len(self.store["Department"]), 2)

    def test_needs_system_manager(self):
        ff.uninstall()
        self.f = ff.install(self.store, roles=("HR Manager",))
        with self.assertRaises(self.f.PermissionError):
            md.load(DATA)

    def test_load_then_rerun_is_unchanged(self):
        first = md.load(DATA)
        self.assertTrue(first["ok"], first["errors"])
        self.assertEqual(first["counts"]["departments"], {"created": 2, "updated": 0, "unchanged": 0})
        child = next(r for r in self.store["Department"] if r["department_name"] == "Child")
        division = next(r for r in self.store["Department"] if r["department_name"] == "Division")
        self.assertEqual((child["parent_department"], division["is_group"], division["parent_department"]), (division["name"], 1, "All Departments"))
        post = next(r for r in self.store["Designation"])
        self.assertEqual((post["custom_grade"], post["skills"]), ("GA", [{"skill": "Skill A"}]))
        self.assertEqual(self.store["Holiday List"][0]["holidays"][0]["holiday_date"], "2026-04-25")
        self.assertEqual(self.store["Company"][0]["default_holiday_list"], "List A")

        again = md.load(DATA)
        for section, counts in again["counts"].items():
            with self.subTest(section=section):
                self.assertEqual(counts["created"] + counts["updated"], 0)
        self.assertEqual(len(self.store["Department"]), 4)

    def test_no_deletes_missing_departments_reported(self):
        out = md.load(DATA)
        self.assertEqual(out["missing_departments"], ["Old - ESW"])
        old = next(r for r in self.store["Department"] if r["name"] == "Old - ESW")
        self.assertEqual(old["disabled"], 0)

    def test_dry_run_writes_nothing(self):
        out = md.load(DATA, dry_run=True)
        self.assertTrue(out["ok"], out["errors"])
        self.assertEqual(out["counts"]["departments"]["created"], 2)
        self.assertEqual(len(self.store["Department"]), 2)
        self.assertNotIn("default_holiday_list", self.store["Company"][0])


if __name__ == "__main__":
    unittest.main()
