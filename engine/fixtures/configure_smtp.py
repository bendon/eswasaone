#!/usr/bin/env python3
"""Upsert Frappe Email Account (outgoing) from repo-root SMTP_* env vars.

Run as OS user ``frappe`` against the site::

    sudo -u frappe -H bash -lc \\
      'cd /srv/projects/eswasaone/engine/frappe-bench && \\
       ./env/bin/python ../fixtures/configure_smtp.py --site eswasaone.localhost'

If SMTP_HOST / SMTP_FROM are empty, exits 0 without creating a live account.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"
ACCOUNT_NAME = "EswasaOne Outbound"


def _load_dotenv(path: Path) -> dict[str, str]:
    vals: dict[str, str] = {}
    if not path.is_file():
        return vals
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", default="eswasaone.localhost")
    args = parser.parse_args()

    env = {**_load_dotenv(ENV_FILE), **os.environ}
    host = (env.get("SMTP_HOST") or "").strip()
    from_addr = (env.get("SMTP_FROM") or "").strip()
    from_name = (env.get("SMTP_FROM_NAME") or "").strip() or ACCOUNT_NAME
    port = (env.get("SMTP_PORT") or "587").strip()
    user = (env.get("SMTP_USER") or "").strip()
    password = (env.get("SMTP_PASSWORD") or "").strip()
    use_tls = (env.get("SMTP_USE_TLS") or "true").lower() not in ("0", "false", "no")

    if not host or not from_addr:
        print("skip:SMTP — SMTP_HOST/SMTP_FROM empty (no Email Account created)")
        return 0

    # Bench site context — Frappe expects cwd = sites/ (see load_fixtures.py)
    bench = Path(__file__).resolve().parents[1] / "frappe-bench"
    sites = bench / "sites"
    env_lib = list((bench / "env" / "lib").glob("python*/site-packages"))
    for p in env_lib:
        sys.path.insert(0, str(p))
    apps = bench / "apps"
    if apps.exists():
        for child in apps.iterdir():
            if child.is_dir() or child.is_symlink():
                sys.path.insert(0, str(child))
    os.chdir(sites)

    import frappe

    frappe.init(site=args.site)
    frappe.connect()

    try:
        # Stable lookup by email_id first, then legacy account name
        existing = frappe.db.exists("Email Account", {"email_id": from_addr}) or frappe.db.exists(
            "Email Account", ACCOUNT_NAME
        )
        if existing:
            doc = frappe.get_doc("Email Account", existing)
            print(f"update:Email Account:{doc.name}")
        else:
            doc = frappe.new_doc("Email Account")
            print(f"insert:Email Account:{from_name}")

        doc.email_account_name = from_name
        doc.email_id = from_addr
        doc.enable_outgoing = 1
        doc.enable_incoming = 0
        doc.default_outgoing = 1
        doc.always_use_account_email_id_as_sender = 1
        doc.always_use_account_name_as_sender_name = 1
        doc.smtp_server = host
        doc.smtp_port = int(port or "587")
        doc.use_tls = 1 if use_tls else 0
        doc.use_ssl_for_outgoing = 0
        if user:
            doc.login_id = user
            doc.login_id_is_different = 1 if user != from_addr else 0
            doc.password = password
            doc.no_smtp_authentication = 0
        else:
            doc.no_smtp_authentication = 1

        doc.save(ignore_permissions=True)
        frappe.db.commit()
        print(f"ok:Email Account:{doc.name} → {host}:{port} as {from_name} <{from_addr}>")
    finally:
        frappe.destroy()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
