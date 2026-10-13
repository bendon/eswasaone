/** E11 My items (HR additions plan 02): acknowledge receipt of an issued item. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "thandi@eswasa.co.sz", full_name: "Thandi Mamba", email: "thandi@eswasa.co.sz", roles: ["Employee"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "me",
  }),
}));

import { MyItems } from "./MyItems";
import { settingsResponse } from "../test/hrSettings";

const ITEM = { name: "HRI-2026-00001", employee: "EMP-44", item_type: "Laptop", tag: "DL-1", description: "Dell Latitude", issued_on: "2026-10-13", status: "Issued", overdue: false };

afterEach(() => vi.unstubAllGlobals());

describe("My items (E11)", () => {
  it("acknowledges an item with confirm", async () => {
    const posts: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const settings = settingsResponse(url);
        if (settings) return settings;
        const post = (init?.method ?? "GET").toUpperCase() === "POST";
        if (post) posts.push({ url, body: JSON.parse(String(init?.body)) });
        const body = post ? { employee: "EMP-44", items: [{ ...ITEM, status: "Acknowledged", acknowledged_on: "2026-10-16" }], waiting: 0 } : { employee: "EMP-44", items: [ITEM], waiting: 1 };
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    render(<MyItems />);
    expect(await screen.findByText("1 item to acknowledge")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toContain("/hr/me/items/HRI-2026-00001/acknowledge");
    expect(posts[0].body).toEqual({ confirm: true });
    expect(await screen.findByText("Acknowledged")).toBeInTheDocument();
    expect(screen.queryByText("1 item to acknowledge")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing is issued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const settings = settingsResponse(String(input));
        if (settings) return settings;
        return new Response(JSON.stringify({ employee: "EMP-44", items: [], waiting: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    render(<MyItems />);
    expect(await screen.findByText("Nothing issued to you")).toBeInTheDocument();
  });
});
