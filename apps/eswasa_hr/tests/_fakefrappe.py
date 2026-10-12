"""A small in-memory ``frappe`` stand-in for glue tests (plan 04 onwards): rows per DocType, filters, Singles."""

from __future__ import annotations

import sys
import types
from datetime import date, datetime
from types import SimpleNamespace


class Throw(Exception):
    pass


def _cmp(value, op, arg):
    v = "" if value is None else str(value)
    if op == "=":
        return value == arg
    if op == "in":
        return value in arg
    if op == "like":
        head, _, tail = str(arg).partition("%")
        return v.startswith(head) and v.endswith(tail)
    if op == "is":
        return bool(value) == (arg == "set")
    if op == "between":
        return str(arg[0]) <= v <= str(arg[1])
    a = str(arg)
    return {"<": v < a, "<=": v <= a, ">": v > a, ">=": v >= a, "!=": v != a}[op]


def match(row, filters):
    for k, cond in (filters or {}).items():
        op, arg = (cond[0], cond[1]) if isinstance(cond, list) else ("=", cond)
        if not _cmp(row.get(k), op, arg):
            return False
    return True


class Doc(dict):
    def __getattr__(self, k):
        if k.startswith("__"):
            raise AttributeError(k)
        return self.get(k)

    def __setattr__(self, k, v):
        self[k] = v


def install(store: dict, user="Administrator", roles=("System Manager",), today="2026-10-16", doctypes=(), meta_fields=None):
    """Install ``frappe`` and ``frappe.utils`` in sys.modules. ``store`` maps DocType → list of row dicts."""
    f = types.ModuleType("frappe")
    f.session = SimpleNamespace(user=user)
    for n in ("ValidationError", "PermissionError", "DoesNotExistError"):
        setattr(f, n, type(n, (Throw,), {}))

    def throw(msg, exc=Throw):
        raise exc(msg)

    f.throw = throw
    f.get_roles = lambda *a: list(roles)
    singles: dict[str, Doc] = {}

    def rows(dt):
        return store.setdefault(dt, [])

    def get_all(dt, filters=None, fields=None, order_by=None, limit=None, **kw):
        return [dict(r) for r in rows(dt) if match(r, filters)][: limit or None]

    def get_value(dt, key, field=None, as_dict=False):
        found = [r for r in rows(dt) if (r.get("name") == key if isinstance(key, str) else match(r, key))] if key else []
        if not found:
            return None
        r = found[0]
        if isinstance(field, list):
            return Doc({k: r.get(k) for k in field}) if as_dict else tuple(r.get(k) for k in field)
        return r.get(field or "name")

    def set_value(dt, name, field, val=None):
        r = next(r for r in rows(dt) if r["name"] == name)
        r.update(field if isinstance(field, dict) else {field: val})

    def exists(dt, key):
        if dt == "DocType":
            return key in doctypes
        return bool(get_value(dt, key))

    f.get_all = get_all
    f.db = SimpleNamespace(get_value=get_value, set_value=set_value, exists=exists, count=lambda dt, flt=None: len(get_all(dt, flt)))
    fields = meta_fields or {}
    f.get_meta = lambda dt: SimpleNamespace(has_field=lambda fn: fn in fields.get(dt, ()))

    class _New(Doc):
        def insert(self, ignore_permissions=False):
            r = rows(self["doctype"])
            self["name"] = self.get("name") or f"{self['doctype'][:4].upper()}-{len(r) + 1}"
            r.append(dict(self))
            return self

    class _Single(Doc):
        flags = SimpleNamespace()

        def save(self):
            store.setdefault("__single__", {})[self["doctype"]] = dict(self)
            return self

    def get_doc(d, *a):
        if isinstance(d, dict):
            return _New(d)
        if not a:  # Single
            return _Single({"doctype": d, **store.get("__single__", {}).get(d, {})})
        return Doc(next(r for r in rows(d) if r["name"] == a[0]))

    f.get_doc = get_doc
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda v: v if isinstance(v, date) else date.fromisoformat(str(v)[:10])
    utils.nowdate = lambda: today
    utils.now_datetime = lambda: datetime.fromisoformat(f"{today}T02:00:00")
    utils.cint = lambda v: int(v or 0)
    utils.add_days = lambda d, n: date.fromordinal(utils.getdate(d).toordinal() + n)
    f.utils = utils
    sys.modules["frappe"] = f
    sys.modules["frappe.utils"] = utils
    return f


def uninstall():
    for m in ("frappe", "frappe.utils"):
        sys.modules.pop(m, None)
