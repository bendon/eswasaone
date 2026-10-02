"""Audit log for gateway and agent mutations."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("eswasaone.audit")


def audit_log(
    *,
    action: str,
    actor: str,
    resource: str,
    detail: dict[str, Any] | None = None,
    confirmed: bool = False,
) -> None:
    """Append-only structured audit event (stdout / Redis later)."""
    event = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "actor": actor,
        "resource": resource,
        "confirmed": confirmed,
        "detail": detail or {},
    }
    logger.info("AUDIT %s", json.dumps(event, default=str))
