"""Published certification schemes (master data, not demo data).

The Service Portal catalogue renders whatever ``list_schemes`` returns, so every
scheme ESWASA publishes on eswasa.co.sz must exist as a Certification Scheme.
``ensure_published_schemes`` runs on install / migrate and only inserts missing
rows — staff edits in Desk (fees, descriptions, is_active) are never overwritten.
"""

from __future__ import annotations

import frappe
from frappe.utils import cint, flt, strip_html

MS = ("Management System", "ISO/IEC 17021")
PRODUCT = ("Product", "ISO/IEC 17065")

# scheme_code, scheme_name, standard_ref, (type, basis), description
PUBLISHED_SCHEMES: tuple[tuple[str, str, str, tuple[str, str], str], ...] = (
    (
        "ISO9001-QMS",
        "Quality Management Systems: Requirements",
        "SZNS ISO 9001:2015",
        MS,
        "Certification of your quality management system against SZNS ISO 9001:2015. "
        "ESWASA's management systems certification for ISO 9001 is accredited by SADCAS.",
    ),
    (
        "ISO14001-EMS",
        "Environmental Management Systems: Requirements with guidance for use",
        "SZNS ISO 14001:2015",
        MS,
        "Certification of your environmental management system against SZNS ISO 14001:2015.",
    ),
    (
        "ISO22000-FSMS",
        "Food Safety Management Systems: Requirements for any organization in the food chain",
        "SZNS ISO 22000:2018",
        MS,
        "Certification of your food safety management system against SZNS ISO 22000:2018.",
    ),
    (
        "ISO45001-OHSMS",
        "Occupational Health and Safety Management Systems: Requirements with guidance for use",
        "SZNS ISO 45001:2018",
        MS,
        "Certification of your occupational health and safety management system "
        "against SZNS ISO 45001:2018.",
    ),
    (
        "HACCP-10330",
        "Hazard Analysis and Critical Control Point (HACCP)",
        "SZNS SANS 10330:2020",
        MS,
        "Certification of your HACCP system against SZNS SANS 10330:2020.",
    ),
    (
        "PRODUCT-MARK",
        "Product certification",
        "Product Certification Mark",
        PRODUCT,
        "A voluntary scheme for products manufactured to national or international "
        "standards, with independent testing at an accredited laboratory. Certified "
        "examples include concrete roof tiles (SZNS SANS 542:2020) and chilli sauce "
        "(SZNS CODEXSTAN 306:2015).",
    ),
    (
        "INGELO",
        "Ingelo: certification for local MSME producers",
        "Ingelo Certification Scheme",
        PRODUCT,
        "A Ministry of Commerce, Industry and Trade initiative supporting local producers "
        "through system and product certification, so they can meet market quality and "
        "safety requirements. ESWASA offers free pre-application consultations and "
        "gap-analysis workshops.",
    ),
    (
        "COMBINED",
        "Combined request (e.g., ISO + Product)",
        "Combined request",
        MS,
        "One request covering more than one type of certification. You choose the "
        "management-system standard(s) and the product(s); ESWASA confirms how it will "
        "be assessed.",
    ),
)

# Values the old demo seed wrote for ISO9001-QMS; upgraded once, then left alone.
_LEGACY_ISO9001_NAME = "Quality Management Systems (ISO 9001)"


def ensure_published_schemes() -> list[str]:
    """Insert any published scheme that is missing. Returns the codes created."""
    if not frappe.db.exists("DocType", "Certification Scheme"):
        return []
    created: list[str] = []
    for code, name, standard_ref, (scheme_type, basis), description in PUBLISHED_SCHEMES:
        if frappe.db.exists("Certification Scheme", code):
            if code == "ISO9001-QMS" and (
                frappe.db.get_value("Certification Scheme", code, "scheme_name")
                == _LEGACY_ISO9001_NAME
            ):
                frappe.db.set_value(
                    "Certification Scheme",
                    code,
                    {"scheme_name": name, "standard_ref": standard_ref, "description": description},
                )
            continue
        frappe.get_doc(
            {
                "doctype": "Certification Scheme",
                "scheme_code": code,
                "scheme_name": name,
                "standard_ref": standard_ref,
                "scheme_type": scheme_type,
                "accreditation_basis": basis,
                "surveillance_interval_months": 12,
                "certificate_validity_months": 36,
                "is_active": 1,
                "description": description,
            }
        ).insert(ignore_permissions=True)
        created.append(code)
    return created


def serialize_scheme(row: dict) -> dict:
    """OpenAPI CertificationScheme shape (public catalogue fields only)."""
    fee = flt(row.get("certification_fee"))
    return {
        "code": row.get("name") or row.get("scheme_code"),
        "name": row.get("scheme_name"),
        "standard_ref": row.get("standard_ref") or None,
        "scheme_type": row.get("scheme_type"),
        "accreditation_basis": row.get("accreditation_basis") or None,
        "surveillance_interval_months": cint(row.get("surveillance_interval_months")) or None,
        "certificate_validity_months": cint(row.get("certificate_validity_months")) or None,
        "fee": fee or None,
        "description": strip_html(row.get("description") or "").strip() or None,
    }


def active_schemes() -> list[dict]:
    """Active schemes for the public catalogue (get_all skips DocPerm: catalogue is public)."""
    rows = frappe.get_all(
        "Certification Scheme",
        filters={"is_active": 1},
        fields=[
            "name",
            "scheme_name",
            "standard_ref",
            "scheme_type",
            "accreditation_basis",
            "surveillance_interval_months",
            "certificate_validity_months",
            "certification_fee",
            "description",
        ],
        order_by="creation asc",
    )
    return [serialize_scheme(r) for r in rows]
