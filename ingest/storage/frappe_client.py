"""Frappe metadata writer — httpx; stubs OK when Frappe is unreachable."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import Settings

logger = logging.getLogger(__name__)


class FrappeIngestClient:
    """Best-effort REST client for eswasa_ingest DocTypes."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.base = settings.frappe_url.rstrip("/")
        self._session: httpx.Client | None = None
        self.available = False

    def connect(self) -> bool:
        self._session = httpx.Client(base_url=self.base, timeout=15.0, follow_redirects=True)
        try:
            # Probe; login optional — stub when down.
            resp = self._session.get("/api/method/frappe.ping")
            if resp.status_code >= 500:
                self.available = False
                return False
            # Attempt login for writes (ignore failure — metadata becomes stub).
            try:
                login = self._session.post(
                    "/api/method/login",
                    data={
                        "usr": self.settings.frappe_admin_user,
                        "pwd": self.settings.frappe_admin_password,
                    },
                )
                self.available = login.status_code < 400
            except httpx.HTTPError:
                self.available = False
            return self.available
        except httpx.HTTPError as exc:
            logger.info("Frappe unreachable (%s) — metadata writes stubbed", exc)
            self.available = False
            return False

    def close(self) -> None:
        if self._session:
            self._session.close()
            self._session = None

    def upsert_source(self, fields: dict[str, Any]) -> dict[str, Any]:
        return self._upsert("Source", fields, match_field="title")

    def upsert_ingested_document(self, fields: dict[str, Any]) -> dict[str, Any]:
        return self._upsert("Ingested Document", fields, match_field="external_id")

    def create_curation_task(self, fields: dict[str, Any]) -> dict[str, Any]:
        return self._create("Curation Task", fields)

    def _upsert(
        self, doctype: str, fields: dict[str, Any], *, match_field: str
    ) -> dict[str, Any]:
        if not self.available or not self._session:
            stub = {"doctype": doctype, "stub": True, **fields}
            logger.debug("stub upsert %s %s", doctype, fields.get(match_field))
            return stub
        # TODO: wire real list+update when DocTypes migrated on bench
        try:
            key = fields.get(match_field)
            listed = self._session.get(
                f"/api/resource/{doctype}",
                params={"filters": f'[["{match_field}","=","{key}"]]', "limit_page_length": 1},
            )
            if listed.status_code == 200:
                data = listed.json().get("data") or []
                if data:
                    name = data[0]["name"]
                    resp = self._session.put(f"/api/resource/{doctype}/{name}", json=fields)
                    resp.raise_for_status()
                    return resp.json().get("data") or {"name": name, **fields}
            return self._create(doctype, fields)
        except httpx.HTTPError as exc:
            logger.warning("Frappe upsert failed for %s: %s", doctype, exc)
            return {"doctype": doctype, "stub": True, "error": str(exc), **fields}

    def _create(self, doctype: str, fields: dict[str, Any]) -> dict[str, Any]:
        if not self.available or not self._session:
            return {"doctype": doctype, "stub": True, **fields}
        try:
            resp = self._session.post(f"/api/resource/{doctype}", json=fields)
            resp.raise_for_status()
            return resp.json().get("data") or fields
        except httpx.HTTPError as exc:
            logger.warning("Frappe create failed for %s: %s", doctype, exc)
            return {"doctype": doctype, "stub": True, "error": str(exc), **fields}
