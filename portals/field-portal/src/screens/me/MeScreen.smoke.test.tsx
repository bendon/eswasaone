import { type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FieldLayout } from "../../layout/FieldLayout";
import { MeScreen } from "./MeScreen";

vi.mock("@eswasaone/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@eswasaone/shared-ui")>();
  return {
    ...actual,
    me: vi.fn().mockResolvedValue({
      username: "field.demo",
      full_name: "Demo Field Officer",
      email: "field.demo@eswasa.local",
      roles: ["ESWASA Staff", "Certification Auditor"],
    }),
    apiFetch: vi.fn().mockImplementation(async (path: string) => {
      if (path.startsWith("/hr/leave/balances")) {
        return {
          items: [
            { leave_type: "Annual", allocated: 21, used: 10, balance: 11 },
            { leave_type: "Sick", allocated: 12, used: 3, balance: 9 },
            { leave_type: "Study", allocated: 5, used: 1, balance: 4 },
          ],
        };
      }
      if (path.startsWith("/hr/leave")) {
        return {
          items: [
            {
              id: "LV-1",
              employee: "Demo Field Officer",
              leave_type: "Annual",
              from_date: "2026-10-02",
              to_date: "2026-10-04",
              status: "Pending",
            },
          ],
        };
      }
      if (path.startsWith("/hr/slips")) {
        return {
          items: [
            {
              id: "S1",
              employee: "Demo",
              period: "January 2026",
              net_pay: 15200,
              status: "Paid",
            },
          ],
        };
      }
      if (path.startsWith("/hr/employees")) {
        return {
          items: [
            {
              id: "HR-EMP-0012",
              employee_name: "Demo Field Officer",
              designation: "Auditor",
              email: "field.demo@eswasa.local",
              user_id: "field.demo",
              initials: "DF",
            },
          ],
        };
      }
      return { items: [] };
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    IdleLockGate: ({ children }: { children: ReactNode }) => <>{children}</>,
    AuthModal: () => null,
  };
});

import { AuthProvider } from "../../auth/AuthProvider";

describe("Me ESS screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Leave tab and respects ?tab=pay", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/me?tab=leave"]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<FieldLayout />}>
              <Route path="me" element={<MeScreen />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("tab", { name: "Leave" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("Request leave")).toBeInTheDocument();
    expect(await screen.findByText("Annual")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Payslips" }));
    expect(await screen.findByText("Earnings YTD")).toBeInTheDocument();
    expect(screen.getByText(/January 2026/)).toBeInTheDocument();
  });
});
