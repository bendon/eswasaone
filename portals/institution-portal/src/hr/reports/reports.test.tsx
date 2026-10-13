/** HR additions plan 07: the catalogue by role (HR, or a line manager's team view), filters drive the GET, export POSTs confirm. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { ReportsHome, ReportView } from "./Reports";
import { settingsResponse } from "../../test/hrSettings";

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
  routes = [];
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "POST" && url.includes("/export")) {
        return new Response("﻿Employee ID,Name\r\n", {
          status: 200,
          headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="eswasa-hr-staff-list-2026-10-16.csv"' },
        });
      }
      const hit = routes
        .filter(([k]) => (/^(GET|POST) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit ? json(hit[1], hit[2] ?? 200) : json({ detail: "offline" }, 503);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// A plain MemoryRouter: setSearchParams on the data router trips jsdom's AbortSignal.
function at(path: string, pattern: string, el: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={el} />
      </Routes>
    </MemoryRouter>,
  );
}

const COLUMNS = [
  { key: "employee", label: "Employee ID", type: "text" },
  { key: "employee_name", label: "Name", type: "text" },
  { key: "days", label: "Days", type: "number" },
];
const STAFF = {
  id: "staff-list", title: "Staff list", description: "Everyone with their job details.", group: "People", team_scoped: true, names: true, scope: "all",
  columns: COLUMNS,
  filters: [{ key: "department", label: "Department", type: "department", default: null, options: ["ICT", "Finance"] }],
};
const DISC = {
  id: "disciplinary", title: "Disciplinary register", description: "Counts only.", group: "Cases", team_scoped: false, names: false, scope: "all",
  columns: [{ key: "month", label: "Month", type: "text" }, { key: "cases", label: "Cases", type: "number" }], filters: [],
};

describe("Reports catalogue (H16)", () => {
  it("groups the reports the server allows", async () => {
    routes = [["GET /hr/reports", { items: [STAFF, DISC], groups: ["People", "Cases"] }]];
    at("/hr/reports", "/hr/reports", <ReportsHome />);
    expect(await screen.findByRole("region", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Staff list/ })).toHaveAttribute("href", "/hr/reports/staff-list");
    expect(screen.getByRole("link", { name: /Disciplinary register/ })).toHaveTextContent("Counts only");
    expect(calls[0].url).toMatch(/\/hr\/reports$/);
  });

  it("asks for the team view for a line manager", async () => {
    routes = [["GET /hr/reports", { items: [{ ...STAFF, scope: "team" }], groups: ["People"] }]];
    at("/hr/reports?team=1", "/hr/reports", <ReportsHome />);
    expect(await screen.findByText("Your reports only")).toBeInTheDocument();
    expect(calls[0].url).toMatch(/\/hr\/reports\?team=1$/);
    expect(screen.getByRole("link", { name: /Staff list/ })).toHaveAttribute("href", "/hr/reports/staff-list?team=1");
  });
});

describe("Report (H16)", () => {
  const RESULT = { ...STAFF, applied: { department: "ICT" }, rows: [
    { employee: "E2", employee_name: "Ben Report", days: 3 },
    { employee: "E1", employee_name: "Ann Boss", days: 10 },
  ], total: 2, truncated: false, summary: [{ label: "Days taken", value: 13 }], note: null };

  it("sends the URL filters with the GET, without the team flag, and re-runs on change", async () => {
    routes = [["GET /hr/reports/staff-list", RESULT]];
    at("/hr/reports/staff-list?department=ICT&team=1", "/hr/reports/:id", <ReportView />);
    expect(await screen.findByText("Ben Report")).toBeInTheDocument();
    expect(calls[0].url).toMatch(/\/hr\/reports\/staff-list\?department=ICT$/);
    fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Finance" } });
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/hr/reports/staff-list?department=Finance"))).toBe(true));
  });

  it("sorts by a column", async () => {
    routes = [["GET /hr/reports/staff-list", RESULT]];
    at("/hr/reports/staff-list", "/hr/reports/:id", <ReportView />);
    await screen.findByText("Ben Report");
    fireEvent.click(screen.getByRole("button", { name: "Days" }));
    let cells = screen.getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(cells[0]).toContain("Ben Report");
    fireEvent.click(screen.getByRole("button", { name: /Days/ }));
    cells = screen.getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(cells[0]).toContain("Ann Boss");
  });

  it("needs a reason before exporting names, then POSTs confirm with the filters", async () => {
    routes = [["GET /hr/reports/staff-list", RESULT]];
    at("/hr/reports/staff-list", "/hr/reports/:id", <ReportView />);
    const csv = await screen.findByRole("button", { name: "Export CSV" });
    expect(csv).toBeDisabled();
    expect(screen.getByText("Exports are logged.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Why you need this export/), { target: { value: "Board staff audit 2026" } });
    fireEvent.click(csv);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/hr\/reports\/staff-list\/export$/);
    expect(post.body).toEqual({ format: "csv", filters: { department: "ICT" }, reason: "Board staff audit 2026", confirm: true });
    expect(await screen.findByText(/Saved eswasa-hr-staff-list-2026-10-16.csv/)).toBeInTheDocument();
  });

  it("exports a counts-only report as Excel without a reason", async () => {
    routes = [["GET /hr/reports/disciplinary", { ...DISC, applied: {}, rows: [{ month: "2026-03", cases: 2 }], total: 1, truncated: false, summary: [], note: null }]];
    at("/hr/reports/disciplinary", "/hr/reports/:id", <ReportView />);
    const xlsx = await screen.findByRole("button", { name: "Export Excel" });
    expect(screen.queryByLabelText(/Why you need this export/)).toBeNull();
    fireEvent.click(xlsx);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ format: "xlsx", filters: {}, reason: null, confirm: true });
  });
});
