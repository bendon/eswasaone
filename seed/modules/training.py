"""LMS / training stubs — TRAIN-2025-0118 anchor + thin enrolment samples."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from seed.client import FrappeClient, FrappeError
from seed.config import A10_MARKER, ANCHORS, KPI_TARGETS

log = logging.getLogger("seed.modules.training")

COURSE_NAME = "ISO 45001 Lead Auditor Course"


def ensure_training(
    client: FrappeClient,
    *,
    sample_enrolments: int = 20,
) -> dict[str, Any]:
    """Ensure course + TRAIN anchor. Full 2840 rows optional / marked TODO."""
    out: dict[str, Any] = {
        "course": None,
        "anchor": None,
        "enrolments_sample": 0,
        "kpi_target": KPI_TARGETS["training_enrolments_ytd"],
        # TODO: wire real — bulk 2840 LMS Enrollment rows when CI budget allows
        "todo": "wire real bulk enrolments to hit 2840",
    }
    if not client.doctype_exists("LMS Course"):
        return out

    # LMS Course naming is often title-slug; find or create by title
    found = client.get_list(
        "LMS Course",
        filters={"title": COURSE_NAME},
        fields=["name", "title"],
        limit=1,
    )
    if found:
        course = found[0]["name"]
    else:
        try:
            # instructors Table MultiSelect can be empty on some LMS versions — try minimal
            doc = client.insert(
                {
                    "doctype": "LMS Course",
                    "title": COURSE_NAME,
                    "status": "Approved",
                    "short_introduction": f"{A10_MARKER}: demo course for TRAIN anchor.",
                    "description": (
                        f"<p>{A10_MARKER}: ISO 45001 Lead Auditor demo course. "
                        "No licensed standard text.</p>"
                    ),
                    "published": 1,
                    "instructors": [{"instructor": "Administrator"}],
                }
            )
            course = doc.get("name")
        except FrappeError as exc:
            log.warning("LMS Course create failed: %s", exc)
            return out

    out["course"] = course

    # Anchor: try rename an enrollment / use Note via ToDo if LMS Enrollment too coupled
    train_id = ANCHORS["training"]
    if client.doctype_exists("LMS Enrollment") and course:
        existing = client.get_list(
            "LMS Enrollment",
            filters=[["name", "=", train_id]],
            fields=["name"],
            limit=1,
        )
        if existing:
            out["anchor"] = train_id
        else:
            # Find any enrollment with marker, or create then rename
            marked = client.get_list(
                "LMS Enrollment",
                filters=[["member", "=", "Administrator"]],
                fields=["name", "course"],
                limit=5,
            )
            anchor_doc = None
            for row in marked:
                if row.get("course") == course:
                    anchor_doc = row["name"]
                    break
            if not anchor_doc:
                try:
                    inserted = client.insert(
                        {
                            "doctype": "LMS Enrollment",
                            "course": course,
                            "member": "Administrator",
                            "member_type": "Student",
                            "progress": 100,
                        }
                    )
                    anchor_doc = inserted.get("name")
                except FrappeError as exc:
                    log.warning("LMS Enrollment create failed: %s", exc)

            if anchor_doc:
                try:
                    if anchor_doc != train_id:
                        client.rename("LMS Enrollment", anchor_doc, train_id)
                    out["anchor"] = train_id
                except FrappeError as exc:
                    log.warning(
                        "Could not pin %s (kept %s): %s", train_id, anchor_doc, exc
                    )
                    out["anchor"] = anchor_doc

        # Sample enrolments (not full KPI) — additional Users may not exist; skip bulk
        out["enrolments_sample"] = client.get_count(
            "LMS Enrollment", filters={"course": course}
        )
        if out["enrolments_sample"] < sample_enrolments:
            log.info(
                "Enrolments on course=%s count=%s (target KPI %s — see TODO bulk)",
                course,
                out["enrolments_sample"],
                KPI_TARGETS["training_enrolments_ytd"],
            )

    # Fallback narrative marker if LMS pin failed
    if not out["anchor"] and client.doctype_exists("ToDo"):
        desc = (
            f"<p>{A10_MARKER}:training:{train_id}</p>"
            f"<p>{COURSE_NAME} · {train_id} · 28 Aug 2025</p>"
        )
        found_todo = client.get_list(
            "ToDo",
            filters=[["description", "like", f"%{A10_MARKER}:training:{train_id}%"]],
            limit=1,
        )
        if found_todo:
            out["anchor"] = train_id
        else:
            try:
                client.insert(
                    {
                        "doctype": "ToDo",
                        "description": desc,
                        "status": "Closed",
                        "date": date(2025, 8, 28).isoformat(),
                    }
                )
                out["anchor"] = train_id
            except FrappeError as exc:
                log.warning("TRAIN ToDo marker failed: %s", exc)

    return out
