import { type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FieldLayout } from "../../layout/FieldLayout";
import { MeScreen } from "./MeScreen";

/** Field Me (mobile E-screens): every pane reads live Core HR; nothing is seeded and an outage is said plainly. */

const ME = {
  linked: true,
  employee: { id: "HR-EMP-0012", employee_name: "Thandi Mamba" },
  line_manager: "Sipho Magagula",
  leave_approver: { user: "sipho@x", name: "Sipho Magagula" },
  balances: [
    { leave_type: "Annual Leave", allocated: 21, used: 10, balance: 11 },
    { leave_type: "Sick Leave", allocated: 12, used: 3, balance: 9 },
  ],
  leave: [{ id: "LV-1", employee: "Thandi Mamba", leave_type: "Annual Leave", from_date: "2099-10-02", to_date: "2099-10-04", status: "Open" }],
};

const routes: Record<string, unknown> = {};
const calls: Array<{ path: string; init?: RequestInit }> = [];

vi.mock("@eswasaone/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@eswasaone/shared-ui")>();
  return {
    ...actual,
    me: vi.fn().mockResolvedValue({ username: "thandi@x", full_name: "Thandi Mamba", email: "thandi@x", roles: ["ESWASA Staff"] }),
    apiFetch: vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      const hit = Object.keys(routes)
        .sort((a, b) => b.length - a.length)
        .find((k) => path.startsWith(k));
      const out = hit ? routes[hit] : { items: [] };
      if (out instanceof Error) throw out;
      return out;
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    IdleLockGate: ({ children }: { children: ReactNode }) => <>{children}</>,
    AuthModal: () => null,
  };
});

import { ApiError } from "@eswasaone/shared-ui";
import { AuthProvider } from "../../auth/AuthProvider";

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<FieldLayout />}>
            <Route path="me" element={<MeScreen />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Me ESS screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    calls.length = 0;
    for (const k of Object.keys(routes)) delete routes[k];
    routes["/hr/me/expense-claims/options"] = { types: ["Travel"], receipt_required_above: 200, awaiting: null };
    routes["/hr/me/expense-claims"] = { items: [{ id: "HR-EXP-1", total: 320, status: "Waiting for approval", approval_status: "Draft", approver: "Sipho Magagula", overdue: false, description: "Taxi" }] };
    routes["/hr/me/record"] = { id: "HR-EMP-0012", employee_name: "Thandi Mamba", designation: "Lead Auditor", department: "Certification", open_items: [] };
    routes["/hr/me"] = ME;
    routes["/hr/slips"] = { items: [{ id: "S1", employee: "Thandi", period: "January 2026", net_pay: 15200, status: "Paid" }] };
  });

  it("shows live balances by their real names and the requests, then payslips", async () => {
    const user = userEvent.setup();
    renderAt("/me?tab=leave");
    expect(await screen.findByRole("tab", { name: "Leave" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Annual Leave")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.queryByText("Study")).toBeNull(); // no stub cards for types nobody has
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument(); // open request

    await user.click(screen.getByRole("tab", { name: "Payslips" }));
    expect(await screen.findByText(/January 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/30,400/)).toBeNull();
  });

  it("says when the login has no employee record", async () => {
    routes["/hr/me"] = { linked: false, balances: [], leave: [] };
    renderAt("/me?tab=leave");
    expect(await screen.findByText(/isn't linked to an employee record/)).toBeInTheDocument();
  });

  it("lists live claims with who decides them, and seeds nothing", async () => {
    renderAt("/me?tab=claims");
    expect(await screen.findByText("Taxi")).toBeInTheDocument();
    expect(screen.getByText(/Sipho Magagula decides/)).toBeInTheDocument();
    expect(screen.queryByText(/EXP-DEMO/)).toBeNull();
  });

  it("waits for ESWASA Finance when there are no expense types", async () => {
    routes["/hr/me/expense-claims/options"] = { types: [], receipt_required_above: null, awaiting: "ESWASA Finance" };
    routes["/hr/me/expense-claims"] = { items: [] };
    renderAt("/me?tab=claims");
    expect(await screen.findByText(/once ESWASA Finance sets up the expense types/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New claim/ })).toBeNull();
  });

  it("checks a claim before anything is sent", async () => {
    const user = userEvent.setup();
    routes["/hr/me/expense-claims"] = { items: [] };
    renderAt("/me?tab=claims");
    await user.click(await screen.findByRole("button", { name: /New claim/ }));
    await user.type(screen.getByLabelText(/Amount/), "450");
    await user.click(screen.getByRole("button", { name: /Confirm & send/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/date of the expense/);
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("shows an outage as an error, not as empty data", async () => {
    routes["/hr/me"] = new ApiError(503, "HR unavailable", "/hr/me");
    renderAt("/me?tab=leave");
    expect(await screen.findByRole("alert")).toHaveTextContent("HR unavailable");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows the job record on Profile", async () => {
    renderAt("/me?tab=profile");
    expect(await screen.findByText("Lead Auditor")).toBeInTheDocument();
    expect(screen.getByText("Certification")).toBeInTheDocument();
  });
});
