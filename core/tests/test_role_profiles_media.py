"""Role profile catalog + media status smoke."""

from __future__ import annotations

from app.identity.role_profiles import get_role_profile, list_role_profiles
from app.media.store import MediaStore
from app.config import Settings


def test_role_profiles_include_citizen_and_business():
    names = {p["name"] for p in list_role_profiles()}
    assert "Citizen" in names
    assert "Business" in names
    assert "Institution Staff" in names
    assert "Certification Directorate" in names


def test_citizen_profile_is_thin():
    p = get_role_profile("Citizen")
    assert p is not None
    assert p["roles"] == ["Citizen"]
    assert p["audience"] == "public"


def test_business_profile_not_staff():
    p = get_role_profile("Business")
    assert p is not None
    assert "ESWASA Staff" not in p["roles"]
    assert "Citizen" in p["roles"]
    assert "Customer" in p["roles"]


def test_media_store_defaults_local(tmp_path):
    settings = Settings(media_local_path=str(tmp_path), s3_bucket="")
    store = MediaStore(settings)
    assert store.backend == "local"
    obj = store.put_bytes(b"hello", filename="note.txt", prefix="tests")
    assert obj.backend == "local"
    assert obj.size == 5
    data, ctype = store.get_bytes(obj.key)
    assert data == b"hello"
    assert "text" in ctype or ctype == "application/octet-stream"
