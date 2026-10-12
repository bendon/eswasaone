/** Screen ↔ backend sweep, phase 3: HR employee record (H1b) and HR expense claims. Live only; refusals shown. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { EmployeeRecord } from "./EmployeeRecord";
import { ExpenseDetail, ExpensesView } from "../ExpensesView";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : undefined });
      const hit = routes
        .filter(([k]) => (/^(GET|POST|PATCH) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit ? json(hit[1], hit[2] ?? 200) : json({ detail: "offline" }, 503);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function at(path: string, pattern: string, el: JSX.Element) {
  const router = createMemoryRouter([{ path: pattern, element: el }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

const REC = {
  id: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification", designation: "Lead Auditor", status: "Active",
  date_of_joining: "2021-02-01", email: "thandi@eswasa.co.sz", initials: "TM", reports_to: null, user_id: null, desk_path: null, viewer: "hr",
  employee_number: "ESW-0044", grade: null, branch: null, employment_type: "Permanent", scheduled_confirmation_date: null, final_confirmation_date: null,
  contract_end_date: null, relieving_date: null, reports_to_name: "Sipho Magagula",
  leave: { balances: [], awaiting: "H14", next: null }, authorisations: [], documents: { items: [], missing: [], required_set: false },
  history: [{ id: "PROMO-1", kind: "promotion", date: "2025-04-01", state: "Approved", changes: [{ property: "Designation", current: "Auditor", new: "Lead Auditor" }] }],
  contract: { employment_type: "Permanent", contract_end_date: null, pending: null }, open_items: [],
};

describe("Employee record (H1b)", () => {
  it("shows the record with HR actions, certificate link and history", async () => {
    routes = [["/hr/employees/HR-EMP-0044", REC]];
    at("/hr/directory/HR-EMP-0044/record", "/hr/directory/:id/record", <EmployeeRecord />);
    expect(await screen.findByRole("heading", { name: "Thandi Mamba" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Certificate of service" }).getAttribute("href")).toContain("/hr/employees/HR-EMP-0044/certificate-of-service");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText("Designation: Auditor → Lead Auditor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Leave" }));
    expect(screen.getByText(/Awaiting ESWASA \(H14\)/)).toBeInTheDocument();
  });

  it("a line manager sees job fields only: no HR actions, no access log", async () => {
    routes = [["/hr/employees/HR-EMP-0044", { ...REC, viewer: "manager" }]];
    at("/hr/directory/HR-EMP-0044/record", "/hr/directory/:id/record", <EmployeeRecord />);
    expect(await screen.findByText(/You see job details only/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Certificate of service" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Access log" })).toBeNull();
  });

  it("corrects the record with PATCH and shows the move refusal", async () => {
    routes = [["GET /hr/employees/HR-EMP-0044", REC], ["PATCH /hr/employees/HR-EMP-0044", { detail: "Record a leaver through separation, so the exit checklist and approval happen." }, 422]];
    at("/hr/directory/HR-EMP-0044/record", "/hr/directory/:id/record", <EmployeeRecord />);
    fireEvent.click(await screen.findByRole("tab", { name: "Job and contract" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing to change.");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Suspended" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Record a leaver through separation/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ status: "Suspended", confirm: true });
  });

  it("verifies a document someone else uploaded and shows the four-eyes refusal", async () => {
    routes = [
      ["GET /hr/employees/HR-EMP-0044", REC],
      ["GET /hr/employees/HR-EMP-0044/documents", { employee: "HR-EMP-0044", required_set: true, missing: [], types: ["ID"], items: [{ id: "ED-9", employee: "HR-EMP-0044", document_type: "ID", expires_on: null, status: "To check", required: true, uploaded_by: "hrm@eswasa.co.sz", uploaded_on: "2026-10-01", verified_by: null, file: "k" }] }],
      ["POST /hr/documents/ED-9/verify", { detail: "You uploaded this, so someone else in HR must verify it." }, 403],
    ];
    at("/hr/directory/HR-EMP-0044/record", "/hr/directory/:id/record", <EmployeeRecord />);
    fireEvent.click(await screen.findByRole("tab", { name: "Documents" }));
    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));
    expect(await screen.findByText("You uploaded this, so someone else in HR must verify it.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ confirm: true });
  });

  it("an unknown record is an error, not an empty page", async () => {
    routes = [["/hr/employees/NOPE", { detail: "Employee not found." }, 404]];
    at("/hr/directory/NOPE/record", "/hr/directory/:id/record", <EmployeeRecord />);
    expect(await screen.findByText(/Employee not found/)).toBeInTheDocument();
  });
});

const CLAIM = {
  id: "HR-EXP-1", employee: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification", posting_date: "2026-10-12", total: 320,
  sanctioned: null, currency: "SZL", approval_status: "Draft", status: "Waiting for approval", approver: "Sipho Magagula", sla_date: "2026-10-15",
  overdue: true, description: "Site visit",
  lines: [{ expense_type: "Travel", expense_date: "2026-10-10", amount: 320, description: "Taxi", receipt: "taxi.pdf", sanctioned: null }],
  attachments: [{ file_name: "taxi.pdf", url: "https://media/x/taxi.pdf", id: "F-1" }],
};

describe("HR expense claims", () => {
  it("lists claims waiting for a decision, read-only", async () => {
    routes = [["/hr/expense-claims?status=Draft", { items: [CLAIM] }]];
    at("/hr/expenses", "/hr/expenses", <ExpensesView />);
    expect(await screen.findByRole("link", { name: "Site visit" })).toHaveAttribute("href", "/hr/expenses/HR-EXP-1");
    expect(screen.getByText(/1 past the 3 working days/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
  });

  it("shows a claim's lines with the receipt link", async () => {
    routes = [["/hr/expense-claims/HR-EXP-1", CLAIM]];
    at("/hr/expenses/HR-EXP-1", "/hr/expenses/:id", <ExpenseDetail />);
    expect(await screen.findByRole("link", { name: "taxi.pdf" })).toHaveAttribute("href", "https://media/x/taxi.pdf");
    expect(screen.getByText(/Sipho Magagula decides it in Approvals/)).toBeInTheDocument();
  });
});
