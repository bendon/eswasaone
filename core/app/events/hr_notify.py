"""HR notification outbox sender (plan 04): Frappe ``HR Notification`` → Core messaging.

Frappe queues plain-language messages (``eswasa_hr.notify.queue``); this pulls the queued ones
(``eswasa_hr.notify.pending``, System Manager only), sends each through ``get_messaging()`` (console fallback
when SMTP/SMS is unset) and records the result (``eswasa_hr.notify.mark``). Frappe retries a failure until its
attempt limit.

Cron: ``POST /api/events/hr-notify`` with ``{"confirm": true}``, as a System Manager or with the
``X-Cron-Token`` header (see ``core/README.md``). Suggested schedule: every 5–15 minutes.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field
from typing import Any

from app.adapters.messaging import DeliveryStatus, EmailAttachment, EmailRequest, MessagingAdapter, SmsRequest, get_messaging
from app.frappe_client import FrappeClient, FrappeError

logger = logging.getLogger(__name__)

PENDING = "eswasa_hr.notify.pending"
MARK = "eswasa_hr.notify.mark"


@dataclass
class HrNotifyReport:
    sent: int = 0
    failed: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {"sent": self.sent, "failed": self.failed, "skipped": self.skipped, "errors": self.errors}


async def _send(messaging: MessagingAdapter, item: dict[str, Any]) -> tuple[str, str | None]:
    """(Sent | Failed, note) for one message."""
    to = str(item["to"])
    try:
        if item.get("channel") == "sms":
            result = await messaging.send_sms(SmsRequest(to=to, body=f"{item.get('subject') or ''}: {item.get('body') or ''}"[:480]))
        else:
            attachments = [
                EmailAttachment(filename=str(a.get("file_name") or "attachment"), content=base64.b64decode(str(a.get("content") or "")),
                                content_type=str(a.get("content_type") or "application/octet-stream"))
                for a in item.get("attachments") or []
            ]
            result = await messaging.send_email(EmailRequest(to=to, subject=str(item.get("subject") or ""), body=str(item.get("body") or ""),
                                                             attachments=attachments))
    except Exception as exc:  # adapter or provider error: Frappe keeps it queued for a retry
        logger.warning("hr-notify send failed for %s: %s", item.get("name"), exc)
        return "Failed", str(exc)
    if result.status == DeliveryStatus.FAILED:
        return "Failed", result.detail
    return "Sent", (f"console fallback: {result.detail}" if result.stubbed else None)


async def run_hr_notify(session: FrappeClient, *, messaging: MessagingAdapter | None = None, limit: int = 50) -> HrNotifyReport:
    """Send up to ``limit`` queued HR notifications as ``session`` (a System Manager)."""
    messaging = messaging or get_messaging()
    report = HrNotifyReport()
    items = await session.method(PENDING, json={"limit": limit}) or []
    for item in items:
        name = item.get("name")
        if not item.get("to"):
            status, note = "Skipped", "No email address or mobile number for this person"
        else:
            status, note = await _send(messaging, item)
        try:
            await session.method(MARK, json={"name": name, "status": status, "error": note})
        except FrappeError as exc:
            report.errors.append(f"{name}: {exc}")
            continue
        if status == "Sent":
            report.sent += 1
        elif status == "Failed":
            report.failed += 1
        else:
            report.skipped += 1
    return report
