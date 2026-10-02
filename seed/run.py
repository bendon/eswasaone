"""CLI entry: python -m seed.run [--wipe] [--years N] [--anchors-only] [--dry-run]."""

from __future__ import annotations

import argparse
import logging
import sys
from typing import Any

from seed import anchors, finance, masters
from seed.client import FrappeClient, FrappeError
from seed.config import (
    A10_MARKER,
    KPI_TARGETS,
    OPERATIONAL_EPOCH,
    OPERATIONAL_EPOCH_DATE,
    get_settings,
    year_window,
)
from seed.modules import cert, governance, metrology, standards, tbt, training

log = logging.getLogger("seed")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m seed.run",
        description="A10 DemoSeed — populate Frappe with mock-coherent demo data.",
    )
    p.add_argument(
        "--years",
        type=int,
        default=2,
        help="Calendar years of volume from end_year backward (default 2 → 2024–2025). "
        f"Volumes never predate OPERATIONAL_EPOCH={OPERATIONAL_EPOCH}.",
    )
    p.add_argument(
        "--anchors-only",
        action="store_true",
        help="Upsert narrative anchors + KPI notes only (CI smoke).",
    )
    p.add_argument(
        "--wipe",
        action="store_true",
        help="DESTRUCTIVE: delete A10-marked docs before seeding (see README).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print plan without calling Frappe (also used when site unreachable).",
    )
    p.add_argument(
        "--full-kpis",
        action="store_true",
        help="Attempt exact KPI counts (148 certs, 312 standards, 23 pending). "
        "Enrolments stay sampled (see TODO bulk).",
    )
    p.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Debug logging.",
    )
    return p


def plan_lines(*, years: int, anchors_only: bool, wipe: bool, full_kpis: bool) -> list[str]:
    start, end = year_window(years)
    lines = [
        f"OPERATIONAL_EPOCH={OPERATIONAL_EPOCH} ({OPERATIONAL_EPOCH_DATE})",
        f"Era A 2001–2006: narrative only (no cert/metrology volumes)",
        f"Year window: {start}–{end}",
        f"anchors_only={anchors_only} wipe={wipe} full_kpis={full_kpis}",
        f"KPI targets: {KPI_TARGETS}",
        "Anchors: CERT-2025-0041, CERT-2025-0029, SZNS 1043:2024, SZNS 987:2023 / "
        "STD-2025-0009, TRAIN-2025-0118, INV-2025-0394, G/TBT/N/EU/891, AUD-2026-00001",
        "Coexist: prefer AUD-2026-00001; set ESWASA_CERT_DEMO_SEED=0 when A10 owns cert volumes",
        "Finance Apr–Sep SZL thousands Budget/Actual from mock; GL # TODO: wire real",
    ]
    return lines


def wipe_a10(client: FrappeClient) -> dict[str, int]:
    """Delete documents clearly tagged with A10_DEMOSEED. Does not touch unmarked rows."""
    deleted: dict[str, int] = {}
    # Conservative wipe list — marker-based only
    specs: list[tuple[str, str]] = [
        ("Certification Application", "assessment_notes"),
        ("Certificate", "scope_summary"),
        ("Audit", "findings_summary"),
        ("Standard", "abstract"),
        ("TBT Notification", "summary"),
        ("ToDo", "description"),
        ("Board Pack", "agenda"),
        ("Calibration Job", "notes"),
        ("License Entitlement", "customer"),  # weak — skip bulk delete by customer
    ]
    for doctype, field in specs:
        if doctype == "License Entitlement":
            continue
        if not client.doctype_exists(doctype):
            continue
        rows = client.get_list(
            doctype,
            filters=[[field, "like", f"%{A10_MARKER}%"]],
            fields=["name"],
            limit=500,
        )
        n = 0
        for row in rows:
            try:
                client.delete(doctype, row["name"])
                n += 1
            except FrappeError as exc:
                log.warning("wipe %s/%s: %s", doctype, row["name"], exc)
        deleted[doctype] = n
    log.warning("Wipe complete (A10-marked only): %s", deleted)
    return deleted


def run(
    *,
    years: int = 2,
    anchors_only: bool = False,
    wipe: bool = False,
    dry_run: bool = False,
    full_kpis: bool = False,
) -> dict[str, Any]:
    settings = get_settings(dry_run=dry_run)
    client = FrappeClient(settings)
    summary: dict[str, Any] = {"ok": False, "dry_run": dry_run, "plan": plan_lines(
        years=years, anchors_only=anchors_only, wipe=wipe, full_kpis=full_kpis
    )}

    for line in summary["plan"]:
        log.info("PLAN: %s", line)

    if dry_run:
        summary["ok"] = True
        summary["mode"] = "dry-run"
        return summary

    if not client.ping():
        log.error(
            "Frappe unreachable at %s — printing dry-run plan. "
            "Start bench or pass --dry-run.",
            settings.frappe_url,
        )
        summary["ok"] = False
        summary["mode"] = "unreachable-dry-plan"
        summary["blocked_on"] = f"Frappe at {settings.frappe_url}"
        return summary

    try:
        client.login()
    except FrappeError as exc:
        log.error("Login failed (credentials not printed): %s", exc)
        summary["blocked_on"] = "FRAPPE_ADMIN_* login"
        return summary

    if wipe:
        summary["wiped"] = wipe_a10(client)

    summary["masters"] = masters.ensure_masters(client)
    summary["finance"] = finance.ensure_finance(client)
    summary["tbt"] = tbt.ensure_tbt(client)
    summary["training"] = training.ensure_training(client)
    summary["governance"] = {
        "approvals": governance.ensure_approvals(client),
        "board": governance.ensure_board_stub(client),
    }
    summary["metrology"] = metrology.ensure_metrology_stubs(client, years=years)
    summary["anchors"] = anchors.ensure_anchors(client)

    if not anchors_only:
        start, end = year_window(years)
        cert_target = KPI_TARGETS["companies_certified_ytd"] if full_kpis else min(
            40, KPI_TARGETS["companies_certified_ytd"] // max(1, 3 - years)
        )
        std_target = KPI_TARGETS["standards_published"] if full_kpis else min(
            60, KPI_TARGETS["standards_published"] // max(1, 3 - years)
        )
        pending_target = (
            KPI_TARGETS["pending_applications"]
            if full_kpis
            else min(10, KPI_TARGETS["pending_applications"])
        )
        summary["volumes"] = {
            "year_window": [start, end],
            "pending": cert.ensure_pending_applications(client, count=pending_target),
            "certified": cert.ensure_certified_volume(
                client, target=cert_target, year=end
            ),
            "standards": standards.ensure_standards_volume(
                client, target=std_target, year=end
            ),
        }
    else:
        # Still ensure pending SLA narrative for dashboard coherence when anchors-only
        summary["volumes"] = {
            "pending": cert.ensure_pending_applications(
                client, count=min(5, KPI_TARGETS["pending_applications"])
            ),
            "note": "anchors-only: skipped full cert/standards volumes",
        }

    summary["ok"] = True
    summary["mode"] = "applied"
    summary["hint"] = (
        "Set ESWASA_CERT_DEMO_SEED=0 (or site_config eswasa_certification_demo_seed=0) "
        "so CertOps after_migrate does not fight A10 certificate anchors."
    )
    return summary


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    if args.wipe:
        log.warning("--wipe is DESTRUCTIVE for A10-marked documents only.")

    summary = run(
        years=args.years,
        anchors_only=args.anchors_only,
        wipe=args.wipe,
        dry_run=args.dry_run,
        full_kpis=args.full_kpis,
    )

    print("---")
    for line in summary.get("plan", []):
        print(f"  {line}")
    print(f"mode={summary.get('mode')} ok={summary.get('ok')}")
    if summary.get("anchors"):
        print(f"anchors={summary['anchors']}")
    if summary.get("blocked_on"):
        print(f"blocked_on={summary['blocked_on']}")
        return 2
    if summary.get("hint"):
        print(summary["hint"])
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
