"""Optional health endpoint on 127.0.0.1:INGEST_HEALTH_PORT (default 8016)."""

from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from config import get_settings
from storage.qdrant_store import QdrantStore

logger = logging.getLogger("ingest.health")


class HealthHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        logger.debug(fmt, *args)

    def do_GET(self) -> None:  # noqa: N802
        settings = get_settings()
        if self.path not in {"/", "/health", "/healthz"}:
            self.send_response(404)
            self.end_headers()
            return

        qdrant = QdrantStore(settings.qdrant_url, settings.tbt_collection)
        try:
            q = qdrant.health()
        finally:
            qdrant.close()

        body = {
            "service": "eswasaone-ingest",
            "status": "ok" if q.get("ok") else "degraded",
            "qdrant": q,
            "object_store": settings.ingest_object_store_path,
            "collection": settings.tbt_collection,
        }
        payload = json.dumps(body).encode("utf-8")
        self.send_response(200 if q.get("ok") else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    settings = get_settings()
    host, port = "127.0.0.1", int(settings.ingest_health_port)
    server = ThreadingHTTPServer((host, port), HealthHandler)
    logger.info("ingest health listening on http://%s:%s/health", host, port)
    print(f"ingest health on http://{host}:{port}/health", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
