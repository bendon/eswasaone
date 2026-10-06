"""Map Frappe/Core transport failures to short, user-safe HTTP details.

Portals show ``detail`` in the global MessageAlert — never leak method paths,
JSON exception blobs, or Python tracebacks to the user.
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import HTTPException, status

from app.frappe_client import FrappeError
from app.identity.errors import AuthRequired

_HTML = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")

# Transport / wiring — not the user's fault; hide internals.
_INFRA_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"Failed to get method for command|has no attrib|is not whitelisted|"
            r"AttributeError|ModuleNotFoundError|ImportError",
            re.I,
        ),
        "This action isn't available right now. Please try again in a moment.",
    ),
    (
        re.compile(r"Frappe unreachable|ConnectError|Connection refused|timed out", re.I),
        "Records service is temporarily unavailable. Please try again shortly.",
    ),
    (
        re.compile(r"Traceback \(most recent call last\)", re.I),
        "Something went wrong completing that action. Your work wasn't lost — try again.",
    ),
]

_CLIENT_TOKENS = (
    "WorkflowTransitionError",
    "ValidationError",
    "LinkValidationError",
    "MandatoryError",
    "DuplicateEntryError",
    "DoesNotExistError",
    "Illegal transition",
    "confirm=true",
    "expected_state",
)


def _plain(text: str) -> str:
    return _WS.sub(" ", _HTML.sub(" ", text or "")).strip()


def _unwrap_exception_blob(text: str) -> str:
    """Pull the inner Frappe ``exception`` string out of a JSON error body."""
    # Frappe POST /api/method/... failed: {"exception":"..."}
    m = re.search(r"Frappe\s+\w+\s+/api/\S+\s+failed:\s*(\{.*\})\s*$", text, re.I | re.S)
    blob = m.group(1) if m else None
    if not blob and text.lstrip().startswith("{"):
        blob = text
    if not blob:
        # Inline "exception":"ValidationError: foo"
        m2 = re.search(r'"exception"\s*:\s*"((?:\\.|[^"\\]){8,400})"', text)
        if m2:
            return bytes(m2.group(1), "utf-8").decode("unicode_escape", errors="ignore")
        return text
    try:
        data: dict[str, Any] = json.loads(blob)
    except Exception:
        m2 = re.search(r'"exception"\s*:\s*"((?:\\.|[^"\\]){8,400})"', blob)
        if m2:
            return bytes(m2.group(1), "utf-8").decode("unicode_escape", errors="ignore")
        return text
    exc = data.get("exception")
    if isinstance(exc, str) and exc.strip():
        return exc.strip()
    # _server_messages sometimes carries the readable line
    msgs = data.get("_server_messages")
    if isinstance(msgs, str):
        try:
            arr = json.loads(msgs)
            if isinstance(arr, list) and arr:
                first = arr[0]
                if isinstance(first, str):
                    inner = json.loads(first)
                    if isinstance(inner, dict) and inner.get("message"):
                        return str(inner["message"])
        except Exception:
            pass
    return text


def _strip_exc_prefix(text: str) -> str:
    text = re.sub(
        r"^(?:frappe\.[\w.]+\.)?"
        r"(?:WorkflowTransitionError|ValidationError|MandatoryError|"
        r"LinkValidationError|DuplicateEntryError|PermissionError|DoesNotExistError)"
        r":\s*",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"^frappe\.model\.workflow\.\w+:\s*", "", text, flags=re.I)
    return text.strip()


def user_facing_frappe_message(raw: str) -> str:
    """Turn a FrappeError / transport string into a portal-safe sentence."""
    text = _plain(raw)
    text = _unwrap_exception_blob(text)
    text = _plain(text)

    for pattern, message in _INFRA_PATTERNS:
        if pattern.search(text):
            return message

    # Drop transport prefix if a readable message remains
    text = re.sub(r"^Frappe\s+\w+\s+/api/\S+\s+failed:\s*", "", text, flags=re.I)
    text = _strip_exc_prefix(text)

    # Still looks like plumbing → generic
    if re.search(
        r"/api/method/|eswasa_\w+\.api\.|\"exception\"|module '.+' has no",
        text,
        re.I,
    ):
        return "Something went wrong completing that action. Please try again."

    return (text[:240] if text else "Something went wrong. Please try again.")


def raise_from_frappe(exc: FrappeError) -> None:
    """Map Frappe failures to Core status codes with user-safe ``detail``."""
    if exc.status_code == 401:
        raise AuthRequired(
            reason="frappe_session",
            detail="Frappe session expired — sign in again",
        ) from exc

    text = str(exc)
    plain = _plain(text)

    if "PermissionError" in text or "Insufficient Permission" in text:
        m = re.search(r"Insufficient Permission for\s+(.+?)(?:\"|,|\n|$)", plain)
        doc = (m.group(1).strip() if m else "this record").rstrip(".")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"You don't have permission to access {doc}. "
                "Ask HR or a System Manager to grant the right role, then sign out and sign in again."
            ),
        ) from exc

    safe = user_facing_frappe_message(text)

    is_client = any(tok in text for tok in _CLIENT_TOKENS) or (
        exc.status_code is not None and 400 <= exc.status_code < 500
    )
    # Infra patterns stay 502/503 even if ValidationError wrapped them
    is_infra = any(p.search(plain) for p, _ in _INFRA_PATTERNS)

    if is_client and not is_infra:
        code = (
            status.HTTP_404_NOT_FOUND
            if "DoesNotExistError" in text
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=safe) from exc

    if re.search(r"Frappe unreachable|ConnectError|Connection refused", plain, re.I):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=safe) from exc

    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=safe) from exc
