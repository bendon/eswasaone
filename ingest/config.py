"""Ingest worker settings — loads monorepo `.env`."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parents[1]
_ENV_FILE = _ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    qdrant_url: str = Field(default="http://127.0.0.1:6333", alias="QDRANT_URL")
    qdrant_collection_prefix: str = Field(
        default="eswasaone_", alias="QDRANT_COLLECTION_PREFIX"
    )
    ingest_object_store_path: str = Field(
        default="/var/lib/eswasaone/ingest", alias="INGEST_OBJECT_STORE_PATH"
    )
    ingest_health_port: int = Field(default=8016, alias="INGEST_HEALTH_PORT")
    frappe_url: str = Field(default="http://127.0.0.1:8020", alias="FRAPPE_URL")
    frappe_admin_user: str = Field(default="Administrator", alias="FRAPPE_ADMIN_USER")
    frappe_admin_password: str = Field(default="admin", alias="FRAPPE_ADMIN_PASSWORD")
    public_base_url: str = Field(
        default="https://eswasaone.aiceafrica.com", alias="PUBLIC_BASE_URL"
    )

    # ePing
    eping_api_base: str = Field(
        default="https://eping.wto.org/api", alias="EPING_API_BASE"
    )
    eping_page_size: int = Field(default=20, alias="EPING_PAGE_SIZE")
    eping_max_pages: int = Field(default=1, alias="EPING_MAX_PAGES")
    eping_rate_limit_seconds: float = Field(default=1.0, alias="EPING_RATE_LIMIT_SECONDS")
    eping_user_agent: str = Field(
        default="EswasaOne-Ingest/0.1 (+https://eswasaone.aiceafrica.com)",
        alias="EPING_USER_AGENT",
    )

    @property
    def tbt_collection(self) -> str:
        return f"{self.qdrant_collection_prefix}tbt_notifications"


@lru_cache
def get_settings() -> Settings:
    return Settings()
