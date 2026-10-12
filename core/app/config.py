"""Application settings loaded from the repo-root `.env`."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    core_port: int = 8015
    core_secret_key: str = "eswasaone-dev-session-secret-change-in-prod"
    core_cors_origins: str = (
        "https://eswasaone.aiceafrica.com,http://127.0.0.1:3015,http://127.0.0.1:3016"
    )

    redis_url: str = "redis://127.0.0.1:6379/15"

    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_collection_prefix: str = "eswasaone_"

    frappe_url: str = "http://127.0.0.1:8020"
    frappe_site: str = "eswasaone.localhost"
    frappe_admin_user: str = "Administrator"
    frappe_admin_password: str = "admin"

    # Guest (anonymous) read-only service account — Orchestrator sets in .env
    frappe_guest_user: str = "Guest"
    frappe_guest_api_key: str = ""
    frappe_guest_api_secret: str = ""

    session_cookie_secure: bool = False
    session_cookie_domain: str = ""

    llm_api_key: str = ""
    llm_model: str = ""

    # Absolute session cookie / Redis TTL (covers OTP trust window + buffer)
    session_ttl_seconds: int = 60 * 60 * 7  # 7h > otp_trust (6h)
    # Idle soft-lock: password-only unlock while OTP trust window active
    session_idle_seconds: int = 60 * 30
    # After successful OTP, trust window before full password+OTP again
    otp_trust_seconds: int = 60 * 60 * 6
    # Emailed OTP code lifetime (not the 6h trust window)
    otp_code_ttl_seconds: int = 60 * 10

    # Bench (System Admin BFF) — optional BENCH_PATH / BENCH_BIN
    bench_path: str = "/srv/projects/eswasaone/engine/frappe-bench"
    bench_bin: str = "bench"

    # Media — S3-compatible bucket (MinIO / AWS / Hetzner) or local filesystem fallback
    media_local_path: str = "/var/lib/eswasaone/media"
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "af-south-1"
    s3_public_base_url: str = ""
    # Object key root inside the bucket (e.g. eswasaone → eswasaone/uploads/…)
    s3_prefix: str = ""

    # Frappe → Core feed bridge (apps POST eswasa_feed here)
    # e.g. http://127.0.0.1:8015/api/events/webhooks/eswasa_feed

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.core_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
