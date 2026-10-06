"""Registry build / check smoke tests."""

from __future__ import annotations

from eswasa_registry.build import build_all, check_all, load_all, workflow_fixture
from eswasa_registry.schema import WorkflowRegistry


def test_load_registry_files():
    loaded = load_all()
    names = {p.name for p, _ in loaded}
    assert "certification_application.yaml" in names
    assert "work_item.yaml" in names
    assert "calibration_job.yaml" in names
    assert "tbt_notification.yaml" in names
    assert "board_resolution.yaml" in names
    assert "board_pack.yaml" in names
    assert "field_visit.yaml" in names
    assert "sample.yaml" in names


def test_emit_ports_cover_custom_apps():
    emit = [r for _, r in load_all() if r.emit]
    doctypes = {r.doctype for r in emit}
    assert doctypes >= {
        "Certification Application",
        "Work Item",
        "Calibration Job",
        "TBT Notification",
        "Board Resolution",
        "Board Pack",
    }


def test_certification_is_port_emit():
    reg = next(r for _, r in load_all() if r.doctype == "Certification Application")
    assert reg.emit is True
    assert reg.phase == "port"
    assert reg.fixture_app
    wf = workflow_fixture(reg)[0]
    assert wf["document_type"] == "Certification Application"
    assert wf["name"] == "Certification Application Flow"
    states = {s["state"] for s in wf["states"]}
    assert "Application" in states
    assert "Assessment" in states
    assert "Submitted" not in states  # map names not yet promoted


def test_field_visit_no_emit():
    reg = next(r for _, r in load_all() if r.doctype == "Field Visit")
    assert reg.emit is False
    assert reg.phase == "map"


def test_check_matches_deployed_cert_fixtures():
    errs = check_all()
    assert errs == [], errs


def test_build_dry_run():
    results = build_all(write=False)
    cert = next(r for r in results if r["doctype"] == "Certification Application")
    assert cert["emit"] is True
    assert "artifacts" in cert
    field = next(r for r in results if r["doctype"] == "Field Visit")
    assert field["skipped"] == "emit: false"


def test_schema_rejects_duplicate_states():
    try:
        WorkflowRegistry.model_validate(
            {
                "doctype": "X",
                "module": "x",
                "states": [{"name": "A"}, {"name": "A"}],
                "transitions": [],
            }
        )
        raise AssertionError("expected validation error")
    except Exception as exc:  # noqa: BLE001
        assert "duplicate" in str(exc).lower()
