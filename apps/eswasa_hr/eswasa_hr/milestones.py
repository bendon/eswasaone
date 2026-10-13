"""
Long-service milestones (HR additions plan 08, part B).

The milestone years are ESWASA's to set (A8) in ``HR Settings.custom_service_milestones``, as years separated by
commas. Until they are set, nothing is raised and the overview says so; no year is assumed here.

- :func:`next_milestone` is the pure helper the length-of-service report (plan 07) calls.
- The daily step raises one ``Service milestone`` HR Alert per person and milestone, 30 days ahead, to the named
  HR Managers and the person's line manager.
- The HR overview lists this month's and next month's milestones.

Service runs from ``date_of_joining``. A person who joined on 29 February reaches the milestone on 28 February in
a year without one. Leavers (status other than Active) are skipped.

Pure rules sit at the top and are tested without Frappe.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

FIELD = "custom_service_milestones"  # HR Settings
RULE = "Service milestone"  # HR Alert rule
WINDOW = 30  # days ahead the alert is raised (plan 08)


# ---------------------------------------------------------------- pure rules


def _d(v: Any) -> date | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def parse_years(text: Any) -> list[int]:
    """"5, 10, 20" -> [5, 10, 20]. Blank or nonsense entries are ignored; an empty list means none are set."""
    out = set()
    for part in str(text or "").replace(";", ",").split(","):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            out.add(int(part))
    return sorted(out)


def anniversary(joined: Any, years: int) -> date | None:
    j = _d(joined)
    if j is None:
        return None
    try:
        return j.replace(year=j.year + years)
    except ValueError:  # 29 February in a year without one
        return date(j.year + years, 2, 28)


def next_milestone(joined: Any, milestones: Iterable[int], today: date) -> dict[str, Any] | None:
    """The first milestone on or after ``today``: ``{"years", "date"}``, or None (no years set, or all passed)."""
    for years in sorted(set(milestones)):
        when = anniversary(joined, years)
        if when and when >= today:
            return {"years": years, "date": when.isoformat()}
    return None


def milestones_between(people: Iterable[dict[str, Any]], milestones: Iterable[int], start: date, end: date) -> list[dict[str, Any]]:
    """``[{employee, name, years, date}]`` for milestones from ``start`` to ``end`` inclusive, earliest first."""
    years = sorted(set(milestones))
    out = []
    for p in people:
        if (p.get("status") or "Active") != "Active":
            continue
        for y in years:
            when = anniversary(p.get("date_of_joining"), y)
            if when and start <= when <= end:
                out.append({"employee": p.get("name"), "name": p.get("employee_name") or p.get("name"), "years": y, "date": when.isoformat()})
    return sorted(out, key=lambda r: (r["date"], r["name"] or ""))


def upcoming_milestones(people: Iterable[dict[str, Any]], milestones: Iterable[int], today: date, window: int = WINDOW) -> list[dict[str, Any]]:
    return milestones_between(people, milestones, today, today + timedelta(days=window))


def alert_key(employee: str, years: int) -> str:
    return f"service:{employee}:{years}"


def alert_title(name: str, years: int, when: Any) -> str:
    d = _d(when)
    return f"{name} reaches {years} years of service on {d.day} {d.strftime('%b %Y')}"


def months_window(today: date) -> tuple[date, date]:
    """The first day of this month to the last day of next month."""
    start = today.replace(day=1)
    after_next = date(start.year + (start.month + 1) // 12, (start.month + 1) % 12 + 1, 1)
    return start, after_next - timedelta(days=1)


# ---------------------------------------------------------------- Frappe glue


def years_set() -> list[int]:
    from eswasa_hr import settings

    return parse_years(settings._raw(FIELD))


def _people() -> list[dict[str, Any]]:
    import frappe

    from eswasa_hr import settings

    return frappe.get_all("Employee", filters=settings.live({"status": "Active"}),
                          fields=["name", "employee_name", "date_of_joining", "status", "reports_to"], limit=0)


def service_milestones() -> int:
    """Daily: one alert per person and milestone, 30 days ahead, to HR Managers and the line manager."""
    from eswasa_hr.alerts import _today, _user_of, raise_alert, recipients
    from eswasa_hr.recruitment import _hr_manager_users

    years = years_set()
    if not years:
        return 0
    people = _people()
    managers = {p["name"]: p.get("reports_to") for p in people}
    hr = _hr_manager_users()
    n = 0
    for m in upcoming_milestones(people, years, _today()):
        users = recipients(hr, _user_of(managers.get(m["employee"])))
        n += raise_alert(alert_key(m["employee"], m["years"]), RULE, alert_title(m["name"], m["years"], m["date"]), users, m["date"],
                         m["employee"], ("Employee", m["employee"]))
    return n


def overview_block(today: date) -> dict[str, Any]:
    """For the HR overview: whether years are set, and this month's and next month's milestones."""
    years = years_set()
    if not years:
        return {"milestone_years": [], "milestones": []}
    start, end = months_window(today)
    return {"milestone_years": years, "milestones": milestones_between(_people(), years, start, end)}
