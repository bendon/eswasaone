"""Wave 1 route smoke — F0b gate."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.gateway import wave1
from app.main import create_app


def test_wave1_router_paths() -> None:
    paths = {getattr(r, "path", "") for r in wave1.router.routes}
    expected = [
        "/certification/audits/{audit_id}",
        "/standards/ballots/{ballot_id}/vote",
        "/approvals/{doctype}/{name}/escalate",
        "/field/me/audits",
        "/field/me/summary",
        "/estore/cart",
        "/estore/orders/{order_id}",
        "/estore/licences/{licence_id}/download",
        "/hr/access-requests",
        "/ingest/queue",
    ]
    for p in expected:
        assert p in paths, f"missing route {p} in wave1.router"


def test_wave1_mounted_on_app() -> None:
    app = create_app()
    schema = app.openapi()
    api_paths = set(schema.get("paths", {}))
    assert any("field/me/audits" in p for p in api_paths), api_paths


def test_health() -> None:
    client = TestClient(create_app())
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
