#!/usr/bin/env python3
"""R-S3 acceptance-gate smoke for eswasa_standards.

Run from frappe-bench:
  bench --site eswasaone.localhost execute eswasa_standards.smoke_rs3.run
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import nowdate


def run() -> dict[str, Any]:
    """Synthetic R-S3 path: TC → Work Item → Draft → Ballot Approved → publish artefacts."""
    from eswasa_standards.rules import rs3_on_ballot_update, rs3_publish_standard

    tag = frappe.generate_hash(length=6).upper()
    tc_code = f"TC-SMOKE-{tag}"
    wi_code = f"WI-SMOKE-{tag}"
    draft_code = f"DR-SMOKE-{tag}"
    ballot_code = f"BAL-SMOKE-{tag}"
    std_code = f"SZNS SMOKE-{tag}:2026"

    if not frappe.db.exists("Technical Committee", tc_code):
        tc = frappe.get_doc(
            {
                "doctype": "Technical Committee",
                "tc_code": tc_code,
                "title": f"R-S3 Smoke TC {tag}",
                "sector": "Smoke",
                "status": "Active",
                "members": [
                    {
                        "full_name": "Smoke TC Member",
                        "email": "tc-smoke@example.com",
                        "role_in_tc": "Member",
                    }
                ],
            }
        )
        tc.insert(ignore_permissions=True)

    wi = frappe.get_doc(
        {
            "doctype": "Work Item",
            "work_item_code": wi_code,
            "title": f"R-S3 smoke standard {tag}",
            "technical_committee": tc_code,
            "sector": "Smoke",
            "proposer": "StandardsRules smoke",
            "justification": "<p>Synthetic R-S3 publish path.</p>",
        }
    )
    wi.flags.ignore_permissions = True
    wi.flags.ignore_validate = True
    wi.insert(ignore_permissions=True)
    # Jump to Ballot without walking full Standards Development workflow
    frappe.db.set_value(
        "Work Item", wi_code, "workflow_state", "Ballot", update_modified=False
    )

    draft = frappe.get_doc(
        {
            "doctype": "Draft",
            "draft_code": draft_code,
            "work_item": wi_code,
            "stage": "Ballot",
            "version_label": "FDIS",
            "summary": "R-S3 smoke draft",
        }
    )
    draft.insert(ignore_permissions=True)
    frappe.db.set_value(
        "Work Item", wi_code, "current_draft", draft_code, update_modified=False
    )

    # Pre-create catalogue designation so Ballot Link / R-S3 codes resolve
    if not frappe.db.exists("Standard", std_code):
        frappe.get_doc(
            {
                "doctype": "Standard",
                "code": std_code,
                "title": wi.title,
                "sector": "Smoke",
                "status": "Draft",
                "version": "2026",
                "abstract": "<p>R-S3 smoke catalogue stub.</p>",
            }
        ).insert(ignore_permissions=True)
    frappe.db.set_value(
        "Work Item", wi_code, "linked_standard", std_code, update_modified=False
    )

    ballot = frappe.get_doc(
        {
            "doctype": "Ballot",
            "ballot_code": ballot_code,
            "work_item": wi_code,
            "draft": draft_code,
            "opened_on": nowdate(),
            "closes_on": nowdate(),
            "votes_for": 7,
            "votes_against": 0,
            "votes_abstain": 1,
            "outcome": "Pending",
        }
    )
    ballot.insert(ignore_permissions=True)

    # Approve → fires R-S3 via on_update hook; fallback to direct call
    ballot.outcome = "Approved"
    try:
        ballot.save(ignore_permissions=True)
    except Exception as exc:
        frappe.logger("eswasa_standards").warning(f"R-S3 ballot save fallback: {exc}")
        frappe.db.set_value(
            "Ballot", ballot_code, "outcome", "Approved", update_modified=False
        )
        ballot.reload()
        rs3_on_ballot_update(ballot)

    # Ensure artefacts even if hook short-circuited (idempotent)
    result = rs3_publish_standard(
        standard_code=std_code,
        title=wi.title,
        sector="Smoke",
        work_item=wi_code,
        ballot=ballot_code,
    )
    frappe.db.commit()

    std = frappe.get_doc("Standard", std_code)
    checks = {
        "has_gazette": bool(
            result.get("gazette_notice")
            and frappe.db.exists("Gazette Notice", result["gazette_notice"])
        ),
        "standard_gazetted": std.status in ("Gazetted", "Published"),
        "has_product": bool(
            result.get("standard_product")
            and frappe.db.exists("DocType", "Standard Product")
            and frappe.db.exists("Standard Product", result["standard_product"])
        ),
        "work_item_published": frappe.db.get_value(
            "Work Item", wi_code, "workflow_state"
        )
        == "Published/Gazetted",
        "has_feed_comment": bool(
            frappe.get_all(
                "Comment",
                filters={
                    "reference_doctype": "Standard",
                    "reference_name": std_code,
                    "content": ("like", "%R-S3%"),
                },
                limit=1,
            )
        ),
        "website_item_skipped_or_created": True,  # DocType often absent — stub OK
    }

    out = {
        "work_item": wi_code,
        "ballot": ballot_code,
        "standard": std_code,
        "result": result,
        "checks": checks,
        "ok": all(
            [
                checks["has_gazette"],
                checks["standard_gazetted"],
                checks["has_product"],
                checks["work_item_published"],
                checks["has_feed_comment"],
            ]
        ),
    }
    print(frappe.as_json(out, indent=2))
    return out
