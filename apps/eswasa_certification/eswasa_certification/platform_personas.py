"""Platform demo personas for E2E / BFF / Desk workflow testing.

Map §5 staff allocation — separate users so four-eyes and Claim are real.
Password for all demo personas: ``Eswasa!demo1`` (site-local only).
Also ensures ``demo`` / ``demo`` for Core ASGI smoke (System Manager pack).

Run::
    bench --site eswasaone.localhost execute eswasa_certification.platform_personas.ensure_personas
"""

from __future__ import annotations

from typing import Any

import frappe

DEMO_PASSWORD = "Eswasa!demo1"

# email, full_name, roles
PERSONAS: tuple[dict[str, Any], ...] = (
    {
        "email": "demo@eswasa.org.sz",
        "username": "demo",
        "full_name": "EswasaOne Demo (System Manager)",
        "roles": (
            "System Manager",
            "Desk User",
            "Employee",
            "Certification Officer",
            "Certification Manager",
        ),
        "password": DEMO_PASSWORD,
    },
    {
        "email": "sys.manager@eswasa.org.sz",
        "full_name": "System Manager Persona",
        "roles": ("System Manager", "Desk User", "Employee", "Employee Self Service"),
    },
    {
        "email": "cert.officer@eswasa.org.sz",
        "full_name": "Certification Officer",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Certification Officer",
        ),
    },
    {
        "email": "cert.auditor@eswasa.org.sz",
        "full_name": "Certification Auditor",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Certification Auditor",
        ),
    },
    {
        "email": "cert.manager@eswasa.org.sz",
        "full_name": "Certification Manager",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Certification Manager",
            "Certification Officer",
        ),
    },
    {
        "email": "cert.reviewer@eswasa.org.sz",
        "full_name": "Technical Reviewer",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Certification Manager",  # until dedicated Technical Reviewer role exists
        ),
    },
    {
        "email": "scheme.manager@eswasa.org.sz",
        "full_name": "Scheme Manager",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Certification Manager",
            "Certification Officer",
        ),
    },
    {
        "email": "field.lead@eswasa.org.sz",
        "full_name": "Field Lead Auditor",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Certification Auditor",
        ),
    },
    {
        "email": "standards.officer@eswasa.org.sz",
        "full_name": "Standards Officer",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa Standards Officer",
        ),
    },
    {
        "email": "standards.manager@eswasa.org.sz",
        "full_name": "Standards Manager",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa Standards Manager",
            "Eswasa Standards Officer",
        ),
    },
    {
        "email": "metro.officer@eswasa.org.sz",
        "full_name": "Metrology Officer",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa Metrology Officer",
        ),
    },
    {
        "email": "metro.reviewer@eswasa.org.sz",
        "full_name": "Metrology Reviewer",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa Metrology Reviewer",
        ),
    },
    {
        "email": "metro.manager@eswasa.org.sz",
        "full_name": "Metrology Manager",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa Metrology Manager",
        ),
    },
    {
        "email": "tbt.officer@eswasa.org.sz",
        "full_name": "TBT Officer",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa TBT Officer",
        ),
    },
    {
        "email": "tbt.analyst@eswasa.org.sz",
        "full_name": "TBT Analyst",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa TBT Analyst",
        ),
    },
    {
        "email": "board.secretary@eswasa.org.sz",
        "full_name": "Board Secretary",
        "roles": (
            "Desk User",
            "Employee",
            "Employee Self Service",
            "Eswasa Board Secretary",
            "Eswasa Risk Officer",
        ),
    },
    {
        "email": "board.member@eswasa.org.sz",
        "full_name": "Board Member",
        "roles": ("Eswasa Board Member",),  # external — limited Desk
    },
    {
        "email": "customer.demo@eswasa.org.sz",
        "full_name": "Demo Customer Applicant",
        "roles": ("Customer", "Certification Applicant"),
    },
    {
        "email": "sys.cron@eswasa.org.sz",
        "full_name": "System Cron Actor",
        "roles": ("System Manager",),  # narrow later (L6)
        "user_type": "System User",
    },
    {
        "email": "sys.momo@eswasa.org.sz",
        "full_name": "System MoMo Actor",
        "roles": ("System Manager",),
        "user_type": "System User",
    },
    {
        "email": "sys.ingest@eswasa.org.sz",
        "full_name": "System Ingest Actor",
        "roles": ("System Manager", "Ingest Curator"),
        "user_type": "System User",
    },
)


def _ensure_role(role: str) -> None:
    if frappe.db.exists("Role", role):
        return
    try:
        doc = frappe.get_doc(
            {
                "doctype": "Role",
                "role_name": role,
                "desk_access": 1,
                "is_custom": 1,
            }
        )
        doc.insert(ignore_permissions=True)
    except Exception:
        frappe.log_error(title=f"platform_personas ensure role {role}")


def _upsert_user(spec: dict[str, Any]) -> str:
    email = spec["email"]
    password = spec.get("password") or DEMO_PASSWORD
    username = spec.get("username")
    # Frappe User.name is usually the email
    name = email
    for role in spec.get("roles") or ():
        _ensure_role(role)

    if frappe.db.exists("User", name):
        user = frappe.get_doc("User", name)
    else:
        user = frappe.get_doc(
            {
                "doctype": "User",
                "email": email,
                "first_name": (spec.get("full_name") or email).split()[0],
                "last_name": " ".join((spec.get("full_name") or "").split()[1:]) or "Persona",
                "send_welcome_email": 0,
                "user_type": spec.get("user_type") or "System User",
                "new_password": password,
            }
        )
        if username and username != email:
            # Prefer email as name; store username in bio if needed
            pass
        user.insert(ignore_permissions=True)

    user.enabled = 1
    user.send_welcome_email = 0
    if hasattr(user, "bypass_restrict_ip_check"):
        user.bypass_restrict_ip_check = 1
    # Clear 2FA if present
    if user.meta.has_field("two_factor_auth"):
        user.two_factor_auth = 0

    existing = {r.role for r in (user.roles or [])}
    for role in spec.get("roles") or ():
        if role not in existing and role not in ("All", "Guest", "Desk User"):
            user.append("roles", {"role": role})
        elif role == "Desk User" and role not in existing:
            user.append("roles", {"role": role})

    # Desk User for staff
    staffish = any(
        r not in ("Customer", "Certification Applicant", "Eswasa Board Member", "Citizen")
        for r in (spec.get("roles") or ())
    )
    if staffish and "Desk User" not in {r.role for r in user.roles}:
        if frappe.db.exists("Role", "Desk User"):
            user.append("roles", {"role": "Desk User"})

    user.save(ignore_permissions=True)
    try:
        user.new_password = password
        user.save(ignore_permissions=True)
    except Exception:
        # update_password API
        try:
            from frappe.utils.password import update_password

            update_password(user=name, pwd=password)
        except Exception:
            frappe.log_error(title=f"platform_personas password {name}")

    # Alias: allow login as username "demo" when email is demo@…
    if username and username != name:
        # Frappe login accepts email; Core may look up username — set username field if exists
        if user.meta.has_field("username"):
            try:
                user.db_set("username", username)
            except Exception:
                pass

    frappe.db.commit()
    return name


def _auditor_code_for_email(email: str) -> str:
    local = (email.split("@")[0] or "AUD").upper().replace(".", "-").replace("_", "-")
    code = f"AUD-{local}"
    return code[:40]


def _ensure_auditor_profile(email: str, full_name: str) -> str | None:
    """Ensure an Auditor master exists and is linked to the User (by email)."""
    if not frappe.db.exists("DocType", "Auditor"):
        return None
    if not frappe.db.exists("User", email):
        return None

    existing = (
        frappe.db.get_value("Auditor", {"user": email}, "name")
        or frappe.db.get_value("Auditor", {"email": email}, "name")
    )
    if existing:
        doc = frappe.get_doc("Auditor", existing)
        changed = False
        if not doc.user:
            doc.user = email
            changed = True
        if not doc.email:
            doc.email = email
            changed = True
        if full_name and doc.auditor_name != full_name:
            doc.auditor_name = full_name
            changed = True
        if changed:
            doc.save(ignore_permissions=True)
        return doc.name

    code = _auditor_code_for_email(email)
    if frappe.db.exists("Auditor", code):
        # Collision — suffix
        code = f"{code}-{frappe.generate_hash(length=4).upper()}"

    doc = frappe.get_doc(
        {
            "doctype": "Auditor",
            "auditor_code": code,
            "auditor_name": full_name or email,
            "employment_type": "Internal",
            "email": email,
            "user": email,
            "is_active": 1,
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def ensure_personas() -> dict[str, Any]:
    """Idempotent upsert of all platform personas. Returns created/updated map."""
    out: dict[str, Any] = {"users": [], "auditors": [], "password_default": DEMO_PASSWORD}
    for spec in PERSONAS:
        try:
            name = _upsert_user(spec)
            out["users"].append(
                {
                    "name": name,
                    "email": spec["email"],
                    "roles": list(spec.get("roles") or ()),
                    "password": spec.get("password") or DEMO_PASSWORD,
                }
            )
            roles = set(spec.get("roles") or ())
            if "Certification Auditor" in roles:
                aud = _ensure_auditor_profile(
                    spec["email"], str(spec.get("full_name") or spec["email"])
                )
                if aud:
                    out["auditors"].append({"user": spec["email"], "auditor": aud})
        except Exception as exc:
            frappe.log_error(title=f"platform_personas {spec.get('email')}")
            out.setdefault("errors", []).append({"email": spec.get("email"), "error": str(exc)})
    # L9 — ensure Holiday List for working-day SLAs
    try:
        from eswasa_governance.sla import ensure_eswatini_holiday_list

        out["holiday_list"] = ensure_eswatini_holiday_list()
    except Exception as exc:
        out.setdefault("errors", []).append({"holiday_list": str(exc)})
    frappe.db.commit()
    return out
