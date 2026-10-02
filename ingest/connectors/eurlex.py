"""EUR-Lex connector — stub."""

# TODO: wire real EUR-Lex SPARQL / CELLAR connector

from __future__ import annotations

from connectors.base import FetchedRecord


def fetch_eurlex(*_args, **_kwargs) -> list[FetchedRecord]:
    raise NotImplementedError("EUR-Lex connector not yet implemented")
