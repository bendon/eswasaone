"""Epoch, KPI anchors, and Frappe connection settings (no secret printing)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_ENV_FILE = _ROOT / ".env"

# Locked epoch (docs/MULTIAGENT.md)
ERA_A_START = 2001
ERA_A_END = 2006
OPERATIONAL_EPOCH = 2007  # doors opened 2007-04-02
OPERATIONAL_EPOCH_DATE = "2007-04-02"

# Demo KPI targets matching institutional / service portal mocks
KPI_TARGETS = {
    "companies_certified_ytd": 148,
    "training_enrolments_ytd": 2840,
    "revenue_ytd_szl": 3_630_000,
    "revenue_variance_pct": -8,
    "pending_applications": 23,
    "pending_sla_overdue": 7,
    "approvals_queue": 7,
    "standards_published": 312,
    "tbt_badge": 4,
    "staff_headcount": 110,
}

FINANCE_MONTHS = {
    "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    "budget_thousands": [520, 570, 585, 640, 660, 680],
    "actual_thousands": [470, 600, 540, 720, 665, 575],
}

# Exact narrative anchors (prefer these names)
ANCHORS = {
    "cert_application_narrative": "CERT-2025-0041",
    "certificate_active": "CERT-2025-0029",
    "standard_published": "SZNS 1043:2024",
    "standard_purchase": "SZNS 987:2023",
    "estore_order": "STD-2025-0009",
    "training": "TRAIN-2025-0118",
    "invoice": "INV-2025-0394",
    "tbt_symbol": "G/TBT/N/EU/891",
    "audit_smoke": "AUD-2026-00001",
}

A10_MARKER = "A10_DEMOSEED"
SCHEME_CODE = "ISO9001-QMS"
AUDITOR_CODE = "AUD-001"


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


_load_dotenv(_ENV_FILE)


@dataclass
class Settings:
    frappe_url: str = field(
        default_factory=lambda: os.environ.get("FRAPPE_URL", "http://127.0.0.1:8020")
    )
    frappe_site: str = field(
        default_factory=lambda: os.environ.get("FRAPPE_SITE", "eswasaone.localhost")
    )
    frappe_admin_user: str = field(
        default_factory=lambda: os.environ.get("FRAPPE_ADMIN_USER", "Administrator")
    )
    frappe_admin_password: str = field(
        default_factory=lambda: os.environ.get("FRAPPE_ADMIN_PASSWORD", "")
    )
    company: str = field(
        default_factory=lambda: os.environ.get("ESWASA_COMPANY", "Eswasa")
    )
    dry_run: bool = False


def get_settings(**overrides: object) -> Settings:
    s = Settings()
    for k, v in overrides.items():
        if hasattr(s, k) and v is not None:
            setattr(s, k, v)
    return s


def year_window(years: int, end_year: int = 2025) -> tuple[int, int]:
    """Inclusive calendar years for volume generation (CI smoke default ~2)."""
    years = max(1, int(years))
    start = max(OPERATIONAL_EPOCH, end_year - years + 1)
    return start, end_year
