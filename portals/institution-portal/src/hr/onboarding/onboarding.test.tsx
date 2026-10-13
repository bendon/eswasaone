/** Onboarding (H7, E10): start with named owners, tick tasks, the joiner's first days. Core stubbed. */
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

import { OnboardingDetail, StartOnboarding } from "./Onboarding";
import { FirstDays } from "../../me/FirstDays";
import { settingsResponse } from "../../test/hrSettings";

const DECL = "Sign the impartiality and confidentiality declaration";
const ONB = {
  id: "HR-EMP-ONB-1", employee: "HR-EMP-87", employee_name: "Ayanda Mthethwa", designation: "Certification Officer", department: "Certification",
  date_of_joining: "2026-12-01", boarding_status: "In Process", done: 1, total: 3, line_manager: "Sipho Magagula",
  activities: [
    { activity_name: "Contract signed and filed", user: "hr@x", user_name: "Nokuthula Shongwe", task: "T-1", status: "Completed", mine: false },
    { activity_name: "Laptop and access card", user: "ict@x", user_name: "Mxolisi Bhembe", task: "T-2", status: "Open", mine: false },
    { activity_name: DECL, user: "ayanda@x", user_name: "Ayanda Mthethwa", task: "T-3", status: "Open", mine: true },
    { activity_name: "Complete the induction course", user: "ayanda@x", user_name: "Ayanda Mthethwa", task: "T-4", status: "Open", mine: true },
  ],
};

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(postReply: unknown = ONB) {
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
      if (method === "POST") return json(postReply, url.endsWith("/hr/onboarding") ? 201 : 200);
      if (url.includes("/hr/onboarding/defaults")) return json({ employee: "HR-EMP-87", employee_name: "Ayanda Mthethwa", date_of_joining: "2026-12-01", job_offer: "HR-OFF-1", has_login: true,
        activities: [{ activity_name: "Contract signed and filed", group: "HR", user: "hr@x" }, { activity_name: "Laptop and access card", group: "ICT", user: null }] });
      if (url.includes("/hr/me/onboarding")) return json({ onboarding: ONB });
      if (url.includes("/hr/onboarding/")) return json(ONB);
      if (url.includes("/hr/employees")) return json({ items: [{ id: "HR-EMP-0040", employee_name: "Mxolisi Bhembe", user_id: "ict@x" }, { id: "HR-EMP-0012", employee_name: "Nokuthula Shongwe", user_id: "hr@x" }] });
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/hr/onboarding/new", element: <StartOnboarding /> },
      { path: "/hr/onboarding/:id", element: <OnboardingDetail /> },
      { path: "/me/first-days", element: <FirstDays /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Start onboarding", () => {
  it("needs an owner for every task, then starts", async () => {
    const calls = stub();
    mount("/hr/onboarding/new?employee=HR-EMP-87");
    expect(await screen.findByRole("heading", { name: "Start onboarding: Ayanda Mthethwa" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "1 task need an owner" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Owner for Laptop and access card"), { target: { value: "ict@x" } });
    const start = screen.getByRole("button", { name: "Start onboarding" });
    fireEvent.click(start);
    expect(await screen.findByRole("heading", { name: "Onboarding started" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      employee: "HR-EMP-87",
      activities: [{ activity_name: "Contract signed and filed", user: "hr@x" }, { activity_name: "Laptop and access card", user: "ict@x" }],
      confirm: true,
    });
  });
});

describe("Checklist (H7)", () => {
  it("HR marks a task done", async () => {
    const calls = stub({ ...ONB, done: 2, activities: ONB.activities.map((a) => (a.task === "T-2" ? { ...a, status: "Completed" } : a)) });
    mount("/hr/onboarding/HR-EMP-ONB-1");
    expect(await screen.findByText("1 of 3 done. Each task is in its owner's Approvals, under Tasks.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0]);
    await waitFor(() => expect(screen.getByText(/2 of 3 done/)).toBeInTheDocument());
    expect(calls.find((c) => c.method === "POST")?.url).toMatch(/\/hr\/onboarding\/tasks\/T-2\/done$/);
  });
});

describe("First days (E10)", () => {
  it("sends the joiner to sign first and lets them tick their own tasks", async () => {
    const calls = stub();
    mount("/me/first-days");
    expect(await screen.findByRole("heading", { name: "Welcome to ESWASA, Ayanda" })).toBeInTheDocument();
    expect(screen.getByText(/your line manager is Sipho Magagula/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/me/declaration");
    expect(screen.getByText("Sign your declaration first")).toBeInTheDocument();
    // Only the joiner's own non-declaration task can be ticked; ICT's is shown but not tickable.
    const buttons = screen.getAllByRole("button", { name: "Mark done" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/tasks/T-4/done"))).toBe(true));
  });
});
