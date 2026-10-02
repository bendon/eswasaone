"""Structural smoke for eswasa_ingest."""

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
        found = list(PKG.glob("**/doctype/*/*.json"))
        self.assertGreater(len(found), 0)
        for path in found:
            doc = json.loads(path.read_text())
            self.assertEqual(doc.get("doctype"), "DocType")
            self.assertTrue(doc.get("name"))

    def test_rules_module_parses(self):
        src = (PKG / "rules.py").read_text()
        tree = ast.parse(src)
        funcs = {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}
        self.assertIn("rt3_needs_review", funcs)
        self.assertIn("is_authoritative", funcs)
        self.assertIn("needs_review", funcs)

    def test_api_authoritative_filter(self):
        src = (PKG / "api.py").read_text()
        self.assertIn('"status": "Approved"', src)
        # R-T3 gate: Pending Review must not be in the public citation filter.
        self.assertNotIn('["Approved", "Pending Review"]', src)

    def test_roles_fixture(self):
        roles = {r["name"] for r in json.loads((PKG / "fixtures" / "role.json").read_text())}
        self.assertIn("Ingest Curator", roles)
        self.assertIn("Ingest Viewer", roles)


if __name__ == "__main__":
    unittest.main()
