"""Plan 10: the HR contract can't drift from Core.

Every route Core serves under /api/hr, /api/careers and /api/me has a matching path and method in
contracts/openapi.yaml, and every such path in the contract has a handler. Path parameter names
don't have to match (``{id}`` vs ``{employee_id}``); only the shape of the path does.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml
from fastapi.routing import APIRoute

from app.main import app

CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "openapi.yaml"
PREFIXES = ("/hr", "/careers", "/me")
METHODS = {"get", "post", "put", "patch", "delete"}


def _shape(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", path.rstrip("/") or "/")


def _ours(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in PREFIXES)


def _api_routes(routes, prefix: str = ""):
    """Every APIRoute with its full path. FastAPI 0.142+ keeps included routers as wrappers
    (``original_router`` + ``include_context.prefix``) instead of copying their routes."""
    for route in routes:
        if isinstance(route, APIRoute):
            yield prefix + route.path, route
        elif getattr(route, "original_router", None) is not None:
            yield from _api_routes(route.original_router.routes, prefix + route.include_context.prefix)


def core_routes() -> set[tuple[str, str]]:
    out = set()
    for full, route in _api_routes(app.routes):
        if not full.startswith("/api/"):
            continue
        path = full[len("/api"):]
        if _ours(path):
            out |= {(m.lower(), _shape(path)) for m in route.methods if m.lower() in METHODS}
    return out


def contract_routes() -> set[tuple[str, str]]:
    spec = yaml.safe_load(CONTRACT.read_text())
    out = set()
    for path, ops in (spec.get("paths") or {}).items():
        if _ours(path):
            out |= {(m, _shape(path)) for m in ops if m in METHODS}
    return out


def _listing(rows: set[tuple[str, str]]) -> str:
    return "\n".join(f"  {m.upper():6} {p}" for m, p in sorted(rows, key=lambda r: (r[1], r[0])))


def test_every_core_hr_route_is_in_the_contract() -> None:
    missing = core_routes() - contract_routes()
    assert not missing, "Core routes missing from contracts/openapi.yaml:\n" + _listing(missing)


def test_every_contract_hr_path_has_a_handler() -> None:
    stale = contract_routes() - core_routes()
    assert not stale, "contracts/openapi.yaml paths with no Core handler:\n" + _listing(stale)


def test_contract_has_one_definition_per_schema() -> None:
    """A duplicate key (CertificationScheme, until plan 10) silently drops one definition and blocks codegen."""
    names = re.findall(r"^    (\w+):\s*$", CONTRACT.read_text().split("\n  schemas:\n", 1)[1], re.M)
    dupes = sorted({n for n in names if names.count(n) > 1})
    assert not dupes, f"Duplicate component schemas: {dupes}"
