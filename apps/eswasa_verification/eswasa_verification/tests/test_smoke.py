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
		self.assertGreater(len(funcs), 0)

	def test_fixtures_json(self):
		fx = PKG / "fixtures"
		self.assertTrue(fx.is_dir())
		for path in fx.glob("*.json"):
			data = json.loads(path.read_text())
			self.assertIsInstance(data, list)


if __name__ == "__main__":
	unittest.main()
