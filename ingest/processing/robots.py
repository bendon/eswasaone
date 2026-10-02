"""Robots.txt helpers."""

from __future__ import annotations

from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

import httpx


def can_fetch(base_url: str, path: str, user_agent: str, client: httpx.Client) -> bool:
    rp = RobotFileParser()
    robots_url = urljoin(base_url if base_url.endswith("/") else base_url + "/", "robots.txt")
    try:
        resp = client.get(robots_url)
        if resp.status_code == 200:
            rp.parse(resp.text.splitlines())
        else:
            rp.parse(["User-agent: *", "Allow: /"])
    except httpx.HTTPError:
        rp.parse(["User-agent: *", "Allow: /"])
    return rp.can_fetch(user_agent, urljoin(base_url, path))
