"""Session store — Redis when available, in-memory fallback."""

from __future__ import annotations

import json
import logging
import secrets
import time
from typing import Any

import redis

from app.config import Settings, get_settings
from app.identity.crypto import seal, unseal
from app.schemas import SessionUser

logger = logging.getLogger(__name__)

_SESSION_PREFIX = "eswasaone:session:"
COOKIE_NAME = "eswasaone_session"
CSRF_COOKIE_NAME = "eswasaone_csrf"


class SessionStore:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._memory: dict[str, dict[str, Any]] = {}
        self._redis: redis.Redis | None = None
        try:
            client = redis.from_url(self.settings.redis_url, decode_responses=True)
            client.ping()
            self._redis = client
            logger.info("SessionStore using Redis")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis unavailable (%s); using in-memory sessions", exc)

    def create(
        self,
        user: SessionUser,
        *,
        frappe_sid: str | None = None,
        frappe_api_key: str | None = None,
        frappe_api_secret: str | None = None,
        mock: bool = False,
        otp_verified_until: float | None = None,
    ) -> tuple[str, str]:
        """Create session; returns (session_id, csrf_token)."""
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(24)
        secret = self.settings.core_secret_key
        now = time.time()
        if otp_verified_until is None:
            otp_verified_until = now + self.settings.otp_trust_seconds
        payload: dict[str, Any] = {
            "user": user.model_dump(),
            "frappe_sid": frappe_sid,
            "csrf_token": csrf,
            "mock": mock,
            "created_at": now,
            "last_activity_at": now,
            "otp_verified_until": otp_verified_until,
            "locked": False,
        }
        if frappe_api_key and frappe_api_secret:
            payload["frappe_api_key_enc"] = seal(frappe_api_key, secret)
            payload["frappe_api_secret_enc"] = seal(frappe_api_secret, secret)
        self._set(token, payload)
        return token, csrf

    def get(self, token: str) -> dict[str, Any] | None:
        return self._get(token)

    def update(self, token: str, **fields: Any) -> dict[str, Any] | None:
        data = self._get(token)
        if not data:
            return None
        data.update(fields)
        self._set(token, data)
        return data

    def touch(self, token: str) -> dict[str, Any] | None:
        return self.update(token, last_activity_at=time.time(), locked=False)

    def lock(self, token: str) -> dict[str, Any] | None:
        return self.update(token, locked=True)

    def get_api_credentials(self, data: dict[str, Any]) -> tuple[str | None, str | None]:
        secret = self.settings.core_secret_key
        key_enc = data.get("frappe_api_key_enc")
        secret_enc = data.get("frappe_api_secret_enc")
        if not key_enc or not secret_enc:
            return None, None
        return unseal(str(key_enc), secret), unseal(str(secret_enc), secret)

    def delete(self, token: str) -> None:
        if self._redis is not None:
            self._redis.delete(f"{_SESSION_PREFIX}{token}")
        self._memory.pop(token, None)

    def _set(self, token: str, payload: dict[str, Any]) -> None:
        ttl = self.settings.session_ttl_seconds
        if self._redis is not None:
            self._redis.set(
                f"{_SESSION_PREFIX}{token}",
                json.dumps(payload),
                ex=ttl,
            )
        else:
            payload["_expires"] = time.time() + ttl
            self._memory[token] = payload

    def _get(self, token: str) -> dict[str, Any] | None:
        if self._redis is not None:
            raw = self._redis.get(f"{_SESSION_PREFIX}{token}")
            if not raw:
                return None
            return json.loads(raw)
        payload = self._memory.get(token)
        if not payload:
            return None
        if payload.get("_expires", 0) < time.time():
            self._memory.pop(token, None)
            return None
        return payload


_store: SessionStore | None = None


def get_session_store() -> SessionStore:
    global _store
    if _store is None:
        _store = SessionStore()
    return _store
