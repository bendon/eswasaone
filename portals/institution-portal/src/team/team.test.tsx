/** My team (T1–T4): overview, member, probation review, empty team, calendar. Core stubbed at fetch. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "sipho@eswasa.co.sz", full_name: "Sipho Magagula", email: "sipho@eswasa.co.sz", roles: ["Employee"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "sipho",
  }),
}));

import { ProbationReview, TeamCalendar, TeamHome, TeamMember } from "./Team";
import { settingsResponse } from "../test/hrSettings";

const BONGANI = { employee: "EMP-79", employee_name: "Bongani Dlamini", designation: "Certification Officer", department: "Certification",
  direct: true, on_probation: true, probation_review_due: "2026-10-31", contract_ends: null, away_today: null, date_of_joining: "2026-05-04" };
const TEAM = { manager: "EMP-31", summary: { people: 2, direct: 2, away_today: 1, probation_reviews_due: 1, contracts_ending: 0, waiting_for_you: 3 },
  members: [BONGANI, { ...BONGANI, employee: "EMP-44", employee_name: "Thandi Mamba", on_probation: false, probation_review_due: null, away_today: "Annual Leave" }] };
const DETAIL = { ...BONGANI, line_manager: "Sipho Magagula", scheduled_confirmation_date: "2026-10-31",
  balances: [{ leave_type: "Annual Leave", allocated: 21, used: 2, balance: 19 }],
  authorisations: [{ id: "SA-9", employee: "EMP-79", skill: "QMS auditor", status: "In training", valid_from: "2026-12-01" }] };

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(team: unknown = TEAM) {
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
      if (method === "POST") return json({ ...DETAIL, on_probation: false });
      if (url.includes("/hr/team/calendar")) return json({ from_date: "2026-10-12", to_date: "2026-10-23", people: [{ employee: "EMP-79", employee_name: "Bongani Dlamini" }],
        entries: [{ employee: "EMP-79", kind: "field", label: "Surveillance audit", from_date: "2026-10-13", to_date: "2026-10-13", approved: true },
          { employee: "EMP-79", kind: "leave", label: "Annual Leave", from_date: "2026-10-15", to_date: "2026-10-16", approved: false }] });
      if (url.includes("/hr/team/EMP-79")) return json(DETAIL);
      if (url.includes("/hr/team")) return json(team);
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/team", element: <TeamHome /> },
      { path: "/team/calendar", element: <TeamCalendar /> },
      { path: "/team/:employee", element: <TeamMember /> },
      { path: "/team/:employee/probation", element: <ProbationReview /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("My team (T1)", () => {
  it("shows who reports to me, who is away and the next review", async () => {
    stub();
    mount("/team");
    expect(await screen.findByText("2 report directly to you, 2 in all.")).toBeInTheDocument();
    expect(screen.getByText("Away: Annual Leave")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start review" })).toHaveAttribute("href", "/team/EMP-79/probation");
    expect(screen.getByRole("link", { name: "Bongani Dlamini" })).toHaveAttribute("href", "/team/EMP-79");
  });

  it("says so when nobody reports to me", async () => {
    stub({ manager: "EMP-12", members: [], summary: { people: 0, direct: 0 } });
    mount("/team");
    expect(await screen.findByText("Nobody reports to you", { selector: "h3, h2, b, strong, p, div" })).toBeInTheDocument();
  });
});

describe("Team member (T3)", () => {
  it("shows job, leave and authorisations but no personal or pay details", async () => {
    stub();
    mount("/team/EMP-79");
    expect(await screen.findByRole("heading", { name: "Bongani Dlamini" })).toBeInTheDocument();
    expect(screen.getByText("19 of 21 left")).toBeInTheDocument();
    expect(screen.getByText("QMS auditor")).toBeInTheDocument();
    expect(screen.getByText("Personal and pay details aren't shown to line managers")).toBeInTheDocument();
  });
});

describe("Probation review (T4)", () => {
  it("extending needs a date; ending goes to HR", async () => {
    const calls = stub();
    mount("/team/EMP-79/probation");
    await screen.findByRole("heading", { name: "Probation review: Bongani Dlamini" });
    const submit = screen.getByRole("button", { name: "Submit review" });
    fireEvent.click(screen.getByLabelText(/^Extend/));
    fireEvent.change(screen.getByLabelText(/^How it went/), { target: { value: "Needs the QMS witnessed audits done." } });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/^Recommend ending employment/));
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(await screen.findByRole("heading", { name: "Sent to HR" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ outcome: "end", summary: "Needs the QMS witnessed audits done.", extend_to: null, confirm: true });
  });
});

describe("Team calendar (T2)", () => {
  it("marks field work and requested leave", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T09:00:00"));
    try {
      const calls = stub();
      mount("/team/calendar");
      expect(await screen.findByLabelText("Surveillance audit")).toHaveTextContent("F");
      const requested = screen.getAllByLabelText("Annual Leave (requested)");
      expect(requested).toHaveLength(2);
      expect(requested[0]).toHaveTextContent("A");
      expect(calls[0].url).toMatch(/from_date=2026-10-12&to_date=2026-10-23$/);
    } finally {
      vi.useRealTimers();
    }
  });
});
