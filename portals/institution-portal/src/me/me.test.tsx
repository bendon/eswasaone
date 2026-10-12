/**
 * My HR smoke tests (journey J3, employee side): E1 home, E2 apply with preview, sent confirmation.
 * Core is stubbed at fetch; screens must never show invented data.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "thandi@eswasa.co.sz", full_name: "Thandi Mamba", email: "thandi@eswasa.co.sz", roles: ["Employee"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "thandi",
  }),
}));

import { MyHrHome } from "./MyHrHome";
import { ApplyLeave } from "./ApplyLeave";

const LINKED = {
  linked: true,
  employee: { id: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification", designation: "Lead Auditor" },
  line_manager: "Sipho Magagula",
  leave_approver: { user: "sipho@eswasa.co.sz", name: "Sipho Magagula" },
  balances: [
    { leave_type: "Annual Leave", allocated: 21, used: 9, balance: 12 },
    { leave_type: "Sick Leave", allocated: 14, used: 2, balance: 12 },
  ],
  leave: [{ id: "HR-LAP-001", employee: "Thandi Mamba", leave_type: "Annual Leave", from_date: "2026-08-10", to_date: "2026-08-14", status: "Approved" }],
};
const PREVIEW = {
  days: 5,
  balance: 12,
  balance_after: 7,
  approver: { user: "sipho@eswasa.co.sz", name: "Sipho Magagula" },
  conflicts: [{ id: "FV-0091", title: "Surveillance audit, ISO 22000", date: "2026-11-04", kind: "Field visit" }],
  warnings: [],
};

type Call = { url: string; method: string; body?: unknown };

function stubCore(me: unknown, preview: unknown = PREVIEW) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) =>
        new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (url.includes("/hr/me")) return json(me);
      if (url.includes("/hr/leave/preview")) return json(preview);
      if (url.includes("/hr/leave") && method === "POST")
        return json({ id: "HR-LAP-002", employee: "Thandi Mamba", leave_type: "Annual Leave", from_date: "2026-11-02", to_date: "2026-11-06", status: "Open" }, 201);
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/me",
        element: <Outlet />,
        children: [
          { index: true, element: <MyHrHome /> },
          { path: "leave/new", element: <ApplyLeave /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("My HR (E1)", () => {
  it("tells an unlinked login what to do instead of showing empty numbers", async () => {
    stubCore({ linked: false, balances: [], leave: [] });
    mount("/me");
    expect(await screen.findByText("Your login isn't linked to an employee record yet")).toBeInTheDocument();
    expect(screen.getByText("Ask HR to link your record")).toBeInTheDocument();
    expect(screen.queryByText(/days left/)).not.toBeInTheDocument();
  });

  it("shows balances, approver and the next step from live data", async () => {
    stubCore(LINKED);
    mount("/me");
    expect(await screen.findByText(/Hello Thandi/)).toBeInTheDocument();
    expect(screen.getAllByText("12 of 21 left").length).toBeGreaterThan(0);
    expect(screen.getByText("Leave approver: Sipho Magagula")).toBeInTheDocument();
    expect(screen.getByText("Planning time off?")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Apply for leave/ })[0]).toHaveAttribute("href", "/me/leave/new");
  });
});

describe("Apply for leave (E2)", () => {
  it("previews the request, then sends it to the approver with confirm", async () => {
    const calls = stubCore(LINKED);
    mount("/me/leave/new");
    await screen.findByText("Annual Leave");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-06" } });

    expect(await screen.findByText("Your work in those dates (1)")).toBeInTheDocument();
    expect(screen.getByText("7 days")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send to Sipho Magagula" });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    expect(await screen.findByRole("heading", { name: "Leave request sent" })).toBeInTheDocument();
    expect(screen.getAllByText("Sipho Magagula decides").length).toBeGreaterThan(0);
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/hr/leave"));
    expect(post?.body).toMatchObject({ leave_type: "Annual Leave", from_date: "2026-11-02", to_date: "2026-11-06", confirm: true });
  });

  it("won't send when nobody can decide it", async () => {
    stubCore(
      { ...LINKED, leave_approver: null },
      { ...PREVIEW, approver: null, conflicts: [], warnings: ["You have no leave approver yet. HR needs to set one before you can apply."] },
    );
    mount("/me/leave/new");
    await screen.findByText("Annual Leave");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-06" } });
    expect(await screen.findByText(/You have no leave approver yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to/ })).toBeDisabled();
  });
});
