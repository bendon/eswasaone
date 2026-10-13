/** Performance (J6): cycle list, start wizard, remind, self-assessment and manager review. */
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

import { CycleDetail, CycleNew, PerformanceHome } from "./Performance";
import { MyAppraisal } from "../../me/MyAppraisal";
import { TeamReview } from "../../team/Review";
import { settingsResponse } from "../../test/hrSettings";

const CYCLE = {
  name: "CYC-1", cycle_name: "Mid-year review 2026/27", start_date: "2026-10-01", end_date: "2027-03-31", status: "In Progress",
  departments: [{ department: "Certification", people: 2, objectives_set: 1, self_done: 1, manager_done: 0 }],
  people: [
    { appraisal: "APR-1", employee: "EMP-1", employee_name: "Thandi Mamba", designation: "Auditor", manager_name: "Sipho Magagula", objectives: 2, self_done: true, manager_done: false, step: "manager" },
    { appraisal: "APR-2", employee: "EMP-2", employee_name: "Bongani Dube", designation: "Auditor", manager_name: "Sipho Magagula", objectives: 0, self_done: false, manager_done: false, step: "self" },
  ],
};
const APPRAISAL = {
  id: "APR-1", cycle: "CYC-1", cycle_name: "Mid-year review 2026/27", end_date: "2027-03-31", employee: "EMP-1", employee_name: "Thandi Mamba",
  manager: "EMP-9", manager_name: "Sipho Magagula", kras: ["Audit quality"],
  goals: [{ id: "G-1", goal_name: "Close 40 audits on time", kra: "Audit quality", strategic_goal: "Goal 2: faster certification", progress: 50 }],
  criteria: [{ criteria: "Quality of work", weight: 50, self: null, manager: null }, { criteria: "Timeliness", weight: 50, self: null, manager: null }],
  reflections: null, manager_feedback: null, self_done: false, manager_done: false, step: "self", can_self: true, can_review: false, can_add_goals: false,
};

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(appraisal: Record<string, unknown> = APPRAISAL) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (url.includes("/remind")) return json({ sent: 1 });
      if (method === "POST" && url.endsWith("/hr/performance/cycles")) return json(CYCLE);
      if (method === "POST") return json({ ...appraisal, self_done: true, step: "manager", can_self: false });
      if (url.includes("/hr/performance/defaults"))
        return json({ templates: [{ name: "Auditors", title: "Auditors and reviewers", criteria: ["Quality of work", "Timeliness"], kras: [] }], departments: [{ name: "Certification", people: 14 }, { name: "Laboratory", people: 9 }], reminder_days: [10, 3] });
      if (url.includes("/hr/performance/cycles/")) return json(CYCLE);
      if (url.endsWith("/hr/performance")) return json({ items: [{ ...CYCLE, people: 2, objectives_set: 1, self_done: 1, manager_done: 0 }] });
      if (url.includes("/hr/me/appraisal") || url.includes("/review")) return json({ appraisal });
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/hr/performance", element: <PerformanceHome /> },
      { path: "/hr/performance/new", element: <CycleNew /> },
      { path: "/hr/performance/cycles/:name", element: <CycleDetail /> },
      { path: "/me/appraisal", element: <MyAppraisal /> },
      { path: "/team/:employee/review", element: <TeamReview /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Performance (H8)", () => {
  it("lists cycles with completion", async () => {
    stub();
    mount("/hr/performance");
    expect(await screen.findByRole("link", { name: "Mid-year review 2026/27" })).toHaveAttribute("href", "/hr/performance/cycles/CYC-1");
    expect(screen.getAllByText("1 of 2").length).toBeGreaterThan(0);
  });

  it("shows everyone's step and reminds those with one open", async () => {
    const calls = stub();
    mount("/hr/performance/cycles/CYC-1");
    expect(await screen.findByText(/2 with a step still open/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bongani Dube" })).toHaveAttribute("href", "/hr/performance/appraisals/APR-2");
    fireEvent.click(screen.getByRole("button", { name: "Remind outstanding" }));
    expect(await screen.findByText("1 reminder sent.")).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes("/remind"))?.body).toEqual({ department: null, confirm: true });
  });
});

describe("Start a cycle (H8a)", () => {
  it("walks period → template → who → review and starts it", async () => {
    const calls = stub();
    mount("/hr/performance/new");
    fireEvent.change(await screen.findByLabelText("Cycle name"), { target: { value: "Mid-year review 2026/27" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: "2027-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const next = screen.getByRole("button", { name: "Continue" });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Auditors and reviewers/ }));
    fireEvent.click(next);
    expect(screen.getByText("23 people will be appraised.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Certification/ }));
    expect(screen.getByText("14 people will be appraised.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));
    expect(await screen.findByRole("heading", { name: "Mid-year review 2026/27 started" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      cycle_name: "Mid-year review 2026/27", start_date: "2026-10-01", end_date: "2027-03-31", template: "Auditors", departments: ["Certification"], confirm: true,
    });
  });
});

describe("Self-assessment (E7)", () => {
  it("needs every item rated, then hands it to the manager", async () => {
    const calls = stub();
    mount("/me/appraisal");
    expect(await screen.findByText("Goal 2: faster certification")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 items to rate" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Quality of work: 4 of 5" }));
    fireEvent.click(screen.getByRole("radio", { name: "Timeliness: 3 of 5" }));
    fireEvent.change(screen.getByLabelText("Reflections"), { target: { value: "40 audits on track." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit to my manager" }));
    expect(await screen.findByText(/Submitted. Sipho Magagula adds their ratings next./)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      ratings: [{ criteria: "Quality of work", stars: 4 }, { criteria: "Timeliness", stars: 3 }], reflections: "40 audits on track.", confirm: true,
    });
  });
});

describe("Manager review (T5)", () => {
  it("waits for the self-assessment, then rates and comments", async () => {
    stub({ ...APPRAISAL, can_self: false, can_add_goals: true });
    const first = mount("/team/EMP-1/review");
    expect(await screen.findByText("Waiting for Thandi Mamba's self-assessment")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add an objective" })).toBeInTheDocument();
    first.unmount();
    vi.unstubAllGlobals();

    const calls = stub({ ...APPRAISAL, can_self: false, self_done: true, step: "manager", can_review: true, criteria: [{ criteria: "Quality of work", weight: 100, self: 4, manager: null }] });
    mount("/team/EMP-1/review");
    fireEvent.click(await screen.findByRole("radio", { name: "Quality of work: 3 of 5" }));
    const send = screen.getByRole("button", { name: "Submit review" });
    expect(send).toBeDisabled(); // comment still missing
    fireEvent.change(screen.getByLabelText(/Your comment to Thandi Mamba/), { target: { value: "Strong half year." } });
    fireEvent.click(send);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/hr/team/EMP-1/review"))).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ratings: [{ criteria: "Quality of work", stars: 3 }], feedback: "Strong half year.", confirm: true });
  });
});
