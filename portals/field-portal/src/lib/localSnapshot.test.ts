import { describe, expect, it, beforeEach } from "vitest";
import {
  clearAllSnapshots,
  clearSnapshot,
  readSnapshot,
  writeSnapshot,
} from "./localSnapshot";

describe("localSnapshot", () => {
  beforeEach(() => {
    clearAllSnapshots();
  });

  it("writes and reads last-known-good", () => {
    writeSnapshot("/hr/leave", { items: [{ id: "1" }] });
    const snap = readSnapshot<{ items: { id: string }[] }>("/hr/leave");
    expect(snap?.data.items[0].id).toBe("1");
    expect(snap?.meta.path).toBe("/hr/leave");
  });

  it("clears one path", () => {
    writeSnapshot("/a", { x: 1 });
    writeSnapshot("/b", { y: 2 });
    clearSnapshot("/a");
    expect(readSnapshot("/a")).toBeNull();
    expect(readSnapshot<{ y: number }>("/b")?.data.y).toBe(2);
  });
});
