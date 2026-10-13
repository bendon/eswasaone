/** Screen ↔ backend sweep, phase 5: requisition detail, case owner change, structure edits, remove head. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { RequisitionDetail } from "./recruitment/RequisitionDetail";
import { CaseDetail } from "./cases/Cases";
import { StructureView } from "./StructureView";
import { DepartmentDetail } from "./establishment/Establishment";
import { settingsResponse } from "../test/hrSettings";

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
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const hit = routes
        .filter(([k]) => (/^(GET|POST|PATCH|DELETE) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
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

describe("Requisition detail", () => {
  it("shows the stage and who is being waited on", async () => {
    routes = [["/hr/recruitment/requisitions/HR-HIREQ-1", { id: "HR-HIREQ-1", designation: "Lead Auditor", department: "Certification", status: "Pending", requested_by: "Sipho Magagula", applicants: {}, stage: "HR", waiting_on: "Nokuthula Shongwe" }]];
    at("/r/HR-HIREQ-1", "/r/:id", <RequisitionDetail />);
    expect(await screen.findByText("Waiting on Nokuthula Shongwe in Approvals")).toBeInTheDocument();
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
  });

  it("an approved, unadvertised requisition offers publishing", async () => {
    routes = [["/hr/recruitment/requisitions/HR-HIREQ-2", { id: "HR-HIREQ-2", designation: "Metrologist", status: "Open & Approved", applicants: {} }]];
    at("/r/HR-HIREQ-2", "/r/:id", <RequisitionDetail />);
    expect(await screen.findByRole("link", { name: "Publish to the careers page" })).toHaveAttribute("href", "/hr/recruitment/HR-HIREQ-2/publish");
  });
});

const OWNERS = [{ user: "hrm@x", name: "Nokuthula Shongwe" }, { user: "ed@x", name: "Executive Director" }];
const CASE = {
  id: "HRC-2026-00005", kind: "disciplinary", stage: "Investigation", stages: ["Opened", "Investigation", "Hearing scheduled", "Outcome issued", "Appeal", "Closed"],
  next: ["Hearing scheduled"], opened_on: "2026-09-29", owner: "hrm@x", owner_name: "Nokuthula Shongwe", people: [], description: "x", notes: [], owners: OWNERS,
};

describe("Case owner change", () => {
  it("needs a reason and shows the server's refusal", async () => {
    routes = [["GET /hr/cases/disciplinary/HRC-2026-00005", CASE], ["POST /hr/cases/disciplinary/HRC-2026-00005/owner", { detail: "The Executive Director is involved in this case, so can't own it." }, 422]];
    at("/hr/cases/disciplinary/HRC-2026-00005", "/hr/cases/:kind/:id", <CaseDetail />);
    fireEvent.click(await screen.findByRole("button", { name: "Change owner" }));
    fireEvent.change(screen.getByLabelText("New owner"), { target: { value: "ed@x" } });
    fireEvent.click(screen.getByRole("button", { name: "Reassign" }));
    expect(await screen.findByText(/Say why the case is moving/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "Workload" } });
    fireEvent.click(screen.getByRole("button", { name: "Reassign" }));
    expect(await screen.findByText(/is involved in this case/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ owner: "ed@x", note: "Workload", confirm: true });
  });
});

describe("Structure edits", () => {
  it("edits a department with PATCH and shows the disable refusal", async () => {
    routes = [
      ["GET /hr/departments", { items: [{ id: "Certification - ES", name: "Certification", code: "CERT", status: "active", designation_count: 2, filled_count: 5 }] }],
      ["/hr/designations", { items: [] }],
      ["/hr/locations", { items: [] }],
      ["/hr/cost-centres", { items: [] }],
      ["/hr/grade-bands", { items: [] }],
      ["/hr/establishment", { departments: [], totals: {}, has_plans: false, pending: [], can_request: false }],
      ["/hr/orgchart", { items: [] }],
      ["PATCH /hr/departments/Certification%20-%20ES", { detail: "Certification can't be archived: 5 active people are in it." }, 422],
    ];
    at("/hr/structure?tab=departments", "/hr/structure", <StructureView />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "archived" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/can't be archived: 5 active people/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ status: "archived", confirm: true });
  });
});

describe("Remove head", () => {
  it("clears the head with confirm in the query", async () => {
    const DEPT = { department: "Certification", parent: null, head: { id: "EMP-2", name: "Sipho Dlamini" }, posts: [], people: [{ id: "EMP-2", name: "Sipho Dlamini", designation: "Head" }], cover_warnings: [], changes: [], can_request: false, can_set_head: true };
    routes = [["GET /hr/establishment/departments/Certification", DEPT], ["DELETE /hr/departments/Certification/head", { id: "Certification", name: "Certification", status: "active", designation_count: 0, filled_count: 0 }]];
    at("/hr/structure/departments/Certification", "/hr/structure/departments/:id", <DepartmentDetail />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove head" }));
    await screen.findByRole("button", { name: "Remove head" });
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toContain("/hr/departments/Certification/head?confirm=true");
  });
});
