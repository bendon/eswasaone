/** HR additions plan 02: the H19 register, the record Items tab with its issue drawer, and the return action. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

const who = vi.hoisted(() => ({ roles: ["HR Manager"] }));
vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: who.roles },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { ItemsPanel, ItemsRegister } from "./Items";
import { settingsResponse } from "../../test/hrSettings";

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn(); // jsdom lacks it; the shared Select scrolls the active option
  calls = [];
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const hit = routes
        .filter(([k]) => (/^(GET|POST) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit ? json(hit[1], hit[2] ?? 200) : json({ detail: "offline" }, 503);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  who.roles = ["HR Manager"];
});

function at(path: string, pattern: string, el: JSX.Element) {
  const router = createMemoryRouter([{ path: pattern, element: el }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

const LAPTOP = { name: "HRI-2026-00001", employee: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification", item_type: "Laptop",
  tag: "DL-1", issued_on: "2026-09-01", return_due: "2026-10-01", status: "Acknowledged", acknowledged_on: "2026-09-02", overdue: true };
const PERSON = { employee: "HR-EMP-0044", employee_name: "Thandi Mamba", items: [LAPTOP], types: ["Laptop", "Access card"], can_issue: true, can_return: true, can_write_off: true };

describe("Register (H19)", () => {
  it("lists what is out with the overdue flag and a link to the person", async () => {
    routes = [["/hr/items", { items: [LAPTOP], types: ["Laptop"], out: 1, overdue: 1 }]];
    at("/hr/items?status=out", "/hr/items", <ItemsRegister />);
    expect(await screen.findByText("1 still out, 1 overdue.")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thandi Mamba" })).toHaveAttribute("href", "/hr/directory/HR-EMP-0044/record");
    expect(calls[0].url).toContain("/hr/items?status=out");
  });

  it("says the item types are awaiting ESWASA when the list is empty", async () => {
    routes = [["/hr/items", { items: [], types: [], out: 0, overdue: 0 }]];
    at("/hr/items", "/hr/items", <ItemsRegister />);
    expect(await screen.findByText(/Awaiting ESWASA \(A2\)/)).toBeInTheDocument();
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("Record Items tab", () => {
  it("issues an item from the drawer with confirm", async () => {
    routes = [["GET /hr/employees/HR-EMP-0044/items", { ...PERSON, items: [] }], ["POST /hr/employees/HR-EMP-0044/items", PERSON]];
    render(<ItemsPanel employee="HR-EMP-0044" />);
    fireEvent.click(await screen.findByRole("button", { name: "Issue item" }));
    const dialog = screen.getByRole("dialog", { name: "Issue an item" });
    fireEvent.click(within(dialog).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Laptop" }));
    fireEvent.change(within(dialog).getByLabelText("Serial or asset tag"), { target: { value: "DL-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Issue" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ item_type: "Laptop", tag: "DL-1", confirm: true });
    expect(await screen.findByText("DL-1")).toBeInTheDocument();
  });

  it("shows the server's refusal inside the drawer", async () => {
    routes = [["GET /hr/employees/HR-EMP-0044/items", { ...PERSON, items: [] }], ["POST /hr/employees/HR-EMP-0044/items", { detail: "Only an active employee can be issued an item." }, 422]];
    render(<ItemsPanel employee="HR-EMP-0044" />);
    fireEvent.click(await screen.findByRole("button", { name: "Issue item" }));
    const dialog = screen.getByRole("dialog", { name: "Issue an item" });
    fireEvent.click(within(dialog).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Laptop" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Issue" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Only an active employee can be issued an item.");
  });

  it("hides Issue while the item types are awaiting ESWASA", async () => {
    routes = [["/hr/employees/HR-EMP-0044/items", { ...PERSON, items: [], types: [] }]];
    render(<ItemsPanel employee="HR-EMP-0044" />);
    expect(await screen.findByText(/Awaiting ESWASA \(A2\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Issue item" })).not.toBeInTheDocument();
  });

  it("a line manager takes an item back but can't write it off", async () => {
    routes = [["GET /hr/employees/HR-EMP-0044/items", { ...PERSON, can_issue: false, can_write_off: false }], ["POST /hr/items/HRI-2026-00001/return", { ...PERSON, items: [{ ...LAPTOP, status: "Returned", overdue: false, returned_on: "2026-10-16" }] }]];
    render(<ItemsPanel employee="HR-EMP-0044" />);
    fireEvent.click(await screen.findByRole("button", { name: "Return" }));
    expect(screen.queryByRole("button", { name: "Issue item" })).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Take back Laptop DL-1" });
    fireEvent.click(within(dialog).getByRole("combobox"));
    expect(screen.queryByRole("option", { name: "Lost" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Returned" }));
    fireEvent.change(within(dialog).getByLabelText("Condition when returned"), { target: { value: "Good" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ outcome: "Returned", condition_in: "Good", confirm: true }));
    expect(await screen.findByText("Returned 16 Oct 2026")).toBeInTheDocument();
  });
});
