#!/usr/bin/env python3
"""Brand Frappe invite / password emails with public EswasaOne URLs.

Sets ``site_config.host_name`` from ``PUBLIC_BASE_URL``, upserts Email Templates
for welcome + password reset, and points System Settings at them.

Run from bench (sites/ on sys.path via run_in_site or chdir)::

    cd /srv/projects/eswasaone/engine/frappe-bench
    ./env/bin/python ../fixtures/configure_email_branding.py --site eswasaone.localhost
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"
BENCH = REPO_ROOT / "engine" / "frappe-bench"

WELCOME_NAME = "EswasaOne Welcome"
RESET_NAME = "EswasaOne Password Reset"

WELCOME_SUBJECT = "Welcome to EswasaOne: set your password"
RESET_SUBJECT = "EswasaOne: reset your password"

# Set Password / Login chrome (get_app_logo + Website Settings.favicon)
APP_LOGO = "/assets/eswasa_certification/images/eswasa-lockup.png"
FAVICON = "/assets/eswasa_certification/images/favicon.ico"

WELCOME_HTML = """\
<div style="font-family: Arial, Helvetica, sans-serif; color: #0F172A; line-height: 1.55; max-width: 560px;">
  <p style="font-size: 11px; letter-spacing: .14em; font-weight: 700; color: #313391; text-transform: uppercase; margin: 0 0 12px;">EswasaOne · Institution Portal</p>
  <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 16px;">Complete your registration</h1>
  <p>Hello {{ first_name }}{% if last_name %} {{ last_name }}{% endif %},</p>
  <p>
    An Institution Portal account has been created for you on
    <a href="{{ site_url }}" style="color: #313391; font-weight: 600;">EswasaOne</a>
    (Eswatini Standards Authority).
  </p>
  <p>Your login ID is: <b>{{ user }}</b></p>
  <p>Click below to set your password and activate access.</p>
  <p style="margin: 24px 0;">
    <a href="{{ link }}" style="display: inline-block; background: #313391; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 10px;">
      Set password &amp; continue
    </a>
  </p>
  <p style="font-size: 13px; color: #5A6B84;">
    Or paste this link into your browser:<br>
    <a href="{{ link }}" style="color: #313391; word-break: break-all;">{{ link }}</a>
  </p>
  <p style="font-size: 12px; color: #8A9AB1; margin-top: 28px; border-top: 1px solid #E4EAF2; padding-top: 14px;">
    After setting your password, sign in at
    <a href="{{ site_url }}/institution/" style="color: #313391;">{{ site_url }}/institution/</a>
  </p>
</div>
"""

RESET_HTML = """\
<div style="font-family: Arial, Helvetica, sans-serif; color: #0F172A; line-height: 1.55; max-width: 560px;">
  <p style="font-size: 11px; letter-spacing: .14em; font-weight: 700; color: #313391; text-transform: uppercase; margin: 0 0 12px;">EswasaOne · Institution Portal</p>
  <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 16px;">Reset your password</h1>
  <p>Hello {{ first_name }}{% if last_name %} {{ last_name }}{% endif %},</p>
  <p>We received a request to reset the password for <b>{{ user }}</b>.</p>
  <p style="margin: 24px 0;">
    <a href="{{ link }}" style="display: inline-block; background: #313391; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 10px;">
      Choose a new password
    </a>
  </p>
  <p style="font-size: 13px; color: #5A6B84;">
    Or paste this link:<br>
    <a href="{{ link }}" style="color: #313391; word-break: break-all;">{{ link }}</a>
  </p>
  <p style="font-size: 12px; color: #8A9AB1; margin-top: 28px;">
    If you did not request this, you can ignore this email.
  </p>
</div>
"""


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


def _upsert_template(name: str, subject: str, html: str) -> None:
    import frappe

    if frappe.db.exists("Email Template", name):
        doc = frappe.get_doc("Email Template", name)
        doc.subject = subject
        doc.use_html = 1
        doc.response_html = html
        doc.enabled = 1
        doc.save(ignore_permissions=True)
        print(f"updated Email Template: {name}")
    else:
        frappe.get_doc(
            {
                "doctype": "Email Template",
                "name": name,
                "subject": subject,
                "use_html": 1,
                "response_html": html,
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)
        print(f"created Email Template: {name}")


def ensure_website_branding() -> None:
    """Point Set Password / Login at EswasaOne logo + favicon."""
    import frappe

    if frappe.db.exists("DocType", "Website Settings"):
        frappe.db.set_single_value("Website Settings", "app_name", "EswasaOne")
        frappe.db.set_single_value("Website Settings", "app_logo", APP_LOGO)
        frappe.db.set_single_value("Website Settings", "favicon", FAVICON)
        print(f"Website Settings.app_logo → {APP_LOGO}")
        print(f"Website Settings.favicon → {FAVICON}")

    if frappe.db.exists("DocType", "Navbar Settings"):
        frappe.db.set_single_value("Navbar Settings", "app_logo", APP_LOGO)
        print(f"Navbar Settings.app_logo → {APP_LOGO}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", default="eswasaone.localhost")
    args = parser.parse_args()

    env = _load_dotenv(ENV_FILE)
    public = (env.get("PUBLIC_BASE_URL") or "https://eswasaone.aiceafrica.com").rstrip("/")

    sites = BENCH / "sites"
    if not sites.is_dir():
        print(f"missing sites dir: {sites}", file=sys.stderr)
        return 1

    # Frappe expects cwd = sites/ for log paths + site resolution
    import os

    os.chdir(sites)
    import frappe

    frappe.init(site=args.site, sites_path=str(sites))
    Path(frappe.utils.get_site_path("logs")).mkdir(parents=True, exist_ok=True)
    frappe.connect()

    try:
        # Persist public URL for get_url() in welcome / reset links
        conf_path = sites / args.site / "site_config.json"
        cfg = json.loads(conf_path.read_text())
        cfg["host_name"] = public
        cfg["site_name"] = "EswasaOne"
        conf_path.write_text(json.dumps(cfg, indent=1) + "\n")
        # Refresh in-process conf
        frappe.conf.host_name = public
        frappe.conf.site_name = "EswasaOne"
        print(f"host_name → {public}")

        _upsert_template(WELCOME_NAME, WELCOME_SUBJECT, WELCOME_HTML)
        _upsert_template(RESET_NAME, RESET_SUBJECT, RESET_HTML)

        frappe.db.set_single_value("System Settings", "welcome_email_template", WELCOME_NAME)
        frappe.db.set_single_value("System Settings", "reset_password_template", RESET_NAME)
        frappe.db.set_default("site_name", "EswasaOne")

        # Outer wrapper (standard.html) — NOT controlled by Email Template body.
        # Welcome mails use with_container=True → brand masthead + ERPNext footer hook.
        frappe.db.set_single_value("System Settings", "app_name", "EswasaOne")
        frappe.db.set_single_value("System Settings", "disable_standard_email_footer", 1)
        frappe.db.set_single_value(
            "System Settings",
            "email_footer_address",
            "EswasaOne · Eswatini Standards Authority",
        )
        frappe.db.set_default("disable_standard_email_footer", "1")
        frappe.db.set_default(
            "email_footer_address",
            "EswasaOne · Eswatini Standards Authority",
        )

        # get_brand_name() + Set Password / Login chrome (logo + favicon)
        ensure_website_branding()
        print("System Settings.app_name → EswasaOne")
        print("disable_standard_email_footer → 1 (hides Sent via ERPNext)")

        # Prefer Africa/Mbabane when still on install default
        tz = frappe.db.get_single_value("System Settings", "time_zone")
        if not tz or tz in ("Asia/Kolkata", "UTC"):
            frappe.db.set_single_value("System Settings", "time_zone", "Africa/Mbabane")
            print("time_zone → Africa/Mbabane")

        frappe.db.commit()
        frappe.clear_cache()

        from frappe.utils import get_url
        from frappe.email.email_body import get_brand_name
        from frappe.core.doctype.navbar_settings.navbar_settings import get_app_logo

        print("get_url() sample:", get_url("/update-password?key=demo"))
        print("welcome_email_template:", frappe.db.get_single_value("System Settings", "welcome_email_template"))
        print("get_brand_name():", get_brand_name())
        print("get_app_logo():", get_app_logo())
        print(
            "Website Settings.favicon:",
            frappe.db.get_single_value("Website Settings", "favicon"),
        )
        print(
            "disable_standard_email_footer:",
            frappe.db.get_single_value("System Settings", "disable_standard_email_footer"),
        )
    finally:
        frappe.destroy()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
