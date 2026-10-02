"""EswasaOne Core — FastAPI BFF entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.admin.access import router as access_router
from app.admin.router import router as admin_router
from app.agent.router import router as agent_router
from app.agent.tool_registry import bootstrap_tools
from app.account.router import router as account_router
from app.config import get_settings
from app.events.router import router as events_router
from app.events.router import ws_router
from app.content.router import router as content_router
from app.gateway.router import router as gateway_router
from app.gateway.wave1 import router as wave1_router
from app.identity.errors import AuthRequired
from app.identity.router import router as identity_router
from app.media.router import router as media_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("eswasaone.core")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    bootstrap_tools()
    settings = get_settings()
    logger.info(
        "Core starting — Frappe=%s Redis=%s Qdrant=%s",
        settings.frappe_url,
        settings.redis_url.split("@")[-1] if "@" in settings.redis_url else settings.redis_url,
        settings.qdrant_url,
    )
    yield
    logger.info("Core shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="EswasaOne Core BFF",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


    @application.exception_handler(AuthRequired)
    async def auth_required_handler(_request: Request, exc: AuthRequired) -> JSONResponse:
        body: dict = {"auth_required": True, "detail": exc.detail}
        if exc.reason:
            body["reason"] = exc.reason
        return JSONResponse(status_code=401, content=body)

    @application.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "eswasaone-core"}

    # Contract servers include /api prefix; mount composed routers there.
    application.include_router(identity_router, prefix="/api")
    application.include_router(account_router, prefix="/api")
    application.include_router(gateway_router, prefix="/api")
    application.include_router(wave1_router, prefix="/api")
    application.include_router(admin_router, prefix="/api")
    application.include_router(access_router, prefix="/api")
    application.include_router(agent_router, prefix="/api")
    application.include_router(events_router, prefix="/api")
    application.include_router(content_router, prefix="/api")
    application.include_router(media_router, prefix="/api")
    application.include_router(ws_router)

    return application


app = create_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=settings.core_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
