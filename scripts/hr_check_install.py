#!/usr/bin/env python3
"""Check a site has every HR DocType, field, custom field, property setter, role, print format, scheduler
entry and patch the HR backend needs (plan 10, docs/HR_STAGING_RUNBOOK.md step 2).

Runs ``eswasa_hr.install_check.run`` on the site through ``bench execute`` and exits 1 if anything is missing.

    python3 scripts/hr_check_install.py --site staging.eswasa.local [--bench /home/frappe/frappe-bench]

Inside the bench you can also run ``bench --site <site> execute eswasa_hr.install_check.run`` directly.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--site", required=True)
    ap.add_argument("--bench", default=".", help="bench directory (default: current directory)")
    args = ap.parse_args()
    proc = subprocess.run(
        ["bench", "--site", args.site, "execute", "eswasa_hr.install_check.run"],
        cwd=args.bench, capture_output=True, text=True,
    )
    sys.stdout.write(proc.stdout)
    sys.stderr.write(proc.stderr)
    if proc.returncode:
        return proc.returncode
    # bench execute prints the function's output, then its return value; the report is the first JSON object.
    start = proc.stdout.find("{")
    try:
        report, _ = json.JSONDecoder().raw_decode(proc.stdout[start:])
    except ValueError:
        print("Could not read the check's output.", file=sys.stderr)
        return 2
    if report.get("ok"):
        print("HR install check: OK")
        return 0
    print("HR install check: missing items above. Run bench migrate, then this again.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
