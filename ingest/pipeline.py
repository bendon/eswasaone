"""Ingest pipeline scheduler entry — ePing/TBT end-to-end."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from config import Settings, get_settings
from connectors.eping_tbt import EPingTBTConnector
from enrich.embeddings import embed_texts
from processing.chunking import chunk_text
from processing.dedup import already_stored, content_hash
from storage.frappe_client import FrappeIngestClient
from storage.object_store import ObjectStore
from storage.qdrant_store import QdrantStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ingest.pipeline")


def _frappe_dt(value: datetime | None = None) -> str:
    """Frappe/MariaDB Datetime fields reject ISO-8601 with timezone suffix."""
    dt = value or datetime.now(timezone.utc)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def run_eping_tbt(settings: Settings | None = None) -> dict[str, Any]:
    """Fetch TBT notifications → object store → Frappe metadata → Qdrant chunks."""
    settings = settings or get_settings()
    store = ObjectStore(settings.ingest_object_store_path)
    qdrant = QdrantStore(settings.qdrant_url, settings.tbt_collection)
    frappe = FrappeIngestClient(settings)

    stats: dict[str, Any] = {
        "fetched": 0,
        "stored": 0,
        "dedup_skipped": 0,
        "qdrant_points": 0,
        "collection": settings.tbt_collection,
        "frappe_available": False,
        "errors": [],
    }

    try:
        collection = qdrant.ensure_collection()
        stats["collection"] = collection
        stats["frappe_available"] = frappe.connect()

        source_meta = frappe.upsert_source(
            {
                "title": EPingTBTConnector.SOURCE_TITLE,
                "source_type": "api",
                "url": EPingTBTConnector.SOURCE_URL,
                "jurisdiction": "WTO",
                "sector_tags": "TBT",
                "access_method": "REST azureSearch/getAll",
                "cadence": "daily",
                "rights": "open",
                "status": "Active",
                "last_fetched": _frappe_dt(),
            }
        )
        source_name = source_meta.get("name")

        with EPingTBTConnector(settings=settings) as conn:
            for record in conn.iter_notifications():
                stats["fetched"] += 1
                digest = content_hash(record.content_bytes or record.summary.encode("utf-8"))
                if already_stored(store.root, digest):
                    stats["dedup_skipped"] += 1
                    logger.info("dedup skip %s", record.external_id)
                    continue

                # Rights gate: open/public full text OK; licensed → metadata only.
                if record.rights == "licensed":
                    payload = {
                        "external_id": record.external_id,
                        "title": record.title,
                        "url": record.url,
                        "rights": record.rights,
                        "summary": "Licensed — full text not stored for public output.",
                        "raw_keys": list(record.raw.keys()),
                    }
                    digest, path = store.write_json(payload)
                else:
                    digest, path = store.write_bytes(record.content_bytes)

                stats["stored"] += 1
                doc_meta = frappe.upsert_ingested_document(
                    {
                        "title": record.title[:140],
                        "source": source_name,
                        "external_id": record.external_id,
                        "document_url": record.url,
                        "jurisdiction": record.jurisdiction,
                        "rights": record.rights,
                        "content_hash": digest,
                        "object_store_path": str(path),
                        "fetched_at": _frappe_dt(record.fetched_at),
                        "status": "Pending Review",
                        "summary": record.summary[:5000],
                        "raw_metadata": {
                            "documentSymbol": record.raw.get("documentSymbol"),
                            "notificationType": record.raw.get("notificationType"),
                            "notifyingMember": record.raw.get("notifyingMember"),
                        },
                    }
                )
                # R-T3 fires on Frappe after_insert (Curation Task). Pipeline only
                # creates a task when the REST upsert returned a stub (no hooks).
                if doc_meta.get("stub") and doc_meta.get("name"):
                    frappe.create_curation_task(
                        {
                            "title": f"Review TBT {record.external_id}",
                            "document": doc_meta["name"],
                            "task_type": "Review",
                            "priority": "Medium",
                            "status": "Open",
                            "notes": "Auto-queued by ePing/TBT pipeline (Frappe stub path)",
                        }
                    )
                elif doc_meta.get("stub"):
                    logger.debug(
                        "skip curation task — stub upsert without name for %s",
                        record.external_id,
                    )

                chunks = chunk_text(record.summary or record.title)
                vectors = embed_texts([c.text for c in chunks])
                n = qdrant.upsert_chunks(
                    external_id=record.external_id,
                    title=record.title,
                    url=record.url,
                    rights=record.rights,
                    chunks=chunks,
                    vectors=vectors,
                    content_hash=digest,
                )
                stats["qdrant_points"] += n
                logger.info(
                    "ingested %s hash=%s chunks=%s path=%s",
                    record.external_id,
                    digest[:12],
                    n,
                    path,
                )

        # Update source last_fetched + content_hash rollup
        frappe.upsert_source(
            {
                "title": EPingTBTConnector.SOURCE_TITLE,
                "source_type": "api",
                "url": EPingTBTConnector.SOURCE_URL,
                "rights": "open",
                "status": "Active",
                "last_fetched": _frappe_dt(),
                "content_hash": content_hash(
                    f"{stats['fetched']}:{stats['stored']}".encode()
                ),
            }
        )
    except Exception as exc:  # noqa: BLE001 — top-level pipeline report
        logger.exception("pipeline failed")
        stats["errors"].append(str(exc))
    finally:
        qdrant.close()
        frappe.close()

    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EswasaOne ingest pipeline")
    parser.add_argument(
        "--connector",
        default="eping_tbt",
        choices=["eping_tbt", "eurlex", "regulator_rss", "web_crawl"],
    )
    parser.add_argument("--max-pages", type=int, default=None)
    parser.add_argument("--page-size", type=int, default=None)
    args = parser.parse_args(argv)

    settings = get_settings()
    if args.max_pages is not None:
        settings = settings.model_copy(update={"eping_max_pages": args.max_pages})
    if args.page_size is not None:
        settings = settings.model_copy(update={"eping_page_size": args.page_size})

    if args.connector != "eping_tbt":
        logger.error("%s is stub-only — use --connector eping_tbt", args.connector)
        return 2

    stats = run_eping_tbt(settings)
    logger.info("pipeline done: %s", stats)
    return 0 if not stats.get("errors") else 1


if __name__ == "__main__":
    sys.exit(main())
