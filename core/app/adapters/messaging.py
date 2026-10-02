"""Messaging adapter — email / SMS / WhatsApp with console/log fallback.

When provider credentials are missing, messages are logged and returned as
``stubbed`` so the events bus never hard-fails on empty env.
"""

from __future__ import annotations

import logging
import os
import smtplib
import uuid
from email.message import EmailMessage
from enum import Enum
from pathlib import Path
from typing import Any, Literal, Protocol

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = _REPO_ROOT / ".env"

Channel = Literal["email", "sms", "whatsapp"]


def _load_dotenv_file(path: Path) -> dict[str, str]:
    vals: dict[str, str] = {}
    if not path.is_file():
        return vals
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def _env(key: str, default: str = "") -> str:
    """Prefer process env; fall back to repo-root ``.env`` (SMTP_* live there)."""
    if key in os.environ and os.environ[key] != "":
        return os.environ[key].strip()
    return _load_dotenv_file(_ENV_FILE).get(key, default).strip()


class DeliveryStatus(str, Enum):
    SENT = "sent"
    STUBBED = "stubbed"
    FAILED = "failed"


class MessageResult(BaseModel):
    channel: Channel
    status: DeliveryStatus
    message_id: str
    to: str
    stubbed: bool = False
    detail: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class EmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    html: str | None = None
    from_addr: str | None = None
    # Optional RFC-5322 headers (e.g. Message-ID to prevent client threading).
    headers: dict[str, str] = Field(
        default_factory=dict,
        description="Extra SMTP headers (e.g. Message-ID, X-Entity-ID for anti-grouping).",
    )


class SmsRequest(BaseModel):
    to: str = Field(..., description="E.164 or local MSISDN")
    body: str


class WhatsAppRequest(BaseModel):
    to: str = Field(..., description="WhatsApp-capable MSISDN")
    body: str
    template_name: str | None = None
    template_params: list[str] = Field(default_factory=list)


class MessagingConfig(BaseModel):
    """Optional provider settings (Orchestrator may add to ``.env.example``)."""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_from_name: str = ""
    smtp_use_tls: bool = True
    sms_api_url: str = ""
    sms_api_key: str = ""
    whatsapp_api_url: str = ""
    whatsapp_token: str = ""
    whatsapp_from: str = ""

    @classmethod
    def from_env(cls) -> MessagingConfig:
        return cls(
            smtp_host=_env("SMTP_HOST"),
            smtp_port=int(_env("SMTP_PORT", "587") or "587"),
            smtp_user=_env("SMTP_USER"),
            smtp_password=_env("SMTP_PASSWORD"),
            smtp_from=_env("SMTP_FROM"),
            smtp_from_name=_env("SMTP_FROM_NAME"),
            smtp_use_tls=_env("SMTP_USE_TLS", "true").lower() not in ("0", "false", "no"),
            sms_api_url=_env("SMS_API_URL"),
            sms_api_key=_env("SMS_API_KEY"),
            whatsapp_api_url=_env("WHATSAPP_API_URL"),
            whatsapp_token=_env("WHATSAPP_TOKEN"),
            whatsapp_from=_env("WHATSAPP_FROM"),
        )

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    @property
    def sms_configured(self) -> bool:
        return bool(self.sms_api_url and self.sms_api_key)

    @property
    def whatsapp_configured(self) -> bool:
        return bool(self.whatsapp_api_url and self.whatsapp_token)


class MessagingPort(Protocol):
    """Typed surface the events bus depends on."""

    async def send_email(self, req: EmailRequest) -> MessageResult: ...

    async def send_sms(self, req: SmsRequest) -> MessageResult: ...

    async def send_whatsapp(self, req: WhatsAppRequest) -> MessageResult: ...


class MessagingAdapter:
    """Email / SMS / WhatsApp sender with console fallback."""

    def __init__(self, config: MessagingConfig | None = None):
        self.config = config or MessagingConfig.from_env()

    def _new_id(self) -> str:
        return str(uuid.uuid4())

    def _stub(self, channel: Channel, to: str, *, detail: str, **extra: Any) -> MessageResult:
        mid = self._new_id()
        logger.info("messaging stub [%s] id=%s to=%s %s %s", channel, mid, to, detail, extra or "")
        print(f"[messaging:{channel}] stub → {to} | {detail} | {extra}", flush=True)
        return MessageResult(
            channel=channel,
            status=DeliveryStatus.STUBBED,
            message_id=mid,
            to=to,
            stubbed=True,
            detail=detail,
            raw=dict(extra),
        )

    async def send_email(self, req: EmailRequest) -> MessageResult:
        from email.utils import formataddr

        from_addr = req.from_addr or self.config.smtp_from or "noreply@eswasaone.local"
        if not self.config.email_configured:
            return self._stub(
                "email",
                req.to,
                detail="SMTP_HOST/SMTP_FROM empty — console fallback",
                subject=req.subject,
                body=req.body[:200],
            )

        from_header = (
            formataddr((self.config.smtp_from_name, from_addr))
            if self.config.smtp_from_name
            else from_addr
        )
        msg = EmailMessage()
        msg["Subject"] = req.subject
        msg["From"] = from_header
        msg["To"] = req.to
        msg.set_content(req.body)
        if req.html:
            msg.add_alternative(req.html, subtype="html")

        # Unique Message-ID per email — prevents Gmail/Outlook from grouping
        # OTP emails into a single thread.
        mid = self._new_id()
        domain = from_addr.split("@")[-1] if "@" in from_addr else "eswasaone.local"
        msg["Message-ID"] = f"<{mid}@{domain}>"

        # Apply any caller-supplied headers (e.g. X-Entity-ID, X-Auto-Response-Suppress)
        for hk, hv in (req.headers or {}).items():
            if hk.lower() not in ("message-id", "subject", "from", "to"):
                msg[hk] = hv

        try:
            # Sync SMTP in a thread-friendly blocking call; fine for low volume.
            with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port, timeout=30) as smtp:
                if self.config.smtp_use_tls:
                    smtp.starttls()
                if self.config.smtp_user:
                    smtp.login(self.config.smtp_user, self.config.smtp_password)
                smtp.send_message(msg)
        except Exception as exc:
            logger.exception("email send failed")
            return MessageResult(
                channel="email",
                status=DeliveryStatus.FAILED,
                message_id=mid,
                to=req.to,
                detail=str(exc),
            )

        return MessageResult(
            channel="email",
            status=DeliveryStatus.SENT,
            message_id=mid,
            to=req.to,
            detail="SMTP accepted",
        )

    async def send_sms(self, req: SmsRequest) -> MessageResult:
        if not self.config.sms_configured:
            return self._stub(
                "sms",
                req.to,
                detail="SMS_API_URL/SMS_API_KEY empty — console fallback",
                body=req.body[:160],
            )

        mid = self._new_id()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    self.config.sms_api_url,
                    headers={"Authorization": f"Bearer {self.config.sms_api_key}"},
                    json={"to": req.to, "body": req.body, "message_id": mid},
                )
                if resp.status_code >= 400:
                    return MessageResult(
                        channel="sms",
                        status=DeliveryStatus.FAILED,
                        message_id=mid,
                        to=req.to,
                        detail=f"HTTP {resp.status_code}: {resp.text[:300]}",
                        raw={"status_code": resp.status_code},
                    )
        except Exception as exc:
            logger.exception("sms send failed")
            return MessageResult(
                channel="sms",
                status=DeliveryStatus.FAILED,
                message_id=mid,
                to=req.to,
                detail=str(exc),
            )

        return MessageResult(
            channel="sms",
            status=DeliveryStatus.SENT,
            message_id=mid,
            to=req.to,
            detail="SMS provider accepted",
        )

    async def send_whatsapp(self, req: WhatsAppRequest) -> MessageResult:
        if not self.config.whatsapp_configured:
            return self._stub(
                "whatsapp",
                req.to,
                detail="WHATSAPP_API_URL/WHATSAPP_TOKEN empty — console fallback",
                body=req.body[:160],
                template=req.template_name,
            )

        mid = self._new_id()
        payload: dict[str, Any] = {
            "to": req.to,
            "from": self.config.whatsapp_from or None,
            "body": req.body,
            "message_id": mid,
        }
        if req.template_name:
            payload["template"] = {
                "name": req.template_name,
                "params": req.template_params,
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    self.config.whatsapp_api_url,
                    headers={"Authorization": f"Bearer {self.config.whatsapp_token}"},
                    json=payload,
                )
                if resp.status_code >= 400:
                    return MessageResult(
                        channel="whatsapp",
                        status=DeliveryStatus.FAILED,
                        message_id=mid,
                        to=req.to,
                        detail=f"HTTP {resp.status_code}: {resp.text[:300]}",
                        raw={"status_code": resp.status_code},
                    )
        except Exception as exc:
            logger.exception("whatsapp send failed")
            return MessageResult(
                channel="whatsapp",
                status=DeliveryStatus.FAILED,
                message_id=mid,
                to=req.to,
                detail=str(exc),
            )

        return MessageResult(
            channel="whatsapp",
            status=DeliveryStatus.SENT,
            message_id=mid,
            to=req.to,
            detail="WhatsApp provider accepted",
        )


_default: MessagingAdapter | None = None


def get_messaging() -> MessagingAdapter:
    """Process-wide default adapter (events bus)."""
    global _default
    if _default is None:
        _default = MessagingAdapter()
    return _default


async def send_email(req: EmailRequest) -> MessageResult:
    return await get_messaging().send_email(req)


async def send_sms(req: SmsRequest) -> MessageResult:
    return await get_messaging().send_sms(req)


async def send_whatsapp(req: WhatsAppRequest) -> MessageResult:
    return await get_messaging().send_whatsapp(req)
