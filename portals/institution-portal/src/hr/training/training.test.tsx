/** HR additions plan 05: the plan stepper, plan detail (Schedule only when approved), event attendance and nominations, T8 and E13. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

const nav = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => (to: string) => nav.to.push(to), // jsdom's AbortSignal trips the data router on navigate
}));

const who = vi.hoisted(() => ({ roles: ["HR Manager"] }));
vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: who.roles },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { NewTrainingPlan, TrainingEventView, TrainingPlanDetail, TrainingPlans } from "./Training";
import { TeamTraining } from "../../team/TeamTraining";
import { MyTraining } from "../../me/MyTraining";
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
afterEach(() => {
  vi.unstubAllGlobals();
  who.roles = ["HR Manager"];
});

function at(path: string, pattern: string, el: JSX.Element, extra: Array<{ path: string; element: JSX.Element }> = []) {
  const router = createMemoryRouter([{ path: pattern, element: el }, ...extra], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

const TOTALS = { lines: 1, people: 2, scheduled: 0, estimated_direct: 4500, estimated_indirect: 800, estimated: 5300, actual_direct: 0, actual_indirect: 0, actual: 0 };
const NEED = { name: "TRN-1", employee: "HR-EMP-0044", employee_name: "Thandi Mamba", department: "Certification", topic: "ISO/IEC 17025 internal audit", source: "Appraisal", status: "Open" };
const LINE = { name: "ln1", topic: "ISO/IEC 17025 internal audit", quarter: "Q2", reason: "Accreditation", people: 2, needs: [NEED], estimated_direct: 4500, estimated_indirect: 800, can_schedule: false };
const PLAN = { name: "TRP-2026-00001", department: "Certification", year: "2026", status: "Waiting", prepared_by: "hrm@eswasa.co.sz", totals: TOTALS,
  lines: [LINE], deciders: ["hrm2@eswasa.co.sz"], can_edit: false, can_decide: false, approver_note: "Approver provisional (ESWASA A6)." };
const EVENT = { name: "TE-1", event_name: "ISO/IEC 17025 internal audit", event_status: "Scheduled", start_time: "2026-11-02 09:00:00", location: "Mbabane",
  nominees: [{ name: "r1", employee: "HR-EMP-0044", employee_name: "Thandi Mamba", present: null }], team: [{ name: "HR-EMP-0045", employee_name: "Sipho Dlamini" }],
  can_nominate: true, can_record: true, direct_cost: 0, indirect_cost: 0, result_url: "/app/training-result/new?training_event=TE-1" };

describe("Training plans (H17)", () => {
  it("lists department plans with cost and offers to prepare the missing ones", async () => {
    routes = [["/hr/training/plans", { plans: [PLAN], years: ["2026"], departments: ["Certification", "Finance"], can_prepare: true, waiting: 1 }]];
    at("/hr/training", "/hr/training", <TrainingPlans />);
    expect(await screen.findByText("1 waiting for approval.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Certification" })).toHaveAttribute("href", "/hr/training/plans/TRP-2026-00001");
    expect(screen.getByText("5,300.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prepare the plan" })).toHaveAttribute("href", "/hr/training/plans/new?department=Finance&year=2026");
  });

  it("shows who decides and no Schedule while the plan waits", async () => {
    routes = [["/hr/training/plans/TRP-2026-00001", PLAN]];
    at("/hr/training/plans/TRP-2026-00001", "/hr/training/plans/:id", <TrainingPlanDetail />);
    expect(await screen.findByText(/hrm2@eswasa.co.sz decides in Approvals/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull(); // decisions only in Approvals
  });

  it("schedules an approved line with confirm", async () => {
    const approved = { ...PLAN, status: "Approved", deciders: [], approved_by: "hrm2@eswasa.co.sz", lines: [{ ...LINE, can_schedule: true }] };
    routes = [
      ["GET /hr/training/plans/TRP-2026-00001", approved],
      ["POST /hr/training/plans/TRP-2026-00001/lines/ln1/schedule", { ...approved, lines: [{ ...LINE, event: "TE-1", start_time: "2026-11-02 09:00:00" }] }],
    ];
    at("/hr/training/plans/TRP-2026-00001", "/hr/training/plans/:id", <TrainingPlanDetail />);
    fireEvent.click(await screen.findByRole("button", { name: "Schedule" }));
    const dialog = screen.getByRole("dialog", { name: /Schedule ISO/ });
    const [start, end] = Array.from(dialog.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    fireEvent.change(start, { target: { value: "2026-11-02" } });
    fireEvent.change(end, { target: { value: "2026-11-03" } });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ start: "2026-11-02", end: "2026-11-03", confirm: true });
    expect(await screen.findByRole("link", { name: "2 Nov 2026" })).toHaveAttribute("href", "/hr/training/events/TE-1");
  });

  it("walks the new-plan stepper and sends the plan for approval with confirm", async () => {
    routes = [
      ["GET /hr/training/plans", { plans: [], years: ["2026"], departments: ["Certification"], can_prepare: true, waiting: 0 }],
      ["GET /hr/training/needs", { needs: [NEED], open: 1 }],
      ["POST /hr/training/plans", PLAN],
      ["GET /hr/training/plans/TRP-2026-00001", PLAN],
    ];
    nav.to = [];
    at("/hr/training/plans/new", "/hr/training/plans/new", <NewTrainingPlan />);
    fireEvent.change(await screen.findByLabelText("Department"), { target: { value: "Certification" } });
    fireEvent.change(screen.getByLabelText("Plan year"), { target: { value: "2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Line 1 training")).toHaveValue("ISO/IEC 17025 internal audit");
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled(); // no quarter yet
    fireEvent.change(screen.getByLabelText("Line 1 quarter"), { target: { value: "Q2" } });
    fireEvent.change(screen.getByLabelText("Line 1 direct cost"), { target: { value: "4500" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ department: "Certification", year: "2026", submit: true, confirm: true });
    expect((post.body?.lines as Array<Record<string, unknown>>)[0]).toMatchObject({ topic: "ISO/IEC 17025 internal audit", quarter: "Q2", needs: ["TRN-1"], estimated_direct: 4500 });
    await waitFor(() => expect(nav.to).toEqual(["/hr/training/plans/TRP-2026-00001"]));
  });
});

describe("Training event", () => {
  it("records attendance and nominates with confirm", async () => {
    routes = [
      ["GET /hr/training/events/TE-1", EVENT],
      ["POST /hr/training/events/TE-1/attendance", { ...EVENT, nominees: [{ ...EVENT.nominees[0], attendance: "Present", present: true }] }],
      ["POST /hr/training/events/TE-1/nominate", EVENT],
    ];
    at("/hr/training/events/TE-1", "/hr/training/events/:id", <TrainingEventView />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Thandi Mamba attended" }));
    fireEvent.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/attendance"))).toBe(true));
    expect(calls.find((c) => c.url.includes("/attendance"))!.body).toEqual({ rows: [{ employee: "HR-EMP-0044", present: true }], confirm: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "Sipho Dlamini" }));
    fireEvent.click(screen.getByRole("button", { name: "Nominate 1" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/nominate"))).toBe(true));
    expect(calls.find((c) => c.url.includes("/nominate"))!.body).toEqual({ employees: ["HR-EMP-0045"], confirm: true });
    expect(screen.getByRole("link", { name: "Record result" })).toHaveAttribute("href", "/app/training-result/new?training_event=TE-1");
  });
});

describe("Team training (T8)", () => {
  it("nominates a team member for an upcoming course", async () => {
    who.roles = ["Employee"];
    routes = [
      ["GET /hr/team/training", { team: [{ name: "HR-EMP-0044", employee_name: "Thandi Mamba" }], needs: [NEED], events: [{ name: "TE-1", event_name: "ISO/IEC 17025 internal audit", start_time: "2026-11-02 09:00:00", nominated: [] }] }],
      ["POST /hr/training/events/TE-1/nominate", EVENT],
    ];
    at("/team/training", "/team/training", <TeamTraining />);
    expect(await screen.findByText("Thandi Mamba")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nominate" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send nominations" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ employees: ["HR-EMP-0044"], confirm: true });
  });
});

describe("My training (E13)", () => {
  it("shows upcoming courses, needs and past attendance", async () => {
    who.roles = ["Employee"];
    routes = [["/hr/me/training", { employee: "HR-EMP-0044", needs: [{ ...NEED, status: "Planned" }],
      upcoming: [{ event: "TE-1", event_name: "ISO/IEC 17025 internal audit", start_time: "2026-11-02 09:00:00", location: "Mbabane" }],
      history: [{ event: "TE-0", event_name: "Induction", start_time: "2026-03-01 09:00:00", attendance: "Present" }] }]];
    at("/me/training", "/me/training", <MyTraining />);
    expect(await screen.findByText("Nominated")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("Attended")).toBeInTheDocument();
  });

  it("shows empty states when nothing is planned", async () => {
    who.roles = ["Employee"];
    routes = [["/hr/me/training", { employee: "HR-EMP-0044", needs: [], upcoming: [], history: [] }]];
    at("/me/training", "/me/training", <MyTraining />);
    expect(await screen.findByText("No courses coming up")).toBeInTheDocument();
  });
});
