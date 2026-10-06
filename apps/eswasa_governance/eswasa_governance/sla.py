# Copyright (c) 2026, ESWASA and contributors
# License: MIT
"""L9 — working-day SLA arithmetic against ERPNext Holiday List (Eswatini)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import frappe
from frappe.utils import add_days, getdate, nowdate

_DEFAULT_HOLIDAY_LIST = "Eswatini"


def holiday_dates(holiday_list: str | None = None) -> set[date]:
	"""Return holiday dates for the named Holiday List (empty if missing)."""
	name = holiday_list or frappe.conf.get("eswasa_holiday_list") or _DEFAULT_HOLIDAY_LIST
	if not frappe.db.exists("Holiday List", name):
		# Fall back to any Holiday List tagged Eswatini / default company.
		name = frappe.db.get_value("Holiday List", {}, "name", order_by="creation asc")
		if not name:
			return set()
	rows = frappe.get_all(
		"Holiday",
		filters={"parent": name},
		fields=["holiday_date"],
	)
	out: set[date] = set()
	for row in rows:
		try:
			out.add(getdate(row.holiday_date))
		except Exception:
			continue
	return out


def add_working_days(
	start: date | str | None,
	days: int,
	*,
	holiday_list: str | None = None,
) -> date:
	"""Add ``days`` working days (skip Sat/Sun + Holiday List). L9."""
	cur = getdate(start or nowdate())
	if days <= 0:
		return cur
	holidays = holiday_dates(holiday_list)
	remaining = days
	while remaining > 0:
		cur = add_days(cur, 1)
		wd = cur.weekday()  # Mon=0 … Sun=6
		if wd >= 5 or cur in holidays:
			continue
		remaining -= 1
	return getdate(cur)


def working_days_between(
	start: date | str | None,
	end: date | str | None,
	*,
	holiday_list: str | None = None,
) -> int:
	"""Count working days strictly after start up to and including end."""
	a = getdate(start or nowdate())
	b = getdate(end or nowdate())
	if b <= a:
		return 0
	holidays = holiday_dates(holiday_list)
	n = 0
	cur = a
	while cur < b:
		cur = add_days(cur, 1)
		if cur.weekday() < 5 and cur not in holidays:
			n += 1
	return n


def ensure_eswatini_holiday_list() -> dict[str, Any]:
	"""Idempotent seed of a minimal Eswatini Holiday List for SLA (L9)."""
	name = _DEFAULT_HOLIDAY_LIST
	if frappe.db.exists("Holiday List", name):
		return {"name": name, "created": False}
	year = getdate(nowdate()).year
	doc = frappe.get_doc(
		{
			"doctype": "Holiday List",
			"holiday_list_name": name,
			"from_date": f"{year}-01-01",
			"to_date": f"{year}-12-31",
		}
	)
	# Public holidays (fixed-date subset; moveable feasts left for ops).
	fixed = [
		(f"{year}-01-01", "New Year's Day"),
		(f"{year}-04-25", "National Flag Day"),
		(f"{year}-04-19", "King's Birthday"),
		(f"{year}-07-22", "Late King Sobhuza Birthday"),
		(f"{year}-09-06", "Independence Day"),
		(f"{year}-12-25", "Christmas Day"),
		(f"{year}-12-26", "Boxing Day"),
	]
	for d, desc in fixed:
		doc.append("holidays", {"holiday_date": d, "description": desc})
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": name, "created": True}
