"""CLI: eswasa-registry check | build."""

from __future__ import annotations

import argparse
import json
import sys

from eswasa_registry.build import build_all, check_all, load_all


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="eswasa-registry")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="List registry workflow files")
    p_check = sub.add_parser("check", help="Fail if registry ≠ deployed fixtures")
    p_check.add_argument("--json", action="store_true")

    p_build = sub.add_parser("build", help="Write display maps (and optionally fixtures)")
    p_build.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print plan without writing",
    )
    p_build.add_argument(
        "--fixtures",
        action="store_true",
        help="Also rewrite apps/*/fixtures workflow JSON (opt-in)",
    )
    p_build.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)

    if args.cmd == "list":
        for path, reg in load_all():
            flag = "emit" if reg.emit else "no-emit"
            print(f"{path.name:40} {reg.doctype:32} [{reg.phase}/{flag}]")
        return 0

    if args.cmd == "check":
        errs = check_all()
        if getattr(args, "json", False):
            print(json.dumps({"ok": not errs, "errors": errs}, indent=2))
        elif errs:
            for e in errs:
                print(f"FAIL: {e}", file=sys.stderr)
            return 1
        else:
            print("OK: registry matches deployed fixtures for all emit:true workflows")
        return 1 if errs else 0

    if args.cmd == "build":
        results = build_all(write=not args.dry_run, write_fixtures=args.fixtures)
        if args.json:
            print(json.dumps(results, indent=2, default=str))
        else:
            for r in results:
                if r.get("skipped"):
                    print(f"skip {r['doctype']}: {r['skipped']}")
                elif args.dry_run:
                    print(f"dry-run {r['doctype']} ({r['phase']})")
                else:
                    print(f"wrote {r['doctype']}:")
                    for w in r.get("written") or []:
                        print(f"  {w}")
                    if r.get("fixtures_note"):
                        print(f"  note: {r['fixtures_note']}")
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
