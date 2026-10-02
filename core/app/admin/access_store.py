"""Redis-backed Access Security store (LAN CIDRs + device allowlist).

Persistence key prefix ``eswasaone:access:``. Falls back to process memory when
Redis is unavailable — suitable for scaffold; promote to Frappe DocTypes later.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import redis

from app.config import Settings, get_settings
from app.schemas import (
    AdminAccessDevice,
    AdminAccessEvent,
    AdminAccessNetwork,
    AdminAccessPolicy,
)

logger = logging.getLogger(__name__)

_POLICY_KEY = "eswasaone:access:policy"
_NETWORKS_KEY = "eswasaone:access:networks"
_DEVICES_KEY = "eswasaone:access:devices"
_EVENTS_KEY = "eswasaone:access:events"
_EVENTS_MAX = 200

_DEFAULT_POLICY = AdminAccessPolicy(
    enforce_off_lan=False,
    fail_closed=True,
    redirect_path="/",
    notes="Scaffold — enable enforce_off_lan after registering Eswasa LAN CIDRs and devices.",
)

# Sensible starter CIDRs (private RFC1918) — admin should replace with real Eswasa ranges.
_DEFAULT_NETWORKS: list[AdminAccessNetwork] = [
    AdminAccessNetwork(
        id="net-eswasa-lan-placeholder",
        label="Eswasa LAN (placeholder — replace)",
        cidr="10.0.0.0/8",
        enabled=False,
        notes="Disabled until System Manager confirms real LAN CIDR.",
    ),
    AdminAccessNetwork(
        id="net-eswasa-wan-placeholder",
        label="Eswasa WAN (placeholder — replace)",
        cidr="172.16.0.0/12",
        enabled=False,
        notes="Disabled until System Manager confirms real WAN CIDR.",
    ),
]


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class AccessStore:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._redis: redis.Redis | None = None
        self._mem: dict[str, Any] = {
            "policy": _DEFAULT_POLICY.model_dump(),
            "networks": [n.model_dump() for n in _DEFAULT_NETWORKS],
            "devices": [],
            "events": [],
        }
        try:
            client = redis.from_url(self.settings.redis_url, decode_responses=True)
            client.ping()
            self._redis = client
            self._seed_if_empty()
            logger.info("AccessStore using Redis")
        except Exception as exc:  # noqa: BLE001 — fall back for local/dev
            logger.warning("AccessStore Redis unavailable (%s); in-memory", exc)

    def _seed_if_empty(self) -> None:
        assert self._redis is not None
        if not self._redis.exists(_POLICY_KEY):
            self._redis.set(_POLICY_KEY, _DEFAULT_POLICY.model_dump_json())
        if not self._redis.exists(_NETWORKS_KEY):
            self._redis.set(
                _NETWORKS_KEY,
                json.dumps([n.model_dump() for n in _DEFAULT_NETWORKS]),
            )

    def _get_json(self, key: str, mem_key: str) -> Any:
        if self._redis is not None:
            raw = self._redis.get(key)
            if raw:
                return json.loads(raw)
        return self._mem[mem_key]

    def _set_json(self, key: str, mem_key: str, value: Any) -> None:
        self._mem[mem_key] = value
        if self._redis is not None:
            self._redis.set(key, json.dumps(value))

    def get_policy(self) -> AdminAccessPolicy:
        data = self._get_json(_POLICY_KEY, "policy")
        if isinstance(data, str):
            data = json.loads(data)
        return AdminAccessPolicy.model_validate(data)

    def set_policy(self, policy: AdminAccessPolicy) -> AdminAccessPolicy:
        dumped = policy.model_dump()
        self._mem["policy"] = dumped
        if self._redis is not None:
            self._redis.set(_POLICY_KEY, policy.model_dump_json())
        return policy

    def list_networks(self) -> list[AdminAccessNetwork]:
        rows = self._get_json(_NETWORKS_KEY, "networks") or []
        return [AdminAccessNetwork.model_validate(r) for r in rows]

    def save_networks(self, items: list[AdminAccessNetwork]) -> list[AdminAccessNetwork]:
        self._set_json(_NETWORKS_KEY, "networks", [n.model_dump() for n in items])
        return items

    def list_devices(self) -> list[AdminAccessDevice]:
        rows = self._get_json(_DEVICES_KEY, "devices") or []
        return [AdminAccessDevice.model_validate(r) for r in rows]

    def save_devices(self, items: list[AdminAccessDevice]) -> list[AdminAccessDevice]:
        self._set_json(_DEVICES_KEY, "devices", [d.model_dump() for d in items])
        return items

    def list_events(self, *, limit: int = 50) -> list[AdminAccessEvent]:
        rows = self._get_json(_EVENTS_KEY, "events") or []
        events = [AdminAccessEvent.model_validate(r) for r in rows]
        return events[: max(1, min(limit, _EVENTS_MAX))]

    def append_event(self, event: AdminAccessEvent) -> None:
        rows = self._get_json(_EVENTS_KEY, "events") or []
        rows.insert(0, event.model_dump())
        self._set_json(_EVENTS_KEY, "events", rows[:_EVENTS_MAX])

    def ip_on_trusted_network(self, ip: str | None) -> bool:
        if not ip:
            return False
        try:
            addr = ipaddress.ip_address(ip.split("%")[0])
        except ValueError:
            return False
        for net in self.list_networks():
            if not net.enabled:
                continue
            try:
                network = ipaddress.ip_network(net.cidr, strict=False)
            except ValueError:
                continue
            if addr in network:
                return True
        return False

    def find_device_by_fingerprint(self, fingerprint: str | None) -> AdminAccessDevice | None:
        if not fingerprint:
            return None
        for d in self.list_devices():
            if d.fingerprint == fingerprint:
                return d
        return None


_store: AccessStore | None = None


def get_access_store() -> AccessStore:
    global _store
    if _store is None:
        _store = AccessStore()
    return _store


def make_network(
    *,
    label: str,
    cidr: str,
    enabled: bool = True,
    notes: str | None = None,
) -> AdminAccessNetwork:
    # Validate CIDR early
    ipaddress.ip_network(cidr, strict=False)
    return AdminAccessNetwork(
        id=_new_id("net"),
        label=label.strip(),
        cidr=cidr.strip(),
        enabled=enabled,
        notes=notes,
    )


def make_device(
    *,
    label: str,
    fingerprint: str,
    owner_username: str | None = None,
    status: str = "pending",
    expires_at: str | None = None,
    notes: str | None = None,
    approved_by: str | None = None,
) -> AdminAccessDevice:
    now = _now_iso()
    approved = status == "approved"
    return AdminAccessDevice(
        id=_new_id("dev"),
        label=label.strip(),
        fingerprint=fingerprint.strip(),
        owner_username=owner_username,
        status=status,  # type: ignore[arg-type]
        created_at=now,
        approved_at=now if approved else None,
        approved_by=approved_by if approved else None,
        expires_at=expires_at,
        notes=notes,
    )


def make_event(
    *,
    outcome: str,
    reason: str,
    ip: str | None = None,
    username: str | None = None,
    device_id: str | None = None,
    path: str | None = None,
) -> AdminAccessEvent:
    return AdminAccessEvent(
        id=_new_id("evt"),
        time=_now_iso(),
        outcome=outcome,  # type: ignore[arg-type]
        reason=reason,
        ip=ip,
        username=username,
        device_id=device_id,
        path=path,
    )
