/**
 * Declaration journey (J5): E6 signing, the My HR task, and the HR register (H5c).
 * Core is stubbed at fetch; rules are server-side, so the server's refusal text must reach the user.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";

vi.mock("../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "thandi@eswasa.co.sz", full_name: "Thandi Mamba", email: "thandi@eswasa.co.sz", roles: ["Employee", "HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "thandi",
  }),
}));

import { Declaration } from "./Declaration";
import { MyHrHome } from "./MyHrHome";
import { DeclarationsView } from "../hr/DeclarationsView";
import { settingsResponse } from "../test/hrSettings";

const OUTSTANDING = {
  employee: "EMP-44", employee_name: "Thandi Mamba", year: 2026, year_label: "2026/27", status: "outstanding",
  signed_on: null, nothing_else: false, interests: [], look_back_from: "2024-10-12",
  relationships: ["Former employer", "Consultancy client", "Other"],
  confidentiality_text: "I will keep confidential all information about clients…", wording_confirmed: false,
};
const ME = {
  linked: true, employee: { id: "EMP-44", employee_name: "Thandi Mamba" }, line_manager: "Sipho Magagula",
  leave_approver: { user: "sipho@x", name: "Sipho Magagula" }, balances: [], leave: [],
};

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(routes: { decl?: unknown; sign?: { status: number; body: unknown }; register?: unknown }) {
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
      if (url.includes("/hr/me/declaration") && method === "POST") return json(routes.sign?.body, routes.sign?.status ?? 200);
      if (url.includes("/hr/me/declaration")) return json(routes.decl ?? OUTSTANDING);
      if (url.includes("/hr/me")) return json(ME);
      if (url.includes("/hr/impartiality/remind")) return json({ created: 1, without_login: 1, outstanding: 2 });
      if (url.includes("/hr/impartiality")) return json(routes.register);
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/me", element: <Outlet />, children: [{ index: true, element: <MyHrHome /> }, { path: "declaration", element: <Declaration /> }] },
      { path: "/hr/competence/declarations", element: <DeclarationsView /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Sign the declaration (E6)", () => {
  it("walks interests → confidentiality → sign, then shows it on file", async () => {
    const calls = stub({ sign: { status: 200, body: { ...OUTSTANDING, status: "signed", signed_on: "2026-10-12", interests: [{ organisation: "Sample Foods Ltd", relationship: "Former employer", from_date: "2019-01-01", to_date: "2020-12-31" }] } } });
    mount("/me/declaration");
    await screen.findByRole("heading", { name: "Impartiality and confidentiality declaration" });

    const next = () => screen.getByRole("button", { name: "Continue" });
    expect(next()).toBeDisabled(); // nothing listed and nothing ticked
    fireEvent.change(screen.getByLabelText("Organisation"), { target: { value: "Sample Foods Ltd" } });
    expect(await screen.findByText("Finish each organisation")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "Former employer" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2019-01-01" } });
    fireEvent.change(screen.getByLabelText(/^To/), { target: { value: "2020-12-31" } });
    fireEvent.click(next());

    expect(screen.getByText(/I will keep confidential/)).toBeInTheDocument();
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I have read and accept/));
    fireEvent.click(next());

    const signBtn = screen.getByRole("button", { name: "Sign declaration" });
    expect(signBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type your full name to sign"), { target: { value: "Thandi Mamba" } });
    fireEvent.click(signBtn);

    expect(await screen.findByRole("heading", { name: "Declaration signed" })).toBeInTheDocument();
    expect(screen.getByText("Sample Foods Ltd")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({
      interests: [{ organisation: "Sample Foods Ltd", relationship: "Former employer", from_date: "2019-01-01", to_date: "2020-12-31" }],
      nothing_else: false, confidentiality_accepted: true, signed_name: "Thandi Mamba", confirm: true,
    });
  });

  it("shows the server's reason when signing is refused", async () => {
    stub({ sign: { status: 422, body: { detail: "You already signed your 2026/27 declaration." } } });
    mount("/me/declaration");
    await screen.findByRole("heading", { name: "Impartiality and confidentiality declaration" });
    fireEvent.click(screen.getByLabelText(/I have nothing/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByLabelText(/I have read and accept/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Type your full name to sign"), { target: { value: "Thandi Mamba" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign declaration" }));
    expect(await screen.findByText(/already signed your 2026\/27 declaration/)).toBeInTheDocument();
  });
});

describe("My HR task", () => {
  it("asks for the declaration until it is signed", async () => {
    stub({});
    mount("/me");
    expect(await screen.findByText("Sign your 2026/27 impartiality and confidentiality declaration")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign now" })).toHaveAttribute("href", "/me/declaration");
  });
});

describe("Declarations register (H5c)", () => {
  it("lists who hasn't signed and sends reminders", async () => {
    const calls = stub({
      register: { year: 2026, year_label: "2026/27", total: 3, signed: 1, outstanding: [
        { employee: "EMP-61", employee_name: "Lindiwe Simelane", department: "Field Operations", designation: "Auditor", has_login: true },
        { employee: "EMP-90", employee_name: "No Login", department: "ICT", designation: "Technician", has_login: false },
      ] },
    });
    mount("/hr/competence/declarations");
    expect(await screen.findByText("1 of 3 signed. Unsigned staff are excluded from audit and decision work.")).toBeInTheDocument();
    expect(screen.getByText("No portal login: can't sign online")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remind the 2" }));
    expect(await screen.findByText("1 reminder sent")).toBeInTheDocument();
    await waitFor(() => expect(calls.find((c) => c.url.includes("/remind"))?.body).toEqual({ confirm: true }));
  });
});
