"""Seal/unseal session secrets (Frappe API key/secret) for Redis storage."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os


def _key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def seal(plaintext: str, secret: str) -> str:
    """Encrypt+MAC a short secret. Format: b64(nonce || ciphertext || tag)."""
    key = _key(secret)
    nonce = os.urandom(16)
    stream = hashlib.sha256(key + nonce).digest()
    data = plaintext.encode("utf-8")
    # Extend keystream if needed
    while len(stream) < len(data):
        stream += hashlib.sha256(stream[-32:] + key).digest()
    cipher = bytes(a ^ b for a, b in zip(data, stream[: len(data)], strict=True))
    tag = hmac.new(key, nonce + cipher, hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(nonce + cipher + tag).decode("ascii")


def unseal(token: str, secret: str) -> str | None:
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii"))
    except Exception:  # noqa: BLE001
        return None
    if len(raw) < 33:
        return None
    key = _key(secret)
    nonce, rest = raw[:16], raw[16:]
    cipher, tag = rest[:-16], rest[-16:]
    expect = hmac.new(key, nonce + cipher, hashlib.sha256).digest()[:16]
    if not hmac.compare_digest(tag, expect):
        return None
    stream = hashlib.sha256(key + nonce).digest()
    while len(stream) < len(cipher):
        stream += hashlib.sha256(stream[-32:] + key).digest()
    data = bytes(a ^ b for a, b in zip(cipher, stream[: len(cipher)], strict=True))
    return data.decode("utf-8")
