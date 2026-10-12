/** Lifecycle (J8, J9): changes list, promotion sends only what changes, leaver needs owners, offboarding. */
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

import { EmployeeChanges, LeaverForm, OffboardingDetail, PromotionForm } from "./Lifecycle";

const CHANGES = { employee: "EMP-19", employee_name: "Mandla Zwane", status: "Active", items: [
  { id: "HR-EMP-SEP-1", kind: "separation", date: "2026-10-31", state: "Offboarding in process", changes: [{ property: "Reason", current: "", new: "Resignation" }] },
  { id: "HR-EMP-PRO-1", kind: "promotion", date: "2026-11-01", state: "Waiting for approval", changes: [{ property: "Designation", current: "Accountant", new: "Senior Accountant" }] },
] };

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub() {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (method === "POST") return json(url.includes("/tasks/") ? { id: "HR-EMP-SEP-1", employee_name: "Mandla Zwane", done: 3, total: 5, activities: [] } : CHANGES);
      if (url.includes("/changes")) return json(CHANGES);
      if (url.includes("/separation-defaults")) return json({ employee: "EMP-19", employee_name: "Mandla Zwane", reasons: ["Resignation", "Dismissal"],
        activities: [{ activity_name: "Exit interview", group: "HR", user: "hr@x" }, { activity_name: "Return laptop and access card", group: "ICT", user: null }] });
      if (url.includes("/hr/offboarding/")) return json({ id: "HR-EMP-SEP-1", kind: "offboarding", employee: "EMP-19", employee_name: "Mandla Zwane", last_day: "2026-10-31", reason: "Resignation", done: 2, total: 5,
        activities: [{ activity_name: "Return laptop and access card", user: "ict@x", user_name: "Mxolisi Bhembe", task: "T-9", status: "Open" }] });
      if (url.includes("/hr/designations")) return json({ items: [{ id: "Senior Accountant", title: "Senior Accountant" }] });
      if (url.includes("/hr/grade-bands")) return json({ items: [{ id: "D", name: "D" }] });
      if (url.includes("/hr/departments") || url.includes("/hr/locations")) return json({ items: [] });
      if (url.includes("/hr/employees")) return json({ items: [{ id: "EMP-15", employee_name: "Busisiwe Fakudze", user_id: "busi@x" }, { id: "EMP-40", employee_name: "Mxolisi Bhembe", user_id: "ict@x" }] });
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/hr/directory/:id", element: <EmployeeChanges /> },
      { path: "/hr/directory/:id/promote", element: <PromotionForm /> },
      { path: "/hr/directory/:id/leave", element: <LeaverForm /> },
      { path: "/hr/offboarding/:id", element: <OffboardingDetail /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Changes", () => {
  it("lists changes with their state and links the offboarding", async () => {
    stub();
    mount("/hr/directory/EMP-19");
    expect(await screen.findByRole("heading", { name: "Mandla Zwane" })).toBeInTheDocument();
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Offboarding checklist" })).toHaveAttribute("href", "/hr/offboarding/HR-EMP-SEP-1");
    expect(screen.queryByRole("link", { name: "Record a leaver" })).not.toBeInTheDocument();
  });
});

describe("Promotion", () => {
  it("sends only the fields that change", async () => {
    const calls = stub();
    mount("/hr/directory/EMP-19/promote");
    const send = await screen.findByRole("button", { name: "Send for approval" });
    fireEvent.change(screen.getByLabelText("Takes effect"), { target: { value: "2026-11-01" } });
    expect(send).toBeDisabled(); // nothing changes yet
    fireEvent.change(await screen.findByLabelText(/^New post/), { target: { value: "Senior Accountant" } });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    expect(await screen.findByRole("heading", { name: "Promotion sent for approval" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ effective: "2026-11-01", designation: "Senior Accountant", note: null, confirm: true });
  });
});

describe("Leaver", () => {
  it("needs a reason, a last day and an owner for every task", async () => {
    const calls = stub();
    mount("/hr/directory/EMP-19/leave");
    await screen.findByRole("heading", { name: "Record a leaver: Mandla Zwane" });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Resignation" } });
    fireEvent.change(screen.getByLabelText("Last working day"), { target: { value: "2026-10-31" } });
    expect(screen.getByRole("button", { name: "1 task need an owner" })).toBeDisabled();
    fireEvent.change(await screen.findByLabelText("Owner for Return laptop and access card"), { target: { value: "ict@x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByRole("heading", { name: "Leaver sent for approval" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      reason: "Resignation", last_day: "2026-10-31", confirm: true,
      activities: [{ activity_name: "Exit interview", user: "hr@x" }, { activity_name: "Return laptop and access card", user: "ict@x" }],
    });
  });
});

describe("Offboarding (H7b)", () => {
  it("ticks a task", async () => {
    const calls = stub();
    mount("/hr/offboarding/HR-EMP-SEP-1");
    expect(await screen.findByText(/Resignation. Last day 31 Oct 2026. 2 of 5 done./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/hr/onboarding/tasks/T-9/done"))).toBe(true));
  });
});
