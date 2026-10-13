/** HR additions plan 06: the bulk action stepper (untick excludes, submit body), the detail and the reminders panel. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => () => undefined, // jsdom's AbortSignal trips the data router on navigate
}));

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { BulkActionDetail, BulkActions, NewBulkAction } from "./Bulk";
import { settingsResponse } from "../../test/hrSettings";

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let routes: Array<[string, unknown, number?]> = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
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
        .filter(([k]) => (/^(GET|POST) /.test(k) ? k.startsWith(method + " ") && url.includes(k.split(" ")[1]) : url.includes(k)))
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

const OPTIONS = {
  kinds: ["Office closure leave", "Leave allocation"],
  reminder_kinds: ["Missing required documents", "Unsigned declaration", "Open appraisal step", "Unacknowledged items"],
  leave_types: ["Annual Leave"],
  departments: ["Certification", "Finance"],
  employment_types: [],
  closure_note: "Awaiting ESWASA (A7): closure dates, and whether closure days come out of annual leave. Nothing is pre-filled.",
};
const PARAMS = { leave_type: "Annual Leave", from_date: "2026-12-24", to_date: "2027-01-01" };
const ROWS = [
  { employee: "HR-EMP-0044", employee_name: "Thandi Mamba", planned: "4 days off, balance 10 → 6", problem: null },
  { employee: "HR-EMP-0045", employee_name: "Sipho Dlamini", planned: "4 days off, balance 9 → 5", problem: null },
  { employee: "HR-EMP-0046", employee_name: "Zodwa Nkambule", planned: "4 days off, balance 2 → -2", problem: "Not enough balance (2 left)." },
];
const PREVIEW = { kind: "Office closure leave", parameters: PARAMS, selection: { departments: ["Certification"], employment_types: [], employees: [] },
  selection_text: "Active staff in Certification", rows: ROWS, count: 3, problems: 1 };
const ACTION = { name: "HRB-2026-00001", kind: "Office closure leave", status: "Waiting", parameters: PARAMS, selection_text: "Active staff in Certification",
  prepared_by: "hrm@eswasa.co.sz", people: 1, problems: 0, done: 0, skipped: 0, failed: 0, deciders: ["hrm2@eswasa.co.sz"], rows: ROWS.slice(0, 1), can_edit: false, can_decide: false };

describe("New bulk action (H18)", () => {
  it("previews without confirm, starts problem rows unticked, and sends only the kept people", async () => {
    routes = [["/hr/bulk/options", OPTIONS], ["POST /hr/bulk/preview", PREVIEW], ["POST /hr/bulk", ACTION]];
    at("/hr/bulk/new?kind=closure", "/hr/bulk/new", <NewBulkAction />);
    expect(await screen.findByText(OPTIONS.closure_note)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Leave type"), { target: { value: "Annual Leave" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-12-24" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByLabelText("Certification"));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("Not enough balance (2 left).")).toBeInTheDocument();
    const preview = calls.find((c) => c.url.includes("/hr/bulk/preview"))!;
    expect(preview.body).toEqual({ kind: "Office closure leave", parameters: { ...PARAMS, reason: null }, selection: { departments: ["Certification"], employment_types: [], employees: [] } });
    expect(preview.body).not.toHaveProperty("confirm");
    expect(screen.getByLabelText("Include Zodwa Nkambule")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Include Sipho Dlamini")); // untick excludes
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText(/for 1 person/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));

    expect(await screen.findByText(/Sent to hrm2@eswasa.co.sz in Approvals/)).toBeInTheDocument();
    const sent = calls.find((c) => c.method === "POST" && c.url.endsWith("/hr/bulk"))!;
    expect(sent.body).toMatchObject({ kind: "Office closure leave", submit: true, confirm: true, selection: { departments: ["Certification"] } });
    expect((sent.body!.exclude as string[]).sort()).toEqual(["HR-EMP-0045", "HR-EMP-0046"]);
  });

  it("allocation asks for days unless the grade policy is used", async () => {
    routes = [["/hr/bulk/options", OPTIONS]];
    at("/hr/bulk/new", "/hr/bulk/new", <NewBulkAction />);
    fireEvent.click(await screen.findByLabelText("Leave allocation"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-12-31" } });
    fireEvent.change(screen.getByLabelText("Leave type"), { target: { value: "Annual Leave" } });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Use each person's grade leave policy"));
    expect(screen.queryByLabelText("Days")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});

describe("Bulk actions list and detail", () => {
  it("lists actions with who decides; reminders count first, then send with confirm", async () => {
    routes = [
      ["GET /hr/bulk", { actions: [ACTION], kinds: OPTIONS.kinds, reminder_kinds: OPTIONS.reminder_kinds, waiting: 1 }],
      ["/hr/bulk/options", OPTIONS],
      ["POST /hr/bulk/reminders", { kind: "Unacknowledged items", count: 2, sent: 1, skipped: 1 }],
    ];
    at("/hr/bulk", "/hr/bulk", <BulkActions />);
    expect(await screen.findByText("1 waiting for approval.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Office closure leave" })).toHaveAttribute("href", "/hr/bulk/HRB-2026-00001");
    expect(screen.getByText("hrm2@eswasa.co.sz")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Remind about"), { target: { value: "Unacknowledged items" } });
    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    expect(await screen.findByText("2 people owe something.")).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes("/reminders"))!.body).toMatchObject({ dry_run: true });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    expect(await screen.findByText(/1 sent, 1 skipped/)).toBeInTheDocument();
    const send = calls.filter((c) => c.url.includes("/reminders"))[1];
    expect(send.body).toMatchObject({ kind: "Unacknowledged items", confirm: true });
  });

  it("explains a partly applied action and retries only with confirm", async () => {
    const partly = { ...ACTION, status: "Partly applied", approved_by: "hrm2@eswasa.co.sz", summary: "1 done, 0 skipped, 1 failed", failed: 1,
      rows: [{ ...ROWS[0], result: "Done", ref: "HR-LAP-2026-00012" }, { ...ROWS[1], result: "Failed", error: "HRMS refused" }] };
    routes = [["GET /hr/bulk/HRB-2026-00001", partly], ["POST /hr/bulk/HRB-2026-00001/retry", { ...partly, status: "Applying" }]];
    at("/hr/bulk/HRB-2026-00001", "/hr/bulk/:id", <BulkActionDetail />);
    expect(await screen.findByText("Partly applied", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("HRMS refused")).toBeInTheDocument();
    expect(screen.getByText("HR-LAP-2026-00012")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/retry") && c.body?.confirm === true)).toBe(true));
  });
});
