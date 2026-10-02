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
		self.assertIn("list_approvals", funcs)
		self.assertIn("act_on_approval", funcs)
		self.assertIn("assemble_board_pack", funcs)
		self.assertIn("get_board_pack_summary", funcs)
		self.assertGreater(len(funcs), 0)

	def test_approvals_module_parses(self):
		src = (PKG / "approvals.py").read_text()
		tree = ast.parse(src)
		funcs = {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}
		self.assertIn("list_approval_items", funcs)
		self.assertIn("act_on_approval_item", funcs)
		self.assertIn("_pick_workflow_action", funcs)

	def test_rules_module_parses(self):
		src = (PKG / "rules.py").read_text()
		tree = ast.parse(src)
		funcs = {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}
		self.assertIn("publish_feed", funcs)
		self.assertIn("assemble_pack_for_meeting", funcs)
		self.assertIn("rg1_board_meetings_in_7d", funcs)
		self.assertIn("rg2_resolution_adopted", funcs)
		self.assertIn("rg3_high_risk_alert", funcs)
		self.assertIn("collect_module_report_sections", funcs)

	def test_hooks_wire_rules(self):
		src = (PKG / "hooks.py").read_text()
		self.assertIn("eswasa_governance.rules.rg2_resolution_adopted", src)
		self.assertIn("eswasa_governance.rules.rg3_high_risk_alert", src)
		self.assertIn("eswasa_governance.tasks.run_daily_governance_rules", src)

	def test_risk_has_next_review_date(self):
		path = next(PKG.glob("*/doctype/risk_register_entry/risk_register_entry.json"))
		doc = json.loads(path.read_text())
		fields = {f["fieldname"] for f in doc["fields"]}
		self.assertIn("next_review_date", fields)

	def test_fixtures_json(self):
		fx = PKG / "fixtures"
		self.assertTrue(fx.is_dir())
		for path in fx.glob("*.json"):
			data = json.loads(path.read_text())
			self.assertIsInstance(data, list)


if __name__ == "__main__":
	unittest.main()
