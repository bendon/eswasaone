/**
 * Screen ↔ backend sweep, phase 2: My profile (record, documents, corrections), My leave cancel and expense claims.
 * Core is stubbed at fetch; screens show server sentences and never invent data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "thandi@eswasa.co.sz", full_name: "Thandi Mamba", email: "thandi@eswasa.co.sz", roles: ["Employee"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "thandi",
  }),
}));

import { MyProfile } from "./MyProfile";
import { MyLeave } from "./MyLeave";
import { MyExpenses } from "./MyExpenses";
import { settingsResponse } from "../test/hrSettings";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const hit = routes
        .filter(([k]) => (/^(GET|POST|PATCH) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit ? json(hit[1], hit[2] ?? 200) : json({ detail: "offline" }, 503);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(el: JSX.Element) {
  const router = createMemoryRouter([{ path: "*", element: el }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

const RECORD = {
  id: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification", designation: "Lead Auditor", status: "Active",
  date_of_joining: "2021-02-01", email: null, initials: "TM", reports_to: "HR-EMP-0002", user_id: "thandi@x", desk_path: null,
  viewer: "self", employee_number: "ESW-0044", grade: "G7", branch: "Head office", employment_type: "Permanent",
  scheduled_confirmation_date: null, final_confirmation_date: null, contract_end_date: null, relieving_date: null, reports_to_name: "Sipho Magagula",
  leave: { balances: [{ leave_type: "Annual Leave", allocated: 21, used: 9, balance: 12 }], awaiting: null, next: null },
  authorisations: [{ id: "SA-1", employee: "HR-EMP-0044", skill: "ISO 9001 lead auditor", valid_from: "2025-01-01", valid_to: "2027-01-01", status: "Current" }],
  documents: { items: [], missing: [], required_set: false },
  history: [], contract: { employment_type: "Permanent", contract_end_date: null, pending: null },
  open_items: [{ kind: "declaration", title: "Sign your 2026/27 declaration", due: "2026-10-30", reference: null }],
};
const DOCS = {
  employee: "HR-EMP-0044", employee_name: "Thandi Mamba", required_set: true, missing: ["Qualification"], types: ["ID", "Qualification", "Other"],
  items: [{ id: "ED-1", employee: "HR-EMP-0044", document_type: "ID", expires_on: null, status: "To check", required: true, uploaded_by: "thandi@x", uploaded_on: "2026-10-01", verified_by: null, file: "hr/documents/x.pdf" }],
};

describe("My profile (E5)", () => {
  it("shows the live record with open items, job and leave", async () => {
    routes = [["/hr/me/record", RECORD]];
    mount(<MyProfile />);
    expect(await screen.findByText("Sign your 2026/27 declaration")).toBeInTheDocument();
    expect(screen.getByText("ESW-0044")).toBeInTheDocument();
    expect(screen.getAllByText("Sipho Magagula").length).toBeGreaterThan(0);
    expect(screen.getByText("ISO 9001 lead auditor")).toBeInTheDocument();
  });

  it("lists documents, says what's missing, links the file and uploads with confirm", async () => {
    routes = [["/hr/me/record", RECORD], ["GET /hr/me/documents", DOCS], ["POST /hr/me/documents", DOCS]];
    mount(<MyProfile />);
    fireEvent.click(await screen.findByRole("tab", { name: "Documents" }));
    expect(await screen.findByText(/required document is missing/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toContain("/hr/documents/ED-1/file");
    expect(screen.queryByRole("button", { name: "Verify" })).toBeNull(); // nobody verifies their own

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Choose what kind of document this is.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Kind of document"), { target: { value: "Qualification" } });
    const file = new File(["%PDF"], "degree.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("File"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Qualification uploaded. HR checks it");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ document_type: "Qualification", confirm: "true" });
  });

  it("says no required documents are set, without waiting on anyone", async () => {
    routes = [["/hr/me/record", RECORD], ["GET /hr/me/documents", { ...DOCS, required_set: false, missing: [], items: [] }]];
    mount(<MyProfile />);
    fireEvent.click(await screen.findByRole("tab", { name: "Documents" }));
    expect(await screen.findByText(/No employment type lists required documents yet/)).toBeInTheDocument();
  });

  it("sends a correction to HR and shows the refusal for a name change without evidence", async () => {
    const fields = [
      { field: "cell_number", label: "Mobile", evidence_required: false },
      { field: "last_name", label: "Last name", evidence_required: true },
    ];
    routes = [["/hr/me/record", RECORD], ["GET /hr/me/profile-changes", { items: [], fields }], ["POST /hr/me/profile-changes", { id: "PCR-1", field: "cell_number", status: "Pending" }]];
    mount(<MyProfile />);
    fireEvent.click(await screen.findByRole("tab", { name: "Ask for a correction" }));
    await screen.findByRole("option", { name: "Last name" });
    fireEvent.change(screen.getByLabelText("Detail"), { target: { value: "last_name" } });
    fireEvent.change(screen.getByLabelText("What it should be"), { target: { value: "Dlamini" } });
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "Married" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to HR" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("needs evidence");
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText("Detail"), { target: { value: "cell_number" } });
    fireEvent.change(screen.getByLabelText("What it should be"), { target: { value: "7600 0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to HR" }));
    expect(await screen.findByRole("status")).toHaveTextContent("HR decides it in Approvals");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ field: "cell_number", requested_value: "7600 0000", reason: "Married", confirm: true });
  });
});

const ME = {
  linked: true,
  employee: { id: "HR-EMP-0044", employee_name: "Thandi Mamba" },
  leave_approver: { user: "sipho@x", name: "Sipho Magagula" },
  balances: [],
  leave: [
    { id: "LV-1", employee: "Thandi", leave_type: "Annual Leave", from_date: "2099-11-02", to_date: "2099-11-06", status: "Open" },
    { id: "LV-0", employee: "Thandi", leave_type: "Sick Leave", from_date: "2020-01-02", to_date: "2020-01-02", status: "Approved" },
  ],
};

describe("My leave (E3) cancel", () => {
  it("cancels an open request with a reason and shows the server's refusal otherwise", async () => {
    routes = [["/hr/me", ME], ["POST /hr/leave/LV-1/cancel", { detail: "This leave has started, so HR must change it." }, 422]];
    mount(<MyLeave />);
    const buttons = await screen.findAllByRole("button", { name: "Cancel" });
    expect(buttons).toHaveLength(1); // past approved leave can't be cancelled here
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel this leave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Say why");
    fireEvent.change(screen.getByLabelText("Why are you cancelling?"), { target: { value: "Plans changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel this leave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This leave has started");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ reason: "Plans changed", confirm: true });
  });
});

describe("Expense claims", () => {
  const CLAIM = { id: "HR-EXP-1", total: 320, status: "Waiting for approval", approval_status: "Draft", approver: "Sipho Magagula", overdue: false, description: "Site visit", posting_date: "2026-10-12", currency: "SZL" };

  it("lists live claims with who decides", async () => {
    routes = [["/hr/me/expense-claims/options", { types: ["Travel"], receipt_required_above: 200, awaiting: null }], ["GET /hr/me/expense-claims", { items: [CLAIM] }]];
    mount(<MyExpenses />);
    expect(await screen.findByText("Site visit")).toBeInTheDocument();
    expect(screen.getByText("Sipho Magagula")).toBeInTheDocument();
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
  });

  it("is closed until Finance sets expense types", async () => {
    routes = [["/hr/me/expense-claims/options", { types: [], receipt_required_above: null, awaiting: null }], ["GET /hr/me/expense-claims", { items: [] }]];
    mount(<MyExpenses />);
    expect(await screen.findByText("No expense types yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New claim/ })).toBeNull();
  });

  it("needs a receipt above the threshold, then sends a claim below it with confirm", async () => {
    routes = [
      ["/hr/me/expense-claims/options", { types: ["Travel"], receipt_required_above: 200, awaiting: null }],
      ["GET /hr/me/expense-claims", { items: [] }],
      ["POST /hr/me/expense-claims", { ok: true, name: "HR-EXP-2", approver: "Sipho Magagula" }],
    ];
    const { container } = mount(<MyExpenses />);
    fireEvent.click(await screen.findByRole("button", { name: /New claim/ }));
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: "2026-10-01" } });
    fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: "450" } });
    fireEvent.click(screen.getByRole("button", { name: "Send claim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/receipt/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Send claim" }));
    expect(await screen.findByText("Sent to Sipho Magagula.")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ lines: [{ expense_type: "Travel", expense_date: "2026-10-01", amount: 120 }], attachments: [], confirm: true });
  });

  it("shows an outage on send, not a sent claim", async () => {
    routes = [["/hr/me/expense-claims/options", { types: ["Travel"], receipt_required_above: 1000, awaiting: null }], ["GET /hr/me/expense-claims", { items: [] }]];
    const { container } = mount(<MyExpenses />);
    fireEvent.click(await screen.findByRole("button", { name: /New claim/ }));
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: "2026-10-01" } });
    fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Send claim" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("can't be reached"));
    expect(screen.queryByText(/Sent to/)).toBeNull();
  });
});
