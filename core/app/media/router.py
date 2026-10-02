"""Media upload / download — S3 bucket or local fallback."""

from __future__ import annotations

from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.audit import audit_log
from app.identity.deps import AuthContext, require_auth, require_auth_csrf
from app.media.store import MediaStore, get_media_store

router = APIRouter(prefix="/media", tags=["media"])


class MediaObjectOut(BaseModel):
    key: str
    bucket: str
    content_type: str
    size: int
    url: str
    backend: str


class MediaStatusOut(BaseModel):
    backend: str
    bucket: str | None = None
    ready: bool = True


@router.get("/status", response_model=MediaStatusOut)
async def media_status(
    auth: Annotated[AuthContext, Depends(require_auth)],
    store: Annotated[MediaStore, Depends(get_media_store)],
) -> MediaStatusOut:
    _ = auth
    return MediaStatusOut(
        backend=store.backend,
        bucket=store.settings.s3_bucket or None,
        ready=True,
    )


@router.post("/upload", response_model=MediaObjectOut, status_code=status.HTTP_201_CREATED)
async def upload_media(
    auth: Annotated[AuthContext, Depends(require_auth_csrf)],
    store: Annotated[MediaStore, Depends(get_media_store)],
    file: UploadFile = File(...),
    prefix: str = Form(default="uploads"),
) -> MediaObjectOut:
    """Store an uploaded or generated document in S3 (or local media root)."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    try:
        stored = store.put_bytes(
            data,
            filename=file.filename,
            content_type=file.content_type,
            prefix=prefix.strip() or "uploads",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    audit_log(
        action="media.upload",
        actor=auth.user.username,
        resource=stored.key,
        detail={"size": stored.size, "backend": stored.backend, "prefix": prefix},
        confirmed=True,
    )
    return MediaObjectOut(
        key=stored.key,
        bucket=stored.bucket,
        content_type=stored.content_type,
        size=stored.size,
        url=stored.url,
        backend=stored.backend,
    )


@router.get("/{key:path}")
async def download_media(
    key: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    store: Annotated[MediaStore, Depends(get_media_store)],
) -> Response:
    _ = auth
    try:
        body, ctype = store.get_bytes(key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Object not found") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    filename = key.rsplit("/", 1)[-1]
    return Response(
        content=body,
        media_type=ctype,
        headers={
            "Content-Disposition": f'inline; filename="{quote(filename)}"',
            "Cache-Control": "private, max-age=300",
        },
    )
