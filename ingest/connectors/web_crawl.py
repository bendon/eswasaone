"""Generic web crawl connector — stub.

Must respect robots.txt and rate limits when implemented.
"""

# TODO: wire real polite web crawl (robots + rate limit + content-hash dedup)

from __future__ import annotations

from connectors.base import FetchedRecord


def crawl(*_args, **_kwargs) -> list[FetchedRecord]:
    raise NotImplementedError("Web crawl connector not yet implemented")
