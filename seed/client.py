"""Synchronous Frappe REST client (Administrator session from env)."""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote

import requests

from seed.config import Settings

log = logging.getLogger("seed.client")


def _exc_detail(resp: requests.Response) -> str:
    try:
        data = resp.json()
        return str(data.get("exception") or data.get("exc_type") or resp.text[:300])
    except Exception:
        return resp.text[:300]


class FrappeError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, body: str | None = None):
        super().__init__(message)
        self.status = status
        self.body = body


class FrappeClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Host": settings.frappe_site,
                "Accept": "application/json",
            }
        )
        self._logged_in = False
        self.reachable: bool | None = None

    @property
    def base(self) -> str:
        return self.settings.frappe_url.rstrip("/")

    def ping(self) -> bool:
        try:
            r = self.session.get(f"{self.base}/api/method/ping", timeout=5)
            self.reachable = r.status_code < 500
        except requests.RequestException:
            self.reachable = False
        return bool(self.reachable)

    def login(self) -> None:
        if self.settings.dry_run:
            return
        if not self.settings.frappe_admin_password:
            raise FrappeError("FRAPPE_ADMIN_PASSWORD not set in environment / .env")
        r = self.session.post(
            f"{self.base}/api/method/login",
            data={
                "usr": self.settings.frappe_admin_user,
                "pwd": self.settings.frappe_admin_password,
            },
            timeout=20,
        )
        self.reachable = True
        if r.status_code >= 400 or "sid" not in self.session.cookies:
            raise FrappeError("Admin login failed", r.status_code, r.text[:300])
        self._logged_in = True
        log.info("Logged in as %s @ %s", self.settings.frappe_admin_user, self.settings.frappe_site)

    def method(self, method_path: str, **kwargs: Any) -> Any:
        if self.settings.dry_run:
            log.info(
                "[dry-run] method %s %s",
                method_path,
                {k: v for k, v in kwargs.items() if k != "pwd"},
            )
            return None
        r = self.session.post(
            f"{self.base}/api/method/{method_path}",
            json=kwargs or None,
            timeout=60,
        )
        if r.status_code >= 400:
            detail = _exc_detail(r)
            raise FrappeError(
                f"method {method_path} failed: {detail}", r.status_code, r.text[:800]
            )
        data = r.json()
        if data.get("exc"):
            detail = data.get("exception") or data.get("exc_type") or "exc"
            raise FrappeError(f"method {method_path}: {detail}", body=r.text[:800])
        return data.get("message", data)

    def get_doc(self, doctype: str, name: str) -> dict[str, Any] | None:
        if self.settings.dry_run:
            return None
        path = f"/api/resource/{quote(doctype, safe='')}/{quote(name, safe='')}"
        r = self.session.get(f"{self.base}{path}", timeout=30)
        if r.status_code == 404:
            return None
        if r.status_code >= 400:
            raise FrappeError(f"get {doctype}/{name}", r.status_code, r.text[:400])
        return r.json().get("data")

    def exists(self, doctype: str, name: str) -> bool:
        if self.settings.dry_run:
            return False
        try:
            return bool(self.method("frappe.client.get_value", doctype=doctype, filters=name, fieldname="name"))
        except FrappeError:
            return self.get_doc(doctype, name) is not None

    def get_count(self, doctype: str, filters: list[Any] | None = None) -> int:
        if self.settings.dry_run:
            return 0
        msg = self.method("frappe.client.get_count", doctype=doctype, filters=filters or None)
        return int(msg or 0)

    def get_list(
        self,
        doctype: str,
        *,
        filters: list[Any] | dict[str, Any] | None = None,
        fields: list[str] | None = None,
        limit: int = 20,
        order_by: str | None = None,
    ) -> list[dict[str, Any]]:
        if self.settings.dry_run:
            return []
        kwargs: dict[str, Any] = {
            "doctype": doctype,
            "fields": fields or ["name"],
            "limit_page_length": limit,
        }
        if filters is not None:
            kwargs["filters"] = filters
        if order_by:
            kwargs["order_by"] = order_by
        msg = self.method("frappe.client.get_list", **kwargs)
        return list(msg or [])

    def insert(self, doc: dict[str, Any]) -> dict[str, Any]:
        if self.settings.dry_run:
            log.info("[dry-run] insert %s name=%s", doc.get("doctype"), doc.get("name"))
            return dict(doc)
        msg = self.method("frappe.client.insert", doc=doc)
        return msg if isinstance(msg, dict) else {"name": msg}

    def set_value(self, doctype: str, name: str, field: str, value: Any) -> None:
        if self.settings.dry_run:
            log.info("[dry-run] set_value %s/%s %s", doctype, name, field)
            return
        # Workflow-controlled fields often reject set_value — use resource PUT.
        if field == "workflow_state":
            self.resource_update(doctype, name, {field: value})
            return
        self.method(
            "frappe.client.set_value",
            doctype=doctype,
            name=name,
            fieldname=field,
            value=value,
        )

    def resource_update(self, doctype: str, name: str, fields: dict[str, Any]) -> dict[str, Any]:
        if self.settings.dry_run:
            log.info("[dry-run] PUT %s/%s %s", doctype, name, sorted(fields))
            return fields
        path = f"/api/resource/{quote(doctype, safe='')}/{quote(name, safe='')}"
        r = self.session.put(f"{self.base}{path}", json=fields, timeout=60)
        if r.status_code >= 400:
            raise FrappeError(
                f"PUT {doctype}/{name}: {_exc_detail(r)}", r.status_code, r.text[:800]
            )
        return r.json().get("data") or fields

    def apply_workflow(self, doc: dict[str, Any], action: str) -> dict[str, Any]:
        if self.settings.dry_run:
            log.info("[dry-run] workflow %s %s", doc.get("name"), action)
            return doc
        r = self.session.post(
            f"{self.base}/api/method/frappe.model.workflow.apply_workflow",
            data={"doc": json.dumps(doc), "action": action},
            timeout=60,
        )
        if r.status_code >= 400:
            raise FrappeError(
                f"apply_workflow {action}: {_exc_detail(r)}", r.status_code, r.text[:800]
            )
        return r.json().get("message") or doc

    def save(self, doc: dict[str, Any]) -> dict[str, Any]:
        if self.settings.dry_run:
            log.info("[dry-run] save %s/%s", doc.get("doctype"), doc.get("name"))
            return doc
        msg = self.method("frappe.client.save", doc=doc)
        return msg if isinstance(msg, dict) else doc

    def delete(self, doctype: str, name: str) -> None:
        if self.settings.dry_run:
            log.info("[dry-run] delete %s/%s", doctype, name)
            return
        self.method("frappe.client.delete", doctype=doctype, name=name)

    def rename(self, doctype: str, old: str, new: str) -> str:
        if self.settings.dry_run:
            log.info("[dry-run] rename %s %s -> %s", doctype, old, new)
            return new
        if old == new:
            return new
        self.method(
            "frappe.rename_doc",
            doctype=doctype,
            old=old,
            new=new,
            force=True,
        )
        return new

    # Soft-skip workflow_state during upsert field compare/set for controlled doctypes
    WORKFLOW_SKIP = {"workflow_state"}

    def upsert(
        self,
        doctype: str,
        name: str,
        fields: dict[str, Any],
        *,
        rename_from: str | None = None,
    ) -> str:
        """Ensure a doc exists under ``name``. Idempotent when already present."""
        if self.settings.dry_run:
            log.info("[dry-run] upsert %s/%s keys=%s", doctype, name, sorted(fields))
            return name

        existing = self.get_doc(doctype, name)
        if existing:
            dirty = False
            for k, v in fields.items():
                if k in ("doctype", "name") or v is None or k in self.WORKFLOW_SKIP:
                    continue
                if existing.get(k) != v:
                    try:
                        self.set_value(doctype, name, k, v)
                        dirty = True
                    except FrappeError as exc:
                        log.warning("upsert set %s/%s.%s: %s", doctype, name, k, exc)
            if "workflow_state" in fields and fields["workflow_state"]:
                try:
                    self.resource_update(
                        doctype, name, {"workflow_state": fields["workflow_state"]}
                    )
                    dirty = True
                except FrappeError as exc:
                    log.warning("upsert workflow %s/%s: %s", doctype, name, exc)
            if dirty:
                log.info("Updated %s/%s", doctype, name)
            else:
                log.info("Exists %s/%s", doctype, name)
            return name

        doc = {"doctype": doctype, **{k: v for k, v in fields.items() if k != "workflow_state"}}
        if rename_from is None:
            doc["name"] = name
        inserted = self.insert(doc)
        actual = inserted.get("name") or name
        if actual != name:
            try:
                self.rename(doctype, actual, name)
                actual = name
            except FrappeError as exc:
                log.warning("Could not rename %s %s -> %s: %s", doctype, actual, name, exc)
        else:
            log.info("Created %s/%s", doctype, name)
        if fields.get("workflow_state"):
            try:
                self.resource_update(
                    doctype, actual, {"workflow_state": fields["workflow_state"]}
                )
            except FrappeError as exc:
                log.warning("post-insert workflow %s/%s: %s", doctype, actual, exc)
        return actual

    def doctype_exists(self, doctype: str) -> bool:
        if self.settings.dry_run:
            return True
        try:
            return bool(
                self.method(
                    "frappe.client.get_value",
                    doctype="DocType",
                    filters=doctype,
                    fieldname="name",
                )
            )
        except FrappeError:
            return False
