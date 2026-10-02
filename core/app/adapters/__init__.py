"""Integration adapters for MoMo, WTO/TBT, and messaging.

WS4 events bus should import from this package::

    from app.adapters import (
        request_to_pay,
        handle_callback,
        handoff_notifications,
        send_email,
        send_sms,
        send_whatsapp,
    )
"""

from app.adapters.messaging import (
    DeliveryStatus,
    EmailRequest,
    MessageResult,
    MessagingAdapter,
    MessagingConfig,
    MessagingPort,
    SmsRequest,
    WhatsAppRequest,
    get_messaging,
    send_email,
    send_sms,
    send_whatsapp,
)
from app.adapters.momo import (
    MoMoAdapter,
    MoMoCallbackEvent,
    MoMoConfig,
    MoMoPaymentStatus,
    RequestToPayRequest,
    RequestToPayResult,
    get_payment_status,
    handle_callback,
    parse_callback,
    request_to_pay,
)
from app.adapters.tbt import (
    TbtAdapter,
    TbtHandoffPayload,
    TbtHandoffResult,
    TbtNotification,
    build_handoff,
    handoff_notifications,
    ingest_normalize,
    mock_recent_notifications,
    normalize_eping_item,
)

__all__ = [
    # Messaging
    "DeliveryStatus",
    "EmailRequest",
    "MessageResult",
    "MessagingAdapter",
    "MessagingConfig",
    "MessagingPort",
    # MoMo
    "MoMoAdapter",
    "MoMoCallbackEvent",
    "MoMoConfig",
    "MoMoPaymentStatus",
    "RequestToPayRequest",
    "RequestToPayResult",
    "SmsRequest",
    # TBT
    "TbtAdapter",
    "TbtHandoffPayload",
    "TbtHandoffResult",
    "TbtNotification",
    "WhatsAppRequest",
    "build_handoff",
    "get_messaging",
    "get_payment_status",
    "handle_callback",
    "handoff_notifications",
    "ingest_normalize",
    "mock_recent_notifications",
    "normalize_eping_item",
    "parse_callback",
    "request_to_pay",
    "send_email",
    "send_sms",
    "send_whatsapp",
]
