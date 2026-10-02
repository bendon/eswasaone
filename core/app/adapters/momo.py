"""MTN MoMo Eswatini — Collection request-to-pay + callback helpers.

Sandbox-friendly. Reads ``MOMO_*`` from the environment. When credentials are
empty, operations return typed stubs (no network) so WS4/events can call safely.
"""

from __future__ import annotations

import base64
import logging
import os
import uuid
from collections.abc import Mapping
from datetime import UTC, datetime
from enum import Enum
from typing import Any

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# MTN Collection API (sandbox default). Production Eswatini uses target env ``mtnswaziland``.
_DEFAULT_BASE_URL = "https://sandbox.momodeveloper.mtn.com"
_DEFAULT_TARGET_ENV = "sandbox"
_DEFAULT_CURRENCY = "SZL"


class MoMoPaymentStatus(str, Enum):
    PENDING = "PENDING"
    SUCCESSFUL = "SUCCESSFUL"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"
    STUBBED = "STUBBED"


class MoMoConfig(BaseModel):
    """Runtime config loaded from ``MOMO_*`` env vars."""

    subscription_key: str = ""
    api_user: str = ""
    api_key: str = ""
    callback_url: str = ""
    base_url: str = _DEFAULT_BASE_URL
    target_environment: str = _DEFAULT_TARGET_ENV
    currency: str = _DEFAULT_CURRENCY

    @property
    def configured(self) -> bool:
        return bool(self.subscription_key and self.api_user and self.api_key)

    @classmethod
    def from_env(cls) -> MoMoConfig:
        return cls(
            subscription_key=os.getenv("MOMO_SUBSCRIPTION_KEY", "").strip(),
            api_user=os.getenv("MOMO_API_USER", "").strip(),
            api_key=os.getenv("MOMO_API_KEY", "").strip(),
            callback_url=os.getenv("MOMO_CALLBACK_URL", "").strip(),
            base_url=os.getenv("MOMO_BASE_URL", _DEFAULT_BASE_URL).rstrip("/"),
            target_environment=os.getenv("MOMO_TARGET_ENVIRONMENT", _DEFAULT_TARGET_ENV).strip()
            or _DEFAULT_TARGET_ENV,
            currency=os.getenv("MOMO_CURRENCY", _DEFAULT_CURRENCY).strip() or _DEFAULT_CURRENCY,
        )


class RequestToPayRequest(BaseModel):
    """Outbound Collection request-to-pay."""

    amount: str = Field(..., description="Decimal string, e.g. '150.00'")
    msisdn: str = Field(..., description="Payer MSISDN without +, e.g. 26876123456")
    external_id: str = Field(..., description="Merchant / order correlation id")
    currency: str | None = None
    payer_message: str = "EswasaOne payment"
    payee_note: str = "EswasaOne"
    reference_id: str | None = Field(
        default=None,
        description="UUID; generated if omitted (also sent as X-Reference-Id)",
    )


class RequestToPayResult(BaseModel):
    """Result of initiating a request-to-pay (live or stub)."""

    reference_id: str
    external_id: str
    status: MoMoPaymentStatus
    stubbed: bool = False
    amount: str | None = None
    currency: str | None = None
    detail: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class MoMoCallbackEvent(BaseModel):
    """Normalized callback payload for the events bus."""

    reference_id: str
    status: MoMoPaymentStatus
    financial_transaction_id: str | None = None
    external_id: str | None = None
    amount: str | None = None
    currency: str | None = None
    reason: str | None = None
    received_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    raw: dict[str, Any] = Field(default_factory=dict)


class MoMoAdapter:
    """Collection API client. Safe to construct without credentials (stub mode)."""

    def __init__(
        self, config: MoMoConfig | None = None, *, client: httpx.AsyncClient | None = None
    ):
        self.config = config or MoMoConfig.from_env()
        self._client = client
        self._owns_client = client is None

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _subscription_headers(self) -> dict[str, str]:
        return {"Ocp-Apim-Subscription-Key": self.config.subscription_key}

    async def _access_token(self) -> str:
        """OAuth token via Collection ``/collection/token/``."""
        userpass = f"{self.config.api_user}:{self.config.api_key}".encode()
        basic = base64.b64encode(userpass).decode()
        client = await self._http()
        resp = await client.post(
            f"{self.config.base_url}/collection/token/",
            headers={
                **self._subscription_headers(),
                "Authorization": f"Basic {basic}",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        token = data.get("access_token")
        if not token:
            raise RuntimeError("MoMo token response missing access_token")
        return str(token)

    async def request_to_pay(self, req: RequestToPayRequest) -> RequestToPayResult:
        """Initiate a Collection request-to-pay.

        Stub mode (missing keys): returns ``STUBBED`` without calling MoMo.
        """
        reference_id = req.reference_id or str(uuid.uuid4())
        currency = req.currency or self.config.currency

        if not self.config.configured:
            logger.info(
                "MoMo stub request_to_pay ref=%s external_id=%s amount=%s %s → %s",
                reference_id,
                req.external_id,
                req.amount,
                currency,
                req.msisdn,
            )
            return RequestToPayResult(
                reference_id=reference_id,
                external_id=req.external_id,
                status=MoMoPaymentStatus.STUBBED,
                stubbed=True,
                amount=req.amount,
                currency=currency,
                detail="MOMO_* credentials empty — stubbed request-to-pay",
            )

        token = await self._access_token()
        headers: dict[str, str] = {
            **self._subscription_headers(),
            "Authorization": f"Bearer {token}",
            "X-Reference-Id": reference_id,
            "X-Target-Environment": self.config.target_environment,
            "Content-Type": "application/json",
        }
        if self.config.callback_url:
            headers["X-Callback-Url"] = self.config.callback_url

        body = {
            "amount": req.amount,
            "currency": currency,
            "externalId": req.external_id,
            "payer": {"partyIdType": "MSISDN", "partyId": req.msisdn.lstrip("+")},
            "payerMessage": req.payer_message[:160],
            "payeeNote": req.payee_note[:160],
        }

        client = await self._http()
        resp = await client.post(
            f"{self.config.base_url}/collection/v1_0/requesttopay",
            headers=headers,
            json=body,
        )
        # MoMo returns 202 Accepted on success with empty body.
        if resp.status_code not in (200, 202):
            detail = resp.text[:500]
            logger.warning("MoMo request_to_pay failed %s: %s", resp.status_code, detail)
            return RequestToPayResult(
                reference_id=reference_id,
                external_id=req.external_id,
                status=MoMoPaymentStatus.FAILED,
                amount=req.amount,
                currency=currency,
                detail=f"HTTP {resp.status_code}: {detail}",
                raw={"status_code": resp.status_code, "body": detail},
            )

        return RequestToPayResult(
            reference_id=reference_id,
            external_id=req.external_id,
            status=MoMoPaymentStatus.PENDING,
            amount=req.amount,
            currency=currency,
            detail="Accepted by MoMo",
            raw={"status_code": resp.status_code},
        )

    async def get_payment_status(self, reference_id: str) -> RequestToPayResult:
        """Poll Collection request-to-pay status by reference id."""
        if not self.config.configured:
            return RequestToPayResult(
                reference_id=reference_id,
                external_id="",
                status=MoMoPaymentStatus.STUBBED,
                stubbed=True,
                detail="MOMO_* credentials empty — stubbed status check",
            )

        token = await self._access_token()
        client = await self._http()
        resp = await client.get(
            f"{self.config.base_url}/collection/v1_0/requesttopay/{reference_id}",
            headers={
                **self._subscription_headers(),
                "Authorization": f"Bearer {token}",
                "X-Target-Environment": self.config.target_environment,
            },
        )
        if resp.status_code != 200:
            return RequestToPayResult(
                reference_id=reference_id,
                external_id="",
                status=MoMoPaymentStatus.FAILED,
                detail=f"HTTP {resp.status_code}: {resp.text[:500]}",
                raw={"status_code": resp.status_code},
            )

        data = resp.json()
        status_raw = str(data.get("status", "PENDING")).upper()
        try:
            status = MoMoPaymentStatus(status_raw)
        except ValueError:
            status = MoMoPaymentStatus.PENDING

        return RequestToPayResult(
            reference_id=reference_id,
            external_id=str(data.get("externalId") or ""),
            status=status,
            amount=str(data["amount"]) if data.get("amount") is not None else None,
            currency=data.get("currency"),
            detail=data.get("reason"),
            raw=data if isinstance(data, dict) else {"body": data},
        )


def parse_callback(payload: Mapping[str, Any]) -> MoMoCallbackEvent:
    """Normalize an inbound MoMo callback JSON body for the events bus.

    Accepts both MTN Collection callback shapes and a thin local stub shape
    (``reference_id`` / ``status``).

    >>> ev = parse_callback({"referenceId": "abc", "status": "SUCCESSFUL", "amount": "10"})
    >>> ev.reference_id, ev.status.value
    ('abc', 'SUCCESSFUL')
    """
    raw = dict(payload)
    reference_id = str(raw.get("referenceId") or raw.get("reference_id") or raw.get("id") or "")
    status_raw = str(raw.get("status") or "PENDING").upper()
    try:
        status = MoMoPaymentStatus(status_raw)
    except ValueError:
        status = MoMoPaymentStatus.PENDING

    return MoMoCallbackEvent(
        reference_id=reference_id,
        status=status,
        financial_transaction_id=_opt_str(
            raw.get("financialTransactionId") or raw.get("financial_transaction_id")
        ),
        external_id=_opt_str(raw.get("externalId") or raw.get("external_id")),
        amount=_opt_str(raw.get("amount")),
        currency=_opt_str(raw.get("currency")),
        reason=_opt_str(raw.get("reason")),
        raw=raw,
    )


def _opt_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


# Module-level helpers for the events bus (stateless convenience).


async def request_to_pay(
    req: RequestToPayRequest, *, config: MoMoConfig | None = None
) -> RequestToPayResult:
    adapter = MoMoAdapter(config)
    try:
        return await adapter.request_to_pay(req)
    finally:
        await adapter.aclose()


async def get_payment_status(
    reference_id: str, *, config: MoMoConfig | None = None
) -> RequestToPayResult:
    adapter = MoMoAdapter(config)
    try:
        return await adapter.get_payment_status(reference_id)
    finally:
        await adapter.aclose()


def handle_callback(payload: Mapping[str, Any]) -> MoMoCallbackEvent:
    """Alias for :func:`parse_callback` — WS4 route handler entrypoint."""
    return parse_callback(payload)
