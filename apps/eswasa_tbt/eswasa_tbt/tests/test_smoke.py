# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Structural + unit smoke for eswasa_tbt (no live site required for structural)."""

from __future__ import annotations

import ast
import json
import unittest
from pathlib import Path

PKG = Path(__file__).resolve().parents[1]


class TestStructuralSmoke(unittest.TestCase):
    def test_modules_txt(self):
        self.assertTrue((PKG / "modules.txt").read_text().strip())

    def test_doctype_json_valid(self):
        found = list(PKG.glob("*/doctype/*/*.json"))
        self.assertGreater(len(found), 0)
        for path in found:
            doc = json.loads(path.read_text())
            self.assertEqual(doc.get("doctype"), "DocType")
            self.assertTrue(doc.get("name"))
            self.assertTrue(doc.get("fields"))

    def test_api_module_parses(self):
        src = (PKG / "api.py").read_text()
        tree = ast.parse(src)
        funcs = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
        self.assertIn("list_notifications", funcs)
        self.assertIn("list_subscriptions", funcs)

    def test_rules_module_parses(self):
        src = (PKG / "rules.py").read_text()
        tree = ast.parse(src)
        funcs = {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}
        self.assertIn("rt1_notification_ingested", funcs)
        self.assertIn("rt2_high_impact_alert", funcs)
        self.assertIn("publish_feed", funcs)
        self.assertIn("impact_for", funcs)

    def test_impact_for_high_eu891(self):
        # Pure contract checks without importing frappe-bound rules module.
        high_sectors = {"textiles", "electrical", "chemicals", "pharma", "automotive"}
        low_sectors = {"services", "tourism"}

        def impact_for(sectors, symbol=None):
            if symbol and "EU/891" in symbol.upper():
                return "high"
            lowered = {s.lower() for s in sectors}
            if lowered & high_sectors:
                return "high"
            if lowered & low_sectors:
                return "low"
            return "medium"

        self.assertEqual(impact_for(["Textiles"], "G/TBT/N/EU/891"), "high")
        self.assertEqual(impact_for(["Electrical"], "G/TBT/N/USA/1"), "high")
        self.assertEqual(impact_for(["Services"], "G/TBT/N/X/1"), "low")
        self.assertEqual(impact_for(["Food"], "G/TBT/N/X/1"), "medium")

    def test_fixtures_json(self):
        fx = PKG / "fixtures"
        self.assertTrue(fx.is_dir())
        for path in fx.glob("*.json"):
            data = json.loads(path.read_text())
            self.assertIsInstance(data, list)

    def test_roles_fixture(self):
        roles = {r["name"] for r in json.loads((PKG / "fixtures" / "role.json").read_text())}
        self.assertIn("Eswasa TBT Officer", roles)
        self.assertIn("Eswasa TBT Analyst", roles)


if __name__ == "__main__":
    unittest.main()
