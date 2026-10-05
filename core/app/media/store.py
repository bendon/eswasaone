"""S3-compatible / local object store for uploads and generated documents."""

from __future__ import annotations

import logging
import mimetypes
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass
class StoredObject:
    key: str
    bucket: str
    content_type: str
    size: int
    url: str
    backend: str


class MediaStore:
    """Local filesystem by default; S3 when ``s3_bucket`` + credentials are set."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._s3 = None

    @property
    def backend(self) -> str:
        if self.settings.s3_bucket and self.settings.s3_access_key and self.settings.s3_secret_key:
            return "s3"
        return "local"

    def _local_root(self) -> Path:
        root = Path(self.settings.media_local_path)
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _client(self) -> Any:
        if self._s3 is not None:
            return self._s3
        try:
            import boto3  # type: ignore[import-untyped]
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "boto3 is required for S3 media; pip install boto3 or use local MEDIA_LOCAL_PATH"
            ) from exc
        kwargs: dict[str, Any] = {
            "aws_access_key_id": self.settings.s3_access_key,
            "aws_secret_access_key": self.settings.s3_secret_key,
            "region_name": self.settings.s3_region or "us-east-1",
        }
        if self.settings.s3_endpoint_url:
            kwargs["endpoint_url"] = self.settings.s3_endpoint_url
        self._s3 = boto3.client("s3", **kwargs)
        return self._s3

    def _make_key(self, *, filename: str | None, prefix: str) -> str:
        safe = (filename or "blob").replace("/", "_").replace("\\", "_")
        stamp = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        return f"{prefix.strip('/')}/{stamp}/{uuid.uuid4().hex[:12]}_{safe}"

    def put_bytes(
        self,
        data: bytes,
        *,
        filename: str | None = None,
        content_type: str | None = None,
        prefix: str = "uploads",
    ) -> StoredObject:
        ctype = content_type or mimetypes.guess_type(filename or "")[0] or "application/octet-stream"
        key = self._make_key(filename=filename, prefix=prefix)
        if self.backend == "s3":
            bucket = self.settings.s3_bucket
            client = self._client()
            extra: dict[str, Any] = {"ContentType": ctype}
            client.put_object(Bucket=bucket, Key=key, Body=data, **extra)
            url = self._public_url(bucket, key)
            return StoredObject(
                key=key,
                bucket=bucket,
                content_type=ctype,
                size=len(data),
                url=url,
                backend="s3",
            )

        path = self._local_root() / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return StoredObject(
            key=key,
            bucket="local",
            content_type=ctype,
            size=len(data),
            url=f"/api/media/{key}",
            backend="local",
        )

    def get_bytes(self, key: str) -> tuple[bytes, str]:
        if self.backend == "s3":
            obj = self._client().get_object(Bucket=self.settings.s3_bucket, Key=key)
            body = obj["Body"].read()
            ctype = obj.get("ContentType") or "application/octet-stream"
            return body, ctype
        path = self._local_root() / key
        if not path.is_file():
            raise FileNotFoundError(key)
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return path.read_bytes(), ctype

    def _public_url(self, bucket: str, key: str) -> str:
        base = (self.settings.s3_public_base_url or "").rstrip("/")
        if base:
            return f"{base}/{key}"
        endpoint = (self.settings.s3_endpoint_url or "").rstrip("/")
        if endpoint:
            return f"{endpoint}/{bucket}/{key}"
        return f"/api/media/{key}"


_store: MediaStore | None = None


def get_media_store() -> MediaStore:
    global _store
    if _store is None:
        _store = MediaStore()
    return _store
