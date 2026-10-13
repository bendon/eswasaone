/**
 * Screen ↔ backend sweep, phase 1: access requests are live (no localStorage), Time off is read-only with the
 * live calendar, Add person sends the HRMS-required fields, and no HR screen keeps mock data.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

const who = { roles: ["HR Manager"] as string[] };
vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: who.roles },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { LeaveView } from "./LeaveView";
import { LeavePolicyView } from "./LeavePolicy";
import { EmployeesView } from "./EmployeesView";
import { AccessRequestsView } from "./AccessRequestsView";
import { AccessDeniedPanel } from "../components/AccessDeniedPanel";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  routes = [];
  who.roles = ["HR Manager"];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const hit = routes.find(([k]) => url.includes(k) && (k.startsWith(method + " ") ? true : !/^(GET|POST|PATCH|DELETE) /.test(k)))
        ?? routes.find(([k]) => k.startsWith(method + " ") && url.includes(k.slice(method.length + 1)));
      if (!hit) return json({ detail: "offline" }, 503);
      return json(hit[1], hit[2] ?? 200);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(el: JSX.Element) {
  const router = createMemoryRouter([{ path: "*", element: el }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

const REQ = {
  id: "HR-LAP-0007", employee: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification", leave_type: "Annual Leave",
  from_date: "2026-11-02", to_date: "2026-11-06", days: 5, status: "Open", approver: "sipho@x", approver_name: "Sipho Magagula",
  sla_date: "2026-10-14", overdue: true, escalated: true,
};

describe("Time off (H4) is read-only", () => {
  it("shows who decides each request and links to Approvals, with no decide buttons", async () => {
    routes = [
      ["/hr/leave/requests", { items: [REQ] }],
      ["/hr/leave/calendar", { start: "2026-10-12", end: "2026-10-23", people: [{ employee: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification" }], entries: [{ employee: "HR-EMP-0044", kind: "leave", label: "Annual Leave", from_date: "2000-01-01", to_date: "2100-01-01", approved: false, style: "dashed" }] }],
      ["/hr/leave/balances", { items: [], awaiting: "H14" }],
      ["/hr/holidays", { items: [] }],
    ];
    mount(<LeaveView />);
    expect((await screen.findAllByText("Sipho Magagula")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Overdue, with HR/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reject/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Approvals" })[0]).toHaveAttribute("href", "/approvals");
    expect(await screen.findByLabelText("Leave calendar")).toBeInTheDocument();
    expect((await screen.findAllByText("Thandi Mamba · Annual Leave (requested)")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Awaiting ESWASA \(H14\)/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("says when the calendar can't load instead of showing an empty week", async () => {
    routes = [["/hr/leave/requests", { items: [] }], ["/hr/leave/balances", { items: [] }], ["/hr/holidays", { items: [] }]];
    mount(<LeaveView />);
    await screen.findByText("Leave calendar");
    await waitFor(() => expect(screen.queryByText("Nobody away")).toBeNull());
    expect(await screen.findByText(/offline/i)).toBeInTheDocument();
  });

  it("leave policy says Awaiting ESWASA when nothing is set", async () => {
    routes = [["/hr/leave/policy", { configured: false, awaiting: "H14", leave_period: null, leave_types: [] }]];
    mount(<LeavePolicyView />);
    expect(await screen.findByText("Awaiting ESWASA (H14)")).toBeInTheDocument();
    expect(screen.getByText("No leave types set up")).toBeInTheDocument();
  });

  it("leave policy lists the configured types and their rules", async () => {
    routes = [["/hr/leave/policy", { configured: true, awaiting: null, leave_period: { name: "2026", from_date: "2026-01-01", to_date: "2026-12-31" }, leave_types: [{ name: "Annual Leave", allocations: [{ policy: "Staff", annual_allocation: 21 }], is_carry_forward: 1, maximum_carry_forwarded_leaves: 5 }] }]];
    mount(<LeavePolicyView />);
    expect(await screen.findByText("Annual Leave")).toBeInTheDocument();
    expect(screen.getByText("21 days (Staff)")).toBeInTheDocument();
    expect(screen.getByText(/Carry-over: Allowed · Most days carried over: 5 days/)).toBeInTheDocument();
  });
});

describe("Add person (H2)", () => {
  function fill() {
    fireEvent.click(screen.getByRole("button", { name: "Add employee" }));
  }

  it("sends name, gender, date of birth and joining date with confirm, using HRMS's own choices", async () => {
    routes = [
      ["GET /hr/employees", { items: [] }],
      ["/hr/departments", { items: [{ id: "Certification - ES", name: "Certification" }] }],
      ["/hr/designations", { items: [{ id: "Lead Auditor", title: "Lead Auditor" }] }],
      ["/hr/employee-options", { genders: ["Female", "Male"] }],
      ["POST /hr/employees", { id: "HR-EMP-0099", employee_name: "Zanele Dlamini" }, 201],
    ];
    mount(<EmployeesView />);
    await screen.findByText("No employees yet");
    fill();
    const form = (await screen.findByText("Full name")).closest("form") as HTMLFormElement;
    fireEvent.change(form.querySelector("label:nth-of-type(1) input")!, { target: { value: "Zanele Dlamini" } });
    await screen.findByRole("option", { name: "Female" });
    const selects = form.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "Female" } });
    const dates = form.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "1990-04-02" } });
    fireEvent.change(dates[1], { target: { value: "2026-11-01" } });
    await screen.findByRole("option", { name: "Certification" });
    fireEvent.change(selects[1], { target: { value: "Certification - ES" } });
    fireEvent.submit(form);
    await screen.findByText(/Created Zanele Dlamini/);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ employee_name: "Zanele Dlamini", gender: "Female", date_of_birth: "1990-04-02", date_of_joining: "2026-11-01", department: "Certification - ES", confirm: true });
  });

  it("shows the backend's refusal inline and does not claim success", async () => {
    routes = [
      ["GET /hr/employees", { items: [] }],
      ["/hr/departments", { items: [] }],
      ["/hr/designations", { items: [] }],
      ["/hr/employee-options", { genders: ["Female"] }],
      ["POST /hr/employees", { detail: "Date of birth is required." }, 422],
    ];
    mount(<EmployeesView />);
    await screen.findByText("No employees yet");
    fill();
    const form = (await screen.findByText("Full name")).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent("Date of birth is required.");
    expect(screen.queryByText(/Created/)).toBeNull();
  });
});

const AR = { id: "MAR-0001", moduleId: "finance", moduleLabel: "Finance", requesterUsername: "thandi@x", requesterName: "Thandi Mamba", requesterEmail: "thandi@x", note: "Invoices", status: "pending", createdAt: "2026-10-12T08:00:00" };

describe("Access requests (H11) are live", () => {
  it("lists requests from Core and won't reject without a note", async () => {
    routes = [["GET /hr/access-requests", [AR]], ["PATCH /hr/access-requests/MAR-0001", { ...AR, status: "rejected" }]];
    mount(<AccessRequestsView />);
    fireEvent.click(await screen.findByText("Thandi Mamba → Finance"));
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Say why/);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Finance access is by role, not request" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ decision: "rejected", reviewNote: "Finance access is by role, not request", confirm: true });
  });

  it("shows the four-eyes refusal from the server", async () => {
    routes = [["GET /hr/access-requests", [AR]], ["PATCH /hr/access-requests/MAR-0001", { detail: "You can't review your own access request." }, 403]];
    mount(<AccessRequestsView />);
    fireEvent.click(await screen.findByText("Thandi Mamba → Finance"));
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can't review your own access request.");
  });

  it("the locked-module panel sends the request to Core", async () => {
    routes = [["GET /hr/access-requests", []], ["POST /hr/access-requests", { ...AR, id: "MAR-0002" }]];
    who.roles = ["Employee"];
    mount(<AccessDeniedPanel routeId={"finance" as never} user={{ username: "thandi@x", full_name: "Thandi", email: "thandi@x", roles: ["Employee"] } as never} />);
    fireEvent.click(await screen.findByRole("button", { name: "Request access" }));
    expect(await screen.findByRole("status")).toHaveTextContent("MAR-0002");
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ moduleId: "finance", confirm: true });
  });

  it("the panel shows an outage, not a sent request", async () => {
    routes = [["GET /hr/access-requests", []]];
    mount(<AccessDeniedPanel routeId={"finance" as never} user={{ username: "thandi@x", roles: [] } as never} />);
    fireEvent.click(await screen.findByRole("button", { name: "Request access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("can't be reached");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("No mock data in HR", () => {
  const root = join(__dirname, "..");
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
  }
  it("HR, My HR and My team screens read no localStorage, mock modules or TODO stand-ins", () => {
    const offenders = ["hr", "me", "team"].flatMap((d) => files(join(root, d))).filter((p) => /localStorage|overviewMock|TODO: wire real|MOCK_/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the HR and My HR tab bars carry no hard-coded badge counts", () => {
    for (const page of ["HrPage.tsx", "MyHrPage.tsx"]) expect(readFileSync(join(root, "pages", page), "utf8")).not.toMatch(/badge:\s*\d/);
    expect(readFileSync(join(root, "hr", "HrChrome.tsx"), "utf8")).not.toMatch(/FY20\d\d/);
  });
});
