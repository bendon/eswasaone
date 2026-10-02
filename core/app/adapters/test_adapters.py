"""Minimal unit tests for WS6 adapters (run from ``core/`` with pytest)."""

from __future__ import annotations

import pytest

from app.adapters.messaging import EmailRequest, MessagingAdapter, MessagingConfig, SmsRequest
from app.adapters.momo import (
    MoMoAdapter,
    MoMoConfig,
    MoMoPaymentStatus,
    RequestToPayRequest,
    parse_callback,
)
from app.adapters.tbt import build_handoff, normalize_eping_item


@pytest.mark.asyncio
async def test_momo_request_to_pay_stubs_without_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("MOMO_SUBSCRIPTION_KEY", "MOMO_API_USER", "MOMO_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    adapter = MoMoAdapter(MoMoConfig())
    result = await adapter.request_to_pay(
        RequestToPayRequest(amount="10.00", msisdn="26876123456", external_id="ord-1")
    )
    assert result.stubbed is True
    assert result.status == MoMoPaymentStatus.STUBBED
    assert result.reference_id
    await adapter.aclose()


def test_momo_parse_callback() -> None:
    ev = parse_callback(
        {
            "referenceId": "ref-9",
            "status": "SUCCESSFUL",
            "amount": "25.50",
            "currency": "SZL",
            "externalId": "ord-9",
        }
    )
    assert ev.reference_id == "ref-9"
    assert ev.status == MoMoPaymentStatus.SUCCESSFUL
    assert ev.amount == "25.50"
    assert ev.external_id == "ord-9"


def test_tbt_normalize_and_handoff_shape() -> None:
    n = normalize_eping_item(
        {
            "id": "G/TBT/N/SWZ/1",
            "title": "Labelling",
            "country": "SWZ",
            "hsCodes": "2201,2202",
            "sectors": ["food"],
        }
    )
    assert n.rights == "open"
    assert n.hs_codes == ["2201", "2202"]
    payload = build_handoff([n])
    assert payload.target_doctype == "TBT Notification"
    assert len(payload.notifications) == 1


@pytest.mark.asyncio
async def test_tbt_handoff_stubs_without_url() -> None:
    from app.adapters.tbt import TbtAdapter, build_handoff

    payload = build_handoff([{"id": "x", "title": "t"}])
    result = await TbtAdapter(handoff_url="").handoff(payload)
    assert result.stubbed is True
    assert result.accepted == 1


@pytest.mark.asyncio
async def test_messaging_console_fallback() -> None:
    adapter = MessagingAdapter(MessagingConfig())
    email = await adapter.send_email(EmailRequest(to="a@example.com", subject="Hi", body="Hello"))
    sms = await adapter.send_sms(SmsRequest(to="26870000000", body="ping"))
    assert email.stubbed and email.channel == "email"
    assert sms.stubbed and sms.channel == "sms"


def test_momo_config_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOMO_SUBSCRIPTION_KEY", "sk")
    monkeypatch.setenv("MOMO_API_USER", "user")
    monkeypatch.setenv("MOMO_API_KEY", "key")
    monkeypatch.setenv("MOMO_CURRENCY", "SZL")
    cfg = MoMoConfig.from_env()
    assert cfg.configured is True
    assert cfg.currency == "SZL"
