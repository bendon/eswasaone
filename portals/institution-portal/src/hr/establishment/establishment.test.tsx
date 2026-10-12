/** Establishment (J11): posts by department, department detail and head, change request, where a change is. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hr@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hr@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { ChangeDetail, DepartmentDetail, EstablishmentPanel, RequestChange } from "./Establishment";

const COUNTS = { approved: 6, frozen: 1, filled: 3, in_recruitment: 1, vacant: 1 };
const CHANGE = { id: "EC-1", department: "Certification", designation: "Auditor", change: "Add", count: 1, new_grade: null,
  summary: "Add 1 Auditor post", state: "Waiting for Council", council_required: true, date: "2026-10-12" };
const EST = { departments: [{ department: "Certification", head: { id: "EMP-2", name: "Sipho Dlamini" }, posts: [{ designation: "Auditor", ...COUNTS }], ...COUNTS, unplanned: 0 }],
  totals: COUNTS, has_plans: true, pending: [CHANGE], can_request: true };
const DEPT = { department: "Certification", parent: null, head: null, posts: [{ designation: "Auditor", grade: "C1", ...COUNTS }],
  people: [{ id: "EMP-9", name: "Thandi Nxumalo", designation: "Auditor" }], cover_warnings: [{ skill: "ISO 9001 lead audit", holders: 1 }],
  changes: [], can_request: true, can_set_head: true };
const DETAIL = { ...CHANGE, reason: "New scheme", cost_note: null, current_grade: null, before: { approved: 6, frozen: 1 }, prepared_by: "hr@x",
  ed_decision_by: "ed@x", council_reference: null, decision_note: null, deciders: [{ user: "sec@x", name: "Lindiwe Board Secretary" }],
  track: [{ title: "Asked", state: "done" }, { title: "Executive Director", state: "done" }, { title: "Council HR & Remuneration Committee", state: "now" }, { title: "Establishment updated" }] };

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(est: unknown = EST) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
      if (method === "POST" && url.includes("/head")) return json({ id: "Certification", name: "Certification" });
      if (method === "POST") return json(DETAIL);
      if (url.includes("/hr/establishment/departments/")) return json(DEPT);
      if (url.includes("/hr/establishment/changes/")) return json(DETAIL);
      if (url.includes("/hr/establishment")) return json(est);
      if (url.includes("/hr/designations")) return json({ items: [{ id: "Auditor", title: "Auditor" }, { id: "Metrologist", title: "Metrologist" }] });
      if (url.includes("/hr/grade-bands")) return json({ items: [{ id: "C1", name: "C1" }, { id: "D2", name: "D2" }] });
      if (url.includes("/hr/orgchart")) return json({ nodes: [] });
      return new Response(JSON.stringify({ detail: "offline" }), { status: 503 });
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/hr/structure", element: <EstablishmentPanel /> },
      { path: "/hr/structure/departments/:id", element: <DepartmentDetail /> },
      { path: "/hr/structure/changes/new", element: <RequestChange /> },
      { path: "/hr/structure/changes/:id", element: <ChangeDetail /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Establishment", () => {
  it("shows filled against approved posts and the changes waiting", async () => {
    stub();
    mount("/hr/structure");
    expect(await screen.findByRole("img", { name: "3 of 6 posts filled" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Certification" })).toHaveAttribute("href", "/hr/structure/departments/Certification");
    expect(screen.getByRole("link", { name: "Add 1 Auditor post" })).toHaveAttribute("href", "/hr/structure/changes/EC-1");
    expect(screen.getByText("With the Council")).toBeInTheDocument();
  });

  it("says when there's no approved establishment, without inventing posts", async () => {
    stub({ ...EST, has_plans: false, departments: [], pending: [], totals: { approved: 0, frozen: 0, filled: 0, in_recruitment: 0, vacant: 0 } });
    mount("/hr/structure");
    expect(await screen.findByText("No approved establishment yet")).toBeInTheDocument();
  });
});

describe("Department", () => {
  it("warns when there's no head and sets one with confirm", async () => {
    const calls = stub();
    mount("/hr/structure/departments/Certification");
    expect(await screen.findByText("No head of department")).toBeInTheDocument();
    expect(screen.getByText(/ISO 9001 lead audit \(one person\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Head of department"), { target: { value: "EMP-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Set as head" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: expect.stringContaining("/hr/departments/Certification/head"), body: { employee_id: "EMP-9", confirm: true } });
  });
});

describe("Request a change", () => {
  it("sends a freeze for the chosen post", async () => {
    const calls = stub();
    mount("/hr/structure/changes/new?department=Certification&designation=Auditor");
    expect(await screen.findByText(/Now: 6 approved, 3 filled/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Freeze posts/ }));
    expect(screen.getByText("Executive Director")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Budget cut this year" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for decision" }));
    expect(await screen.findByText("Sent to the Executive Director")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the request/ })).toHaveAttribute("href", "/hr/structure/changes/EC-1");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      department: "Certification", designation: "Auditor", change: "Freeze", count: 1, new_grade: null, reason: "Budget cut this year", cost_note: null, confirm: true,
    });
  });

  it("only allows adding posts for a designation with none approved", async () => {
    stub();
    mount("/hr/structure/changes/new?department=Certification&designation=Metrologist");
    expect(await screen.findByText(/only adding posts is possible/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Remove posts/ })).toBeDisabled();
  });
});

describe("Change detail", () => {
  it("shows where it is and who decides, with no decision buttons", async () => {
    stub();
    mount("/hr/structure/changes/EC-1");
    expect(await screen.findByText("With the Council HR & Remuneration Committee")).toBeInTheDocument();
    expect(screen.getByText(/Decided in Approvals by Lindiwe Board Secretary/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve|Reject/ })).not.toBeInTheDocument();
  });
});
