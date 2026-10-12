/** H0 live Overview, H14 HR setup, H15 Board HR pack — live numbers only, nothing invented when offline. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { HrSummaryView } from "./HrSummaryView";
import { HrSetup } from "../admin/HrSetup";
import { BoardHrPack } from "../board/HrPack";

const ORG = { counts: { employees: 86, departments: 10, vacant_positions: 0, filled_positions: 86 } };
const LIVE = {
  as_of: "2026-10-12", headcount: 86, departments: 10,
  establishment: { has_plans: true, totals: { approved: 96, frozen: 2, filled: 86, in_recruitment: 4, vacant: 4 },
    departments: [{ department: "Certification", approved: 12, filled: 10, vacant: 1, frozen: 1 }] },
  attention: [
    { kind: "R-H2", count: 2, title: "2 contracts end within 60 days", detail: "Acknowledge in Approvals once handled.", due: "2026-10-01", href: "/hr/directory" },
    { kind: "leave", count: 1, title: "1 leave request waiting for a decision", detail: null, due: null, href: "/hr/time-off" },
  ],
  away_today: [{ employee: "EMP-9", employee_name: "Thandi Nxumalo", leave_type: "Annual Leave", back_on: "2026-10-15" }],
  movements: { joiners: 3, leavers: 1 }, turnover: { joiners: 12, leavers: 7, pct: 8.4 },
  ending_soon: { contracts: 2, probations: 1 }, record_quality: [{ field: "reports_to", label: "No line manager", count: 1 }], cycles: [],
};
const SETUP = {
  steps: [
    { id: "departments", title: "Departments and heads", state: "partial", detail: "10 departments, 7 with a head.", href: "/hr/structure?tab=departments", awaiting: null, desk: false },
    { id: "leave", title: "Leave policy", state: "awaiting", detail: "4 leave types, 0 submitted leave policies.", href: "leave-policy", awaiting: "§0.5 #4", desk: true },
    { id: "payroll", title: "Payroll scope", state: "excluded", detail: "Excluded until ESWASA decides whether payroll runs in EswasaOne.", href: null, awaiting: "H15, H16", desk: false },
  ],
  done: 0, total: 2, pct: 0,
};
const BOARD = {
  as_of: "2026-10-12", headcount: 86, establishment: { approved: 96, frozen: 2, filled: 86, in_recruitment: 4, vacant: 4 },
  turnover: { joiners: 12, leavers: 7, pct: 8.4 }, appraisals: { cycle_name: "2026/27 mid-year", end_date: "2026-10-30", people: 80, self_done: 60, manager_done: 39 },
  competence: { catalogue: 12, at_risk: 2 }, cases: [{ kind: "grievance", open: 2, closed_this_year: 1, avg_days_to_close: 34 }, { kind: "disciplinary", open: 1, closed_this_year: 0, avg_days_to_close: null }],
  declarations: { signed: 80, total: 86, year: "2026/27" },
  establishment_changes: [{ summary: "Add 2 Lead Auditor posts", department: "Certification", state: "Waiting for Council", council_required: true }],
};

function stub(liveUp = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (url.includes("/hr/organisation/overview")) return json(ORG);
      if (url.includes("/hr/overview/live")) return liveUp ? json(LIVE) : json({ detail: "Frappe unavailable" }, 503);
      if (url.includes("/hr/setup/status")) return json(SETUP);
      if (url.includes("/hr/board-pack")) return json(BOARD);
      return json({ detail: "offline" }, 503);
    }),
  );
}

function mount(el: JSX.Element) {
  const router = createMemoryRouter([{ path: "*", element: el }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("HR Overview", () => {
  it("ranks what needs attention with links, and fills the KPIs from live numbers", async () => {
    stub();
    mount(<HrSummaryView />);
    expect(await screen.findByText("2 contracts end within 60 days")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open" })[0]).toHaveAttribute("href", "/hr/directory");
    expect(screen.getByText("8.4%")).toBeInTheDocument();
    expect(screen.getByText("Thandi Nxumalo")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "10 of 12 posts filled" })).toBeInTheDocument();
    expect(screen.getByText("No line manager")).toBeInTheDocument();
    expect(screen.queryByText(/payroll/i)).not.toBeInTheDocument();
  });

  it("keeps the panels closed when the live overview can't be reached", async () => {
    stub(false);
    mount(<HrSummaryView />);
    expect(await screen.findByText(/can't be reached, so these panels stay closed/)).toBeInTheDocument();
    expect(screen.queryByText("8.4%")).not.toBeInTheDocument();
  });
});

describe("HR setup", () => {
  it("shows each step's state, what ESWASA must supply, and payroll as excluded", async () => {
    stub();
    mount(<HrSetup />);
    expect(await screen.findByText("Partly done")).toBeInTheDocument();
    expect(screen.getByText(/ESWASA input: §0.5 #4/)).toBeInTheDocument();
    expect(screen.getByText("Excluded")).toBeInTheDocument();
    expect(screen.getByText("Payroll is out of scope for now")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/hr/structure?tab=departments");
  });
});

describe("Board HR pack", () => {
  it("shows aggregates and the establishment change for decision, without names", async () => {
    stub();
    mount(<BoardHrPack />);
    expect(await screen.findByText("For decision: Add 2 Lead Auditor posts, Certification")).toBeInTheDocument();
    expect(screen.getByText("49%")).toBeInTheDocument();
    expect(screen.getByText(/2 grievances, 1 disciplinary open/)).toBeInTheDocument();
    expect(screen.queryByText("Thandi Nxumalo")).not.toBeInTheDocument();
  });
});
