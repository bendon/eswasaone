"""Guard helpers — no Frappe required."""

from __future__ import annotations

import unittest

from eswasa_certification.workflow_map import normalize_action, workflow_action_label


class GuardHelperTests(unittest.TestCase):
    def test_reason_actions_normalize(self):
        self.assertEqual(normalize_action("Return to Draft"), "return to draft")
        self.assertEqual(normalize_action("Withdraw"), "withdraw")

    def test_labels(self):
        self.assertEqual(workflow_action_label("raise_nc"), "Raise NC")
        self.assertEqual(workflow_action_label("Notify Subscribers"), "Notify Subscribers")


if __name__ == "__main__":
    unittest.main()
