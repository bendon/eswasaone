/** Screen ↔ backend sweep, phase 6: HR setup import (template, dry run, run, past runs) and master-data load. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager", "System Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { ImportEmployees, MasterDataLoad } from "./HrImport";
import { settingsResponse } from "../test/hrSettings";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
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
      calls.push({ url, method, body: init?.body instanceof FormData ? (Object.fromEntries(init.body.entries()) as Record<string, unknown>) : undefined });
      const hit = routes
        .filter(([k]) => (/^(GET|POST) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit ? json(hit[1], hit[2] ?? 200) : json({ detail: "offline" }, 503);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const xlsx = () => new File(["x"], "pass1.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

describe("Import employees (H14)", () => {
  it("links the template, shows row problems from the dry run and won't run a bad file", async () => {
    routes = [
      ["GET /hr/import/runs", { items: [] }],
      ["POST /hr/import/dry-run", { pass_no: 1, rows: 86, create: 84, update: 0, unchanged: 0, ok: false, warnings: [], errors: [{ row: 14, employee_number: "ESW-0014", field: "reports_to", message: "Only the Executive Director may have no line manager." }] }],
    ];
    render(<ImportEmployees />);
    expect(await screen.findByText("No imports yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download the pass 1 template" }).getAttribute("href")).toContain("/hr/import/template?pass=1");
    fireEvent.change(screen.getByLabelText(/Filled-in file/), { target: { files: [xlsx()] } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText("Only the Executive Director may have no line manager.")).toBeInTheDocument();
    expect(screen.getByText("1 problem to fix")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run pass/ })).toBeNull();
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ pass: "1" });
  });

  it("runs a clean file and follows the run to Done", async () => {
    routes = [
      ["GET /hr/import/runs", { items: [] }],
      ["POST /hr/import/dry-run", { pass_no: 1, rows: 2, create: 2, update: 0, unchanged: 0, ok: true, warnings: [], errors: [] }],
      ["POST /hr/import/run", { job_id: "IMP-1", run: "IMP-1", status: "Queued" }, 202],
      ["GET /hr/import/runs/IMP-1", { id: "IMP-1", pass_no: 1, status: "Done", rows: 2, created: 2, updated: 0, unchanged: 0, error_count: 0 }],
    ];
    render(<ImportEmployees />);
    fireEvent.change(await screen.findByLabelText(/Filled-in file/), { target: { files: [xlsx()] } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run pass 1" }));
    expect(await screen.findByText(/Run IMP-1: Done. 2 created, 0 updated./)).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes("/hr/import/run") && c.method === "POST")!.body).toMatchObject({ pass: "1", confirm: "true" });
  });

  it("refuses a file that isn't csv or xlsx before sending it", async () => {
    routes = [["GET /hr/import/runs", { items: [] }]];
    render(<ImportEmployees />);
    fireEvent.change(await screen.findByLabelText(/Filled-in file/), { target: { files: [new File(["x"], "staff.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText(/Send a .csv or .xlsx file/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("Master data load", () => {
  it("checks first, then loads, and shows the example-file refusal", async () => {
    routes = [["POST /hr/setup/master-data", { detail: "This is the example file. Load ESWASA's signed-off file instead." }, 422]];
    render(<MasterDataLoad />);
    fireEvent.change(screen.getByLabelText(/Master-data file/), { target: { files: [new File(["{}"], "example.json", { type: "application/json" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText(/This is the example file/)).toBeInTheDocument();
    expect(calls[0].body).toMatchObject({ dry_run: "true" });
    expect(screen.queryByRole("button", { name: "Load it" })).toBeNull();
  });

  it("offers Load after a clean check", async () => {
    routes = [["POST /hr/setup/master-data", { dry_run: true, ok: true, counts: { departments: { created: 10, updated: 0, unchanged: 0 } }, missing_departments: [], kept: [], errors: [] }]];
    render(<MasterDataLoad />);
    fireEvent.change(screen.getByLabelText(/Master-data file/), { target: { files: [new File(["{}"], "eswasa.json", { type: "application/json" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText("departments: 10 new, 0 updated, 0 unchanged")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load it" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body).toMatchObject({ dry_run: "false", confirm: "true" });
  });
});
