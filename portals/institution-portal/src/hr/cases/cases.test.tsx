/** Cases (J10): register without names, opening, moving on with appeal routing, raising a concern. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hrm@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hrm@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { CaseDetail, CaseNew, CasesView } from "./Cases";
import { DisciplinaryCode } from "./DisciplinaryCode";
import { RaiseConcern } from "../../me/RaiseConcern";
import { settingsResponse } from "../../test/hrSettings";

const OWNERS = [{ user: "hrm@x", name: "Nokuthula Shongwe" }, { user: "ed@x", name: "Executive Director" }];
const REGISTER = {
  can_open: true,
  owners: OWNERS,
  items: [{ id: "HRC-2026-00005", kind: "disciplinary", opened_on: "2026-09-29", stage: "Hearing scheduled", owner_name: "Nokuthula Shongwe", next_step: "Hearing", next_step_due: "2026-10-01", overdue: true, closed: false }],
};
const CASE = {
  id: "HRC-2026-00005", kind: "disciplinary", stage: "Outcome issued", stages: ["Opened", "Investigation", "Hearing scheduled", "Outcome issued", "Appeal", "Closed"],
  next: ["Appeal", "Closed"], opened_on: "2026-09-29", owner: "hrm@x", owner_name: "Nokuthula Shongwe",
  people: [{ employee: "EMP-7", employee_name: "Thandi Mamba", role: "Subject of the case" }], description: "Alleged breach of the impartiality policy",
  outcome: "Final written warning", decided_by: "hrm@x", decided_by_name: "Nokuthula Shongwe", talk_first: false, notes: [{ text: "Hearing held", by: "Nokuthula Shongwe", on: "2026-10-09" }], owners: OWNERS,
};

const OFFENCES = [{ code: "D01", title: "Late coming", level: "Minor", suggested_sanction: "Verbal warning", active: true },
  { code: "D07", title: "Breach of impartiality", level: "Serious", suggested_sanction: "Written warning", active: true }];
const SANCTIONS = ["No action", "Verbal warning", "Written warning", "Final written warning", "Suspension", "Dismissal"];
const HEARING = {
  ...CASE, id: "HRC-2026-00006", stage: "Hearing scheduled", next: ["Outcome issued"], outcome: null, decided_by: null, decided_by_name: null,
  offences: OFFENCES, sanctions: SANCTIONS, warning_months: { "Verbal warning": 3, "Written warning": 6, "Final written warning": null },
};
let code = { items: [] as typeof OFFENCES, can_edit: true, levels: ["Minor", "Serious", "Gross"], sanctions: SANCTIONS, warning_months: { "Verbal warning": null } as Record<string, number | null> };

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub() {
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
      if (url.includes("/hr/me/concerns"))
        return method === "POST"
          ? json({ id: "HR-GRV-2026-0001", raised_on: "2026-10-12", status: "Open", handled_by: "Nokuthula Shongwe" })
          : json({ items: [], categories: ["Working conditions"], handlers: [{ user: "hrm@x", name: "Nokuthula Shongwe" }, { user: "hrm2@x", name: "Lwazi Kunene" }] });
      if (url.includes("/hr/disciplinary/offences")) return json(code);
      if (method === "POST") return json({ ...CASE, stage: "Appeal", next: ["Closed"], appeal_owner_name: "Executive Director" });
      if (url.includes("HRC-2026-00006")) return json(HEARING);
      if (url.includes("/hr/cases/disciplinary/")) return json(CASE);
      if (url.endsWith("/hr/cases")) return json(REGISTER);
      if (url.includes("/hr/employees")) return json({ items: [{ id: "EMP-7", employee_name: "Thandi Mamba", user_id: "hrm@x" }, { id: "EMP-8", employee_name: "Bongani Dube", user_id: "bd@x" }] });
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/hr/cases", element: <CasesView /> },
      { path: "/hr/cases/new", element: <CaseNew /> },
      { path: "/hr/cases/code", element: <DisciplinaryCode /> },
      { path: "/hr/cases/:kind/:id", element: <CaseDetail /> },
      { path: "/me/concern", element: <RaiseConcern /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Cases register (H10)", () => {
  it("lists cases without the people involved and flags an overdue step", async () => {
    stub();
    mount("/hr/cases");
    expect(await screen.findByRole("link", { name: "HRC-2026-00005" })).toHaveAttribute("href", "/hr/cases/disciplinary/HRC-2026-00005");
    expect(screen.queryByText("Thandi Mamba")).not.toBeInTheDocument();
    expect(screen.getByText(/Overdue,/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open a case" })).toBeInTheDocument();
  });
});

describe("Open a case", () => {
  it("won't offer the person involved as the owner", async () => {
    const calls = stub();
    mount("/hr/cases/new");
    fireEvent.change(await screen.findByLabelText(/Person the case is about/), { target: { value: "EMP-7" } });
    const owner = screen.getByLabelText(/^Owner/);
    expect(screen.queryByRole("option", { name: "Nokuthula Shongwe" })).not.toBeInTheDocument();
    fireEvent.change(owner, { target: { value: "ed@x" } });
    fireEvent.change(screen.getByLabelText("What happened"), { target: { value: "Alleged breach" } });
    fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ kind: "disciplinary", employee: "EMP-7", owner: "ed@x", description: "Alleged breach", confirm: true });
  });
});

describe("Case (H10a)", () => {
  it("routes an appeal to someone other than whoever issued the outcome", async () => {
    const calls = stub();
    mount("/hr/cases/disciplinary/HRC-2026-00005");
    expect(await screen.findByText("Thandi Mamba")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Appeal" }));
    const who = screen.getByLabelText(/Appeal heard by/);
    expect(screen.queryByRole("option", { name: "Nokuthula Shongwe" })).not.toBeInTheDocument();
    fireEvent.change(who, { target: { value: "ed@x" } });
    fireEvent.change(screen.getByLabelText("What happened at this step"), { target: { value: "Appeal lodged on 10 Oct" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Appeal" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/act"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/act"))?.body).toMatchObject({ to_stage: "Appeal", appeal_owner: "ed@x", note: "Appeal lodged on 10 Oct", confirm: true });
  });
});

describe("Disciplinary outcome (plan 01)", () => {
  it("pre-fills the sanction from the offence, shows the expiry and sends offence and sanction", async () => {
    const calls = stub();
    mount("/hr/cases/disciplinary/HRC-2026-00006");
    fireEvent.change(await screen.findByLabelText(/^Offence/), { target: { value: "D07" } });
    const sanction = screen.getByLabelText(/^Sanction/) as HTMLSelectElement;
    expect(sanction.value).toBe("Written warning");
    expect(screen.getByText(/Active for 6 months, until/)).toBeInTheDocument();
    fireEvent.change(sanction, { target: { value: "Final written warning" } });
    expect(screen.getByText("Expiry not set: awaiting ESWASA (A1).")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What happened at this step"), { target: { value: "Hearing held" } });
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "Final written warning issued" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Outcome issued" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/act"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/act"))?.body).toMatchObject({ to_stage: "Outcome issued", offence: "D07", sanction: "Final written warning", confirm: true });
  });

  it("links the disciplinary code from the register and shows its empty state", async () => {
    stub();
    mount("/hr/cases");
    expect(await screen.findByRole("link", { name: "Disciplinary code" })).toHaveAttribute("href", "/hr/cases/code");
    mount("/hr/cases/code");
    expect(await screen.findByText("No disciplinary code yet")).toBeInTheDocument();
    expect(screen.getByText("ESWASA to supply its offences and sanctions (A1).")).toBeInTheDocument();
    expect(screen.getByText("Not set: awaiting ESWASA (A1)")).toBeInTheDocument();
  });

  it("lets an HR Manager deactivate an offence", async () => {
    code = { ...code, items: OFFENCES };
    const calls = stub();
    mount("/hr/cases/code");
    fireEvent.click((await screen.findAllByRole("button", { name: "Deactivate" }))[0]);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: expect.stringContaining("/hr/disciplinary/offences/D01"), body: { active: false, confirm: true } });
    code = { ...code, items: [] };
  });
});

describe("Raise a concern (E9)", () => {
  it("lets the employee exclude someone and sends it in confidence", async () => {
    const calls = stub();
    mount("/me/concern");
    fireEvent.change(await screen.findByLabelText("What is it about?"), { target: { value: "Working conditions" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Lwazi Kunene" }));
    fireEvent.change(screen.getByLabelText("What happened"), { target: { value: "Workload doubled since August." } });
    fireEvent.click(screen.getByRole("button", { name: "Send in confidence" }));
    expect(await screen.findByRole("heading", { name: "Your concern has been received" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      description: "Workload doubled since August.", grievance_type: "Working conditions", not_handled_by: ["hrm2@x"], talk_first: true, confirm: true,
    });
  });
});
