"""Regulator RSS connector — stub."""

# TODO: wire real regulator RSS / Atom feeds

from __future__ import annotations

from connectors.base import FetchedRecord


def fetch_regulator_rss(*_args, **_kwargs) -> list[FetchedRecord]:
    raise NotImplementedError("Regulator RSS connector not yet implemented")
