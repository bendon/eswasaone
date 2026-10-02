import { describe, expect, it } from "vitest";
import { auditsHref, filterBySegment, segmentFor } from "./segments";
import type { FieldAuditRow } from "./types";

function row(partial: Partial<FieldAuditRow> & Pick<FieldAuditRow, "id">): FieldAuditRow {
  return {
    application_id: partial.application_id || partial.id,
    due_date: partial.due_date || "2026-09-23",
    status: partial.status || "scheduled",
    ...partial,
  };
}

describe("audits segments", () => {
  it("builds deep-link for Home", () => {
    expect(auditsHref({ open: "AUD-1" })).toBe("/audits?open=AUD-1");
    expect(auditsHref()).toBe("/audits");
  });

  it("classifies today / upcoming / submitted", () => {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    expect(segmentFor(row({ id: "a", due_date: iso(today) }))).toBe("today");
    expect(segmentFor(row({ id: "b", due_date: iso(tomorrow) }))).toBe(
      "upcoming",
    );
    expect(
      segmentFor(row({ id: "c", due_date: iso(today), status: "completed" })),
    ).toBe("submitted");
  });

  it("respects locally submitted ids", () => {
    const items = [row({ id: "x", due_date: "2099-01-01", status: "scheduled" })];
    expect(filterBySegment(items, "upcoming", new Set()).map((a) => a.id)).toEqual([
      "x",
    ]);
    expect(
      filterBySegment(items, "submitted", new Set(["x"])).map((a) => a.id),
    ).toEqual(["x"]);
  });
});
