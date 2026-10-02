"""Canonical EswasaOne Role Profiles — job packages for admin assignment.

Public side stays thin (Citizen + optional business entity).
Institution side uses ~15 profiles that expand to atomic Frappe Roles.
"""

from __future__ import annotations

from typing import Any, Literal

Audience = Literal["public", "institution", "external"]

# Curated atomic roles shown in admin "add role" (not the ERPNext dump).
CURATED_ROLES: tuple[str, ...] = (
    "Citizen",
    "Customer",
    "Certification Applicant",
    "LMS Student",
    "ESWASA Staff",
    "Desk User",
    "Employee",
    "Employee Self Service",
    "System Manager",
    "Administrator",
    "Certification Manager",
    "Certification Officer",
    "Certification Auditor",
    "Eswasa Standards Manager",
    "Eswasa Standards Officer",
    "Eswasa TC Member",
    "Eswasa Metrology Manager",
    "Eswasa Metrology Officer",
    "Eswasa Metrology Reviewer",
    "Eswasa TBT Officer",
    "Eswasa TBT Analyst",
    "Eswasa Board Secretary",
    "Eswasa Board Member",
    "Eswasa Risk Officer",
    "Eswasa Estore Manager",
    "Eswasa Estore Clerk",
    "Eswasa Verification Officer",
    "Accounts User",
    "Accounts Manager",
    "HR User",
    "HR Manager",
    "Leave Approver",
    "Sales User",
    "Sales Manager",
    "Instructor",
    "Course Creator",
    "Moderator",
    "Ingest Curator",
    "Ingest Viewer",
)

_BASE_STAFF = ("ESWASA Staff", "Desk User", "Employee", "Employee Self Service")


def _profile(
    name: str,
    *,
    audience: Audience,
    summary: str,
    roles: tuple[str, ...],
    portal_modules: tuple[str, ...] = (),
) -> dict[str, Any]:
    return {
        "name": name,
        "audience": audience,
        "summary": summary,
        "roles": list(roles),
        "portal_modules": list(portal_modules),
    }


ROLE_PROFILES: tuple[dict[str, Any], ...] = (
    _profile(
        "Citizen",
        audience="public",
        summary="Individual public passport — Service Portal only",
        roles=("Citizen",),
        portal_modules=("service",),
    ),
    _profile(
        "Business",
        audience="public",
        summary="Organisation account owner — Citizen + Customer entity",
        roles=("Citizen", "Customer"),
        portal_modules=("service",),
    ),
    _profile(
        "Certification Applicant",
        audience="public",
        summary="Firm applying for product/system certification",
        roles=("Citizen", "Customer", "Certification Applicant"),
        portal_modules=("service",),
    ),
    _profile(
        "Learner",
        audience="public",
        summary="Training enrolments on Service / LMS",
        roles=("Citizen", "LMS Student"),
        portal_modules=("service", "lms"),
    ),
    _profile(
        "TC Member (External)",
        audience="external",
        summary="Technical committee participant (not payroll staff)",
        roles=("Eswasa TC Member",),
        portal_modules=("standards",),
    ),
    _profile(
        "Board Member (External)",
        audience="external",
        summary="Non-executive board access to packs/resolutions",
        roles=("Eswasa Board Member",),
        portal_modules=("board",),
    ),
    _profile(
        "Institution Staff",
        audience="institution",
        summary="Base staff passport — dashboard, approvals, LMS, HR self-service",
        roles=_BASE_STAFF,
        portal_modules=("dashboard", "approvals", "lms", "hr", "reports"),
    ),
    _profile(
        "Certification Directorate",
        audience="institution",
        summary="Certification applications, audits, scheme register",
        roles=(*_BASE_STAFF, "Certification Officer"),
        portal_modules=("dashboard", "approvals", "certification", "lms", "hr", "reports"),
    ),
    _profile(
        "Certification Manager",
        audience="institution",
        summary="Certification leadership — manager DocPerms + workflow",
        roles=(*_BASE_STAFF, "Certification Manager", "Certification Officer"),
        portal_modules=("dashboard", "approvals", "certification", "lms", "hr", "reports"),
    ),
    _profile(
        "Standards Development",
        audience="institution",
        summary="Standards work programme and technical committees",
        roles=(*_BASE_STAFF, "Eswasa Standards Officer"),
        portal_modules=("dashboard", "approvals", "standards", "tbt", "lms", "hr", "reports"),
    ),
    _profile(
        "Metrology & LIMS",
        audience="institution",
        summary="Calibration, LIMS jobs, laboratory workflow",
        roles=(*_BASE_STAFF, "Eswasa Metrology Officer"),
        portal_modules=("dashboard", "approvals", "metrology", "lms", "hr", "reports"),
    ),
    _profile(
        "TBT Enquiry Point",
        audience="institution",
        summary="WTO/TBT notifications and responses",
        roles=(*_BASE_STAFF, "Eswasa TBT Officer"),
        portal_modules=("dashboard", "approvals", "tbt", "standards", "lms", "hr", "reports"),
    ),
    _profile(
        "Finance & Accounts",
        audience="institution",
        summary="Invoices, budget, revenue KPIs",
        roles=(*_BASE_STAFF, "Accounts User"),
        portal_modules=("dashboard", "approvals", "finance", "reports", "lms", "hr"),
    ),
    _profile(
        "People & HR",
        audience="institution",
        summary="HR directory, leave, appraisals, access requests",
        roles=(*_BASE_STAFF, "HR User", "Leave Approver"),
        portal_modules=("dashboard", "approvals", "hr", "reports", "lms"),
    ),
    _profile(
        "Commercial & CRM",
        audience="institution",
        summary="Pipeline, clients, marketing campaigns",
        roles=(*_BASE_STAFF, "Sales User"),
        portal_modules=("dashboard", "approvals", "crm", "marketing", "reports", "lms", "hr"),
    ),
    _profile(
        "Board Secretariat",
        audience="institution",
        summary="Board packs, resolutions, risk register",
        roles=(*_BASE_STAFF, "Eswasa Board Secretary", "Eswasa Risk Officer"),
        portal_modules=("dashboard", "approvals", "board", "reports", "lms", "hr"),
    ),
    _profile(
        "ICT / System Administration",
        audience="institution",
        summary="Platform administration — tightly controlled",
        roles=(*_BASE_STAFF, "System Manager"),
        portal_modules=("dashboard", "approvals", "admin", "reports", "lms", "hr"),
    ),
)


def list_role_profiles(*, audience: str | None = None) -> list[dict[str, Any]]:
    items = list(ROLE_PROFILES)
    if audience:
        items = [p for p in items if p["audience"] == audience]
    return items


def get_role_profile(name: str) -> dict[str, Any] | None:
    key = name.strip().lower()
    for p in ROLE_PROFILES:
        if p["name"].lower() == key:
            return p
    return None


def curated_role_names() -> list[str]:
    return list(CURATED_ROLES)
