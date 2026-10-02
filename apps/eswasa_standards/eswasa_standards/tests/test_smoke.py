# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""Structural smoke tests — no Frappe runtime required."""

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
		self.assertIn("list_standards", funcs)
		self.assertIn("get_standard", funcs)
		self.assertIn("publish_standard", funcs)

	def test_rules_module_parses(self):
		src = (PKG / "rules.py").read_text()
		tree = ast.parse(src)
		funcs = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
		for name in (
			"rs1_public_review_opened",
			"rs2_review_closing_sweep",
			"rs3_publish_standard",
			"rs4_standard_supersedes",
			"publish_feed",
		):
			self.assertIn(name, funcs)

	def test_hooks_wire_rules(self):
		src = (PKG / "hooks.py").read_text()
		self.assertIn("doc_events", src)
		self.assertIn("scheduler_events", src)
		self.assertIn("eswasa_standards.rules.rs1_rs3_on_work_item_update", src)
		self.assertIn("eswasa_standards.tasks.run_daily_standards_rules", src)

	def test_fixtures_json(self):
		fx = PKG / "fixtures"
		self.assertTrue(fx.is_dir())
		for path in fx.glob("*.json"):
			data = json.loads(path.read_text())
			self.assertIsInstance(data, list)


if __name__ == "__main__":
	unittest.main()
