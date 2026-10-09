"""Analytics NL→Frappe bridge — Core metrics without Insights dependency.

Permission-bound via acts-as-user get_list / method calls. No mock KPI numbers:
callers must fail 502/503 when Frappe is unreachable or permission-denied.
"""

from __future__ import annotations

import re
from typing import Any

from app.frappe_client import FrappeClient, FrappeError

# Curated Core-backed reports (R-D1 catalogue). Titles only — values come live.
REPORT_CATALOGUE: list[dict[str, str | None]] = [
    {
        "id": "revenue",
        "title": "Revenue YTD (Sales Invoice)",
        "period": "ytd",
    },
    {
        "id": "budget",
        "title": "Budget vs actual",
        "period": "fiscal",
    },
    {
        "id": "finance_kpis",
        "title": "Finance dashboard KPIs",
        "period": "ytd",
    },
    {
        "id": "plan",
        "title": "Annual-plan traffic lights",
        "period": "annual",
    },
    {
        "id": "certificates",
        "title": "Issued certificates",
        "period": None,
    },
    {
        "id": "applications",
        "title": "Certification applications",
        "period": None,
    },
    {
        "id": "overdue_audits",
        "title": "Overdue audits",
        "period": None,
    },
    {
        "id": "standards",
        "title": "Published standards",
        "period": None,
    },
    {
        "id": "employees",
        "title": "Headcount",
        "period": None,
    },
    {
        "id": "leave",
        "title": "Open leave applications",
        "period": None,
    },
    {
        "id": "deals",
        "title": "CRM deals / opportunities",
        "period": None,
    },
    {
        "id": "enrolments",
        "title": "LMS enrolments",
        "period": None,
    },
    {
        "id": "regulator_pack",
        "title": "Regulator / annual-plan pack (R-D1)",
        "period": "quarterly",
    },
]

_INTENT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\brevenue|\bincome|\bsales\s+invoice|\bytd\b", re.I), "revenue"),
    (re.compile(r"\bbudget|\bvariance", re.I), "budget"),
    (re.compile(r"\btraffic\s*light|\bannual\s*plan|\bplan\s+kpi", re.I), "plan"),
    (re.compile(r"\bfinance\s+kpi|\bfinance\s+dashboard", re.I), "finance_kpis"),
    (re.compile(r"\bcertificat", re.I), "certificates"),
    (re.compile(r"\bapplication|\bcert\s+app", re.I), "applications"),
    (re.compile(r"\boverdue\b.*\baudit|\baudit\b.*\boverdue", re.I), "overdue_audits"),
    (re.compile(r"\baudit", re.I), "overdue_audits"),
    (re.compile(r"\bstandard|\bszns", re.I), "standards"),
    (re.compile(r"\bheadcount|\bemployee|\bstaff\s+count", re.I), "employees"),
    (re.compile(r"\bleave", re.I), "leave"),
    (re.compile(r"\bdeal|\bpipeline|\bopportunit", re.I), "deals"),
    (re.compile(r"\benrol|\bcourse|\blms|\btraining", re.I), "enrolments"),
    (re.compile(r"\bregulator|\bboard\s+pack|\bannual.?plan\s+report", re.I), "regulator_pack"),
]


async def _get_list(
    session: FrappeClient,
    doctype: str,
    *,
    fields: list[str],
    filters: list[Any] | dict[str, Any] | None = None,
    limit: int = 200,
    order_by: str | None = None,
) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {
        "doctype": doctype,
        "fields": fields,
        "limit_page_length": limit,
    }
    if filters is not None:
        payload["filters"] = filters
    if order_by:
        payload["order_by"] = order_by
    raw = await session.method("frappe.client.get_list", json=payload)
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    return []


def resolve_metric_key(question_or_metric: str) -> str | None:
    """Map NL question or path slug to a known metric id."""
    key = question_or_metric.strip().lower().replace("-", "_").replace(" ", "_")
    known = {str(r["id"]) for r in REPORT_CATALOGUE}
    if key in known:
        return key
    for pattern, metric in _INTENT_PATTERNS:
        if pattern.search(question_or_metric):
            return metric
    return None


async def fetch_metric(session: FrappeClient, metric: str) -> dict[str, Any]:
    """Return live metric payload. Raises FrappeError on upstream failure."""
    key = resolve_metric_key(metric) or metric.strip().lower()

    if key == "revenue":
        rows = await _get_list(
            session,
            "Sales Invoice",
            fields=["name", "customer", "grand_total", "posting_date", "status", "cost_center"],
            filters=[["docstatus", "=", 1]],
            limit=200,
            order_by="posting_date desc",
        )
        total = sum(float(r.get("grand_total") or 0) for r in rows)
        return {
            "metric": "revenue",
            "count": len(rows),
            "total_szl": total,
            "items": rows,
        }

    if key == "budget":
        rows = await _get_list(
            session,
            "Budget",
            fields=["name", "cost_center", "from_fiscal_year", "to_fiscal_year", "company", "budget_amount"],
            limit=100,
            order_by="modified desc",
        )
        return {"metric": "budget", "count": len(rows), "items": rows}

    if key in ("finance_kpis", "plan", "regulator_pack"):
        raw = await session.method("eswasa_governance.api.finance_kpis")
        if not isinstance(raw, dict):
            raise FrappeError("finance_kpis returned unexpected shape", status_code=502)
        if key == "plan":
            plan = raw.get("plan") or []
            # R-D2 signal: surface threshold breaches (amber/red) — alert→feed is S9.
            breaches = [
                p
                for p in plan
                if isinstance(p, dict) and str(p.get("status") or "").lower() in ("amber", "red")
            ]
            return {
                "metric": "plan",
                "plan": plan,
                "breach_count": len(breaches),
                "breaches": breaches,
            }
        if key == "regulator_pack":
            # R-D1 pack snapshot from live finance KPIs (cron/email delivery = stub).
            return {
                "metric": "regulator_pack",
                "title": "Regulator / annual-plan pack",
                "period": "quarterly",
                "revenue_ytd_szl": raw.get("revenue_ytd_szl"),
                "budget_ytd_szl": raw.get("budget_ytd_szl"),
                "variance_pct": raw.get("variance_pct"),
                "plan": raw.get("plan") or [],
            }
        return {"metric": "finance_kpis", **raw}

    if key == "certificates":
        rows = await _get_list(
            session,
            "Certificate",
            fields=["name", "status", "application", "certificate_number", "docstatus"],
            limit=200,
            order_by="modified desc",
        )
        return {"metric": "certificates", "count": len(rows), "items": rows}

    if key == "applications":
        rows = await _get_list(
            session,
            "Certification Application",
            fields=["name", "scheme", "applicant_name", "workflow_state", "status"],
            limit=200,
            order_by="modified desc",
        )
        return {"metric": "applications", "count": len(rows), "items": rows}

    if key == "overdue_audits":
        rows = await _get_list(
            session,
            "Audit",
            fields=["name", "status", "application", "planned_date", "auditor"],
            filters=[["status", "=", "Overdue"]],
            limit=100,
            order_by="planned_date asc",
        )
        return {"metric": "overdue_audits", "count": len(rows), "items": rows}

    if key == "standards":
        rows = await _get_list(
            session,
            "Standard",
            fields=["name", "title", "workflow_state", "sector"],
            filters=[["workflow_state", "=", "Published"]],
            limit=200,
            order_by="modified desc",
        )
        return {"metric": "standards", "count": len(rows), "items": rows}

    if key == "employees":
        rows = await _get_list(
            session,
            "Employee",
            fields=["name", "employee_name", "department", "status"],
            filters=[["status", "=", "Active"]],
            limit=200,
            order_by="employee_name asc",
        )
        return {"metric": "employees", "count": len(rows), "items": rows}

    if key == "leave":
        rows = await _get_list(
            session,
            "Leave Application",
            fields=["name", "employee", "employee_name", "leave_type", "status", "from_date"],
            filters=[["status", "in", ["Open", "Approved"]]],
            limit=100,
            order_by="from_date desc",
        )
        return {"metric": "leave", "count": len(rows), "items": rows}

    if key == "deals":
        rows = await _get_list(
            session,
            "CRM Deal",
            fields=["name", "deal_name", "amount", "status", "organization"],
            limit=100,
            order_by="modified desc",
        )
        if not rows:
            rows = await _get_list(
                session,
                "Opportunity",
                fields=["name", "opportunity_name", "opportunity_amount", "status"],
                limit=100,
                order_by="modified desc",
            )
        return {"metric": "deals", "count": len(rows), "items": rows}

    if key == "enrolments":
        rows = await _get_list(
            session,
            "LMS Enrollment",
            fields=["name", "course", "member", "progress"],
            limit=200,
            order_by="modified desc",
        )
        return {"metric": "enrolments", "count": len(rows), "items": rows}

    raise FrappeError(f"Unknown analytics metric: {metric}", status_code=404)


def _figure_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    metric = str(payload.get("metric") or "")
    figure: dict[str, Any] = {"metric": metric}
    if "count" in payload:
        figure["value"] = payload["count"]
        figure["unit"] = "count"
    if "total_szl" in payload:
        figure["total_szl"] = payload["total_szl"]
        figure["value"] = payload["total_szl"]
        figure["unit"] = "SZL"
    if "revenue_ytd_szl" in payload:
        figure["revenue_ytd_szl"] = payload["revenue_ytd_szl"]
        figure["budget_ytd_szl"] = payload.get("budget_ytd_szl")
        figure["variance_pct"] = payload.get("variance_pct")
        figure["value"] = payload.get("revenue_ytd_szl")
        figure["unit"] = "SZL"
    if "breach_count" in payload:
        figure["breach_count"] = payload["breach_count"]
        figure["value"] = payload["breach_count"]
        figure["unit"] = "thresholds"
    if "plan" in payload and "value" not in figure:
        figure["plan"] = payload["plan"]
    return figure


def _answer_for(payload: dict[str, Any], question: str) -> str:
    metric = str(payload.get("metric") or "")
    if metric == "revenue":
        return (
            f"Revenue from {payload.get('count', 0)} submitted Sales Invoices: "
            f"{payload.get('total_szl', 0):,.2f} SZL."
        )
    if metric == "budget":
        return f"Found {payload.get('count', 0)} Budget records visible to you."
    if metric == "certificates":
        return f"There are {payload.get('count', 0)} Certificate records you can read."
    if metric == "applications":
        return f"There are {payload.get('count', 0)} Certification Applications visible."
    if metric == "overdue_audits":
        return f"Overdue audits: {payload.get('count', 0)}."
    if metric == "standards":
        return f"Published standards: {payload.get('count', 0)}."
    if metric == "employees":
        return f"Active employees (headcount): {payload.get('count', 0)}."
    if metric == "leave":
        return f"Open/approved leave applications: {payload.get('count', 0)}."
    if metric == "deals":
        return f"CRM deals/opportunities: {payload.get('count', 0)}."
    if metric == "enrolments":
        return f"LMS enrolments: {payload.get('count', 0)}."
    if metric == "plan":
        n = payload.get("breach_count", 0)
        return f"Annual-plan traffic lights: {n} amber/red threshold breach(es)."
    if metric == "finance_kpis":
        return (
            f"Finance KPIs: revenue YTD {payload.get('revenue_ytd_szl', 0)} SZL, "
            f"budget YTD {payload.get('budget_ytd_szl', 0)} SZL, "
            f"variance {payload.get('variance_pct', 0)}%."
        )
    if metric == "regulator_pack":
        return (
            "Regulator/annual-plan pack snapshot (R-D1): "
            f"revenue YTD {payload.get('revenue_ytd_szl', 0)} SZL, "
            f"variance {payload.get('variance_pct', 0)}%. "
            "Scheduled email delivery remains a Frappe/events stub."
        )
    return f"Live analytics for “{question}” (metric={metric}): {payload}"


async def ask_analytics(session: FrappeClient, question: str) -> dict[str, Any]:
    """NL → structured metric → answer + figures (AnalyticsAskResponse shape)."""
    key = resolve_metric_key(question)
    if key is None:
        available = ", ".join(sorted(str(r["id"]) for r in REPORT_CATALOGUE))
        return {
            "answer": (
                "I could not map that question to a Core metric. "
                f"Try asking about: {available}."
            ),
            "citations": [],
            "figures": [],
        }
    payload = await fetch_metric(session, key)
    figure = _figure_from_payload(payload)
    citation = {
        "source_id": key,
        "title": next(
            (str(r["title"]) for r in REPORT_CATALOGUE if r["id"] == key),
            key,
        ),
        "rights": "internal",
    }
    return {
        "answer": _answer_for(payload, question),
        "citations": [citation],
        "figures": [figure],
    }


def list_report_summaries() -> list[dict[str, Any]]:
    """Static catalogue of Core-backed reports (no invented KPI values)."""
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "period": r.get("period"),
        }
        for r in REPORT_CATALOGUE
    ]
